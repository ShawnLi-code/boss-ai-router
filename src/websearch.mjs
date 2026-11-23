import { getCompanyIntel, saveCompanyIntel } from "./db.mjs";
import { searchCompaniesViaEgo } from "./ego-worker.mjs";

const VENDORS = ["八方锦程", "全景求是", "i背调", "太和鼎信"];
const SECONDARY_VENDORS = ["人人背调", "知了背调", "较真背调", "第三方背调", "背调公司"];
const STRONG_SIGNALS = [
  "查个税", "个税app", "个人所得税app", "共享屏幕", "查社保",
  "核薪", "银行流水", "工资流水", "薪资流水", "流水截图", "社保参保截图", "录屏",
];
const WEAK_SIGNALS = ["背调", "离职证明", "背景调查"];

const REPUTATION_RULES = [
  { tag: "欠薪/拖欠工资", severity: "danger", re: /欠薪|拖欠工资|没发工资|发不出工资|克扣工资/ },
  { tag: "劳动仲裁/纠纷", severity: "danger", re: /劳动仲裁|劳动纠纷|违法解除|失信被执行|经营异常|限高/ },
  { tag: "PUA/强制加班", severity: "warn", re: /pua|单休|强制加班|血汗|末位淘汰|不推荐人来|劝退/i },
  { tag: "裁员/缩编预警", severity: "warn", re: /大裁员|暴力裁员|变相裁员|裁员/ },
  { tag: "外包/驻场依赖", severity: "warn", re: /外包|驻场|依赖华为|产教融合|劳务派遣/ },
];

export function buildSearchQuery(companyName) {
  return `"${companyName}" (背调 OR 个税 OR 流水 OR 离职证明)`;
}

function isNegated(text, keyword) {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return false;
  const prefix = text.slice(Math.max(0, idx - 6), idx);
  return /(不|无|没有|无需|不用|免|绝非)$/.test(prefix);
}

function extractShortBrand(companyName) {
  return String(companyName || "")
    .replace(/^(?:中国|广东|深圳|广州|北京|上海|杭州|成都|河北|香港)/g, "")
    .replace(/(?:科技游戏|信息技术|网络科技|教育科技|电子科技|广告传媒|数字科技|科技有限公司|有限责任公司|股份有限公司|科技|信息|网络|软件|智能|电子|股份|有限|责任|公司|集团|游戏|传媒|贸易|教育|咨询|服饰|服务|（.*?）|\(.*?\))/g, "")
    .trim();
}

function extractRegisteredName(companyName, shortBrand, items = []) {
  const re = /([\u4e00-\u9fa5]{2,22}(?:股份有限公司|有限责任公司|有限公司))/g;
  const candidates = new Map();
  const stem = shortBrand.slice(0, 2);
  for (const item of items) {
    const text = `${item.title || ""} ${item.snippet || ""}`;
    for (const m of text.matchAll(re)) {
      const cand = m[1];
      if ((shortBrand.length >= 2 && cand.includes(shortBrand)) || (stem.length >= 2 && cand.includes(stem)) || cand.includes(companyName)) {
        candidates.set(cand, (candidates.get(cand) || 0) + 1);
      }
    }
  }
  const sorted = [...candidates.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  return sorted[0]?.[0] || "";
}

function analyzeCreditDetails(items = []) {
  const joined = items.map((i) => `${i.title || ""} ${i.snippet || ""}`).join("\n");
  const estMatch = joined.match(/成立于\s*(20\d{2}|19\d{2})\s*年/);
  const regCapMatch = joined.match(/注册资本\s*([0-9.]+\s*[万亿]?(?:人民币|美元|港元)?)/);
  const paidCapMatch = joined.match(/实缴资本\s*([0-9.]+\s*[万亿]?(?:人民币|美元|港元)?)/);
  const scoreMatch = joined.match(/(?:天眼查|企业)?评分\s*[:：]?\s*(\d{1,3})/);

  const warnings = [];
  let shellRisk = false;
  if (paidCapMatch) {
    const num = parseFloat(paidCapMatch[1]);
    if (!Number.isNaN(num) && (num === 0 || (num < 10 && !paidCapMatch[1].includes("亿")))) {
      shellRisk = true;
      warnings.push(`实缴资本偏低(${paidCapMatch[1]})`);
    }
  }
  if (scoreMatch && Number(scoreMatch[1]) < 50) {
    warnings.push(`三方评分偏低(${scoreMatch[1]})`);
  }
  if (/经营异常|失信|被执行人|严重违法/.test(joined)) {
    shellRisk = true;
    warnings.push("工商异常或司法涉诉记录");
  }

  return {
    established_year: estMatch ? estMatch[1] : "",
    registered_capital: regCapMatch ? regCapMatch[1].trim() : "",
    paid_capital: paidCapMatch ? paidCapMatch[1].trim() : "",
    third_party_score: scoreMatch ? Number(scoreMatch[1]) : null,
    shell_risk: shellRisk,
    warnings,
  };
}

/**
 * 兼容旧签名 analyzeSearchSnippets(companyName, snippets[])
 * 及新三阶段尽调结构 analyzeSearchSnippets(companyName, { creditItems, bgItems, repItems, registeredName })
 */
export function analyzeSearchSnippets(companyName, input = []) {
  const isBatchObj = input && !Array.isArray(input);
  const creditItems = isBatchObj ? (input.creditItems || []) : input;
  const bgItems = isBatchObj ? (input.bgItems || []) : input;
  const repItems = isBatchObj ? (input.repItems || []) : input;
  const allItems = [...bgItems, ...creditItems, ...repItems];

  const shortName = extractShortBrand(companyName);
  const detectedFullName = isBatchObj && input.registeredName
    ? input.registeredName
    : extractRegisteredName(companyName, shortName, creditItems);
  const companyTokens = [companyName, detectedFullName, shortName].filter((t) => t && t.length >= 2);

  const matchedVendors = new Set();
  const matchedSignals = new Set();
  const reputationTags = new Set();
  let hasDangerRep = false;
  const relevantSnippets = [];
  const seenUrls = new Set();

  for (const item of allItems) {
    const text = `${item.title || ""} ${item.snippet || ""}`.trim();
    if (!text) continue;
    const mentionsCompany = companyTokens.some((tok) => text.toLowerCase().includes(tok.toLowerCase()));
    if (!mentionsCompany) continue;

    let itemHit = false;
    for (const v of [...VENDORS, ...SECONDARY_VENDORS]) {
      if (text.toLowerCase().includes(v.toLowerCase()) && !isNegated(text, v)) {
        matchedVendors.add(v);
        itemHit = true;
      }
    }
    for (const sig of STRONG_SIGNALS) {
      if (text.toLowerCase().includes(sig.toLowerCase()) && !isNegated(text, sig)) {
        matchedSignals.add(sig);
        itemHit = true;
      }
    }
    for (const weak of WEAK_SIGNALS) {
      if (text.toLowerCase().includes(weak.toLowerCase()) && !isNegated(text, weak)) {
        if (/严格|委托|第三方|要求|查|必须|发offer前|入职前|要背调|做背调/.test(text)) {
          matchedSignals.add(weak);
          itemHit = true;
        }
      }
    }
    for (const rule of REPUTATION_RULES) {
      if (rule.re.test(text) && !isNegated(text, text.match(rule.re)?.[0] || "")) {
        reputationTags.add(rule.tag);
        if (rule.severity === "danger") hasDangerRep = true;
        itemHit = true;
      }
    }

    const dedupKey = item.url || item.title;
    if (!seenUrls.has(dedupKey) && (itemHit || relevantSnippets.length < 6)) {
      seenUrls.add(dedupKey);
      relevantSnippets.push({
        title: item.title || "",
        snippet: item.snippet || "",
        url: item.url || "",
        matched: itemHit,
      });
    }
  }

  const relevantCreditItems = creditItems.filter((item) => {
    const t = `${item.title || ""} ${item.snippet || ""}`.toLowerCase();
    return companyTokens.some((tok) => t.includes(tok.toLowerCase()));
  });
  const credit = analyzeCreditDetails(relevantCreditItems.length ? relevantCreditItems : relevantSnippets);

  const hit = matchedVendors.size > 0 || [...matchedSignals].some((s) => STRONG_SIGNALS.includes(s));
  const negativeTags = [...reputationTags];
  const healthLevel = hasDangerRep || credit.shell_risk
    ? "DANGER"
    : negativeTags.length > 0 || credit.warnings.length > 0
      ? "CAUTION"
      : "HEALTHY";

  const summaryParts = [];
  if (detectedFullName && detectedFullName !== companyName) summaryParts.push(`核验全称：${detectedFullName}`);
  if (credit.established_year || credit.paid_capital) {
    summaryParts.push([credit.established_year ? `${credit.established_year}年成立` : "", credit.paid_capital ? `实缴${credit.paid_capital}` : ""].filter(Boolean).join("·"));
  }
  if (matchedVendors.size > 0) summaryParts.push(`命中背调机构：${[...matchedVendors].join("、")}`);
  if (matchedSignals.size > 0) summaryParts.push(`查验信号：${[...matchedSignals].join("、")}`);
  if (negativeTags.length > 0) summaryParts.push(`职场风评预警：${negativeTags.join("、")}`);
  if (credit.warnings.length > 0) summaryParts.push(`工商提示：${credit.warnings.join("、")}`);
  if (summaryParts.length === 0) {
    summaryParts.push(relevantSnippets.length ? "已查工商与职场讨论，暂未见第三方背调、欠薪或重大异常" : "公开搜索未见明确背调/查个税流水或负面舆情记录");
  }

  return {
    registered_name: detectedFullName,
    hit_background_check: hit,
    matched_vendors: [...matchedVendors],
    matched_signals: [...matchedSignals],
    credit,
    reputation: {
      health_level: healthLevel,
      negative_tags: negativeTags,
    },
    snippets: relevantSnippets.slice(0, 8),
    summary: summaryParts.join("；"),
  };
}

export async function searchCompaniesBatchIntel(companyNames = [], { force = false, profileId = "Profile 1", onLog = () => {} } = {}) {
  const unique = [...new Set(companyNames.map((s) => String(s || "").trim()).filter(Boolean))];
  const toFetch = [];
  const out = {};

  for (const name of unique) {
    const cached = !force ? getCompanyIntel(name) : null;
    if (cached && cached.search_status === "DONE" && cached.reputation && Object.keys(cached.reputation).length > 0) {
      out[name] = cached;
    } else {
      toFetch.push(name);
    }
  }

  if (toFetch.length === 0) return out;

  try {
    const rawMap = await searchCompaniesViaEgo(toFetch, profileId, onLog);
    for (const name of toFetch) {
      const entry = rawMap[name];
      const query = entry?.query || buildSearchQuery(name);
      if (entry?.blocked) {
        out[name] = saveCompanyIntel({
          company_name: name,
          query,
          search_status: "FAILED",
          hit_background_check: false,
          matched_vendors: [],
          matched_signals: [],
          snippets: [],
          registered_name: "",
          credit: {},
          reputation: {},
          summary: "百度检索触发安全验证，可稍后单独重试",
        });
      } else {
        const analyzed = analyzeSearchSnippets(name, {
          creditItems: entry?.creditItems || [],
          bgItems: entry?.bgItems || entry?.items || [],
          repItems: entry?.repItems || [],
          registeredName: entry?.registeredName || "",
        });
        out[name] = saveCompanyIntel({
          company_name: name,
          query,
          search_status: "DONE",
          ...analyzed,
        });
      }
    }
  } catch (err) {
    for (const name of toFetch) {
      out[name] = saveCompanyIntel({
        company_name: name,
        query: buildSearchQuery(name),
        search_status: "FAILED",
        hit_background_check: false,
        matched_vendors: [],
        matched_signals: [],
        snippets: [],
        registered_name: "",
        credit: {},
        reputation: {},
        summary: `联网补查请求失败（${err.message}），可稍后单独重试`,
      });
    }
  }
  return out;
}

export async function searchCompanyBackgroundIntel(companyName, options = {}) {
  if (!companyName) return null;
  const map = await searchCompaniesBatchIntel([companyName], options);
  return map[companyName] || null;
}
