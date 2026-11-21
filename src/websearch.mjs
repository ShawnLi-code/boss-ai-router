import { getCompanyIntel, saveCompanyIntel } from "./db.mjs";
import { searchCompaniesViaEgo } from "./ego-worker.mjs";

const VENDORS = ["八方锦程", "全景求是", "i背调", "太和鼎信"];
const SECONDARY_VENDORS = ["人人背调", "知了背调", "较真背调", "第三方背调", "背调公司"];
const STRONG_SIGNALS = [
  "查个税", "个税app", "个人所得税app", "共享屏幕", "查社保",
  "核薪", "银行流水", "工资流水", "薪资流水", "流水截图", "社保参保截图", "录屏",
];
const WEAK_SIGNALS = ["背调", "离职证明", "背景调查"];

export function buildSearchQuery(companyName) {
  return `"${companyName}" (背调 OR 个税 OR 流水 OR 离职证明)`;
}

export function analyzeSearchSnippets(companyName, snippets = []) {
  const shortName = companyName
    .replace(/(科技|信息|网络|软件|智能|电子|股份|有限|责任|公司|集团|（.*?）|\(.*?\))/g, "")
    .trim();
  const companyTokens = [companyName, shortName].filter((t) => t && t.length >= 2);

  const matchedVendors = new Set();
  const matchedSignals = new Set();
  const relevantSnippets = [];

  for (const item of snippets) {
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
    if (itemHit || relevantSnippets.length < 4) {
      relevantSnippets.push({
        title: item.title || "",
        snippet: item.snippet || "",
        url: item.url || "",
        matched: itemHit,
      });
    }
  }

  const hit = matchedVendors.size > 0 || [...matchedSignals].some((s) => STRONG_SIGNALS.includes(s));
  const summaryParts = [];
  if (matchedVendors.size > 0) summaryParts.push(`命中背调机构：${[...matchedVendors].join("、")}`);
  if (matchedSignals.size > 0) summaryParts.push(`命中查验信号：${[...matchedSignals].join("、")}`);
  if (summaryParts.length === 0) {
    summaryParts.push(relevantSnippets.length ? "已检索相关讨论，未发现明确第三方背调或查个税实锤" : "公开搜索未见明确背调/查个税流水记录");
  }

  return {
    hit_background_check: hit,
    matched_vendors: [...matchedVendors],
    matched_signals: [...matchedSignals],
    snippets: relevantSnippets.slice(0, 5),
    summary: summaryParts.join("；"),
  };
}

function isNegated(text, keyword) {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return false;
  const prefix = text.slice(Math.max(0, idx - 6), idx);
  return /(不|无|没有|无需|不用|免|绝非)$/.test(prefix);
}

export async function searchCompaniesBatchIntel(companyNames = [], { force = false, profileId = "Profile 1", onLog = () => {} } = {}) {
  const unique = [...new Set(companyNames.map((s) => String(s || "").trim()).filter(Boolean))];
  const toFetch = [];
  const out = {};

  for (const name of unique) {
    const cached = !force ? getCompanyIntel(name) : null;
    if (cached && cached.search_status === "DONE") {
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
          summary: "百度检索触发安全验证，可稍后单独重试",
        });
      } else {
        const analyzed = analyzeSearchSnippets(name, entry?.items || []);
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
