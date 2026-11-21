const FINANCING_A_PLUS = [
  "A轮", "A+轮", "Pre-B", "B轮", "B+轮", "C轮", "C+轮", "D轮", "D轮及以上",
  "E轮", "F轮", "已上市", "上市", "IPO", "主板", "创业板", "科创板", "港股", "美股",
];
const FINANCING_B_PLUS = [
  "B轮", "B+轮", "C轮", "C+轮", "D轮", "D轮及以上", "E轮", "F轮", "战略投资",
];
const FINANCING_IPO = ["已上市", "上市", "IPO", "A股", "港股", "美股", "科创板", "创业板", "主板"];

const OUTSOURCING_VENDORS = [
  "软通", "中软", "博彦", "文思海辉", "法本", "德科", "科锐", "诚迈",
  "华钦", "佰钧成", "润和", "宇信", "长亮", "神州信息", "东软", "柯莱特",
  "中电金信", "高伟达", "新致软件", "信雅达", "赢时胜",
];

const SOE_FINANCE_KEYWORDS = [
  "国企", "央企", "国有", "国资", "事业单位", "研究院",
  "银行", "金融", "证券", "基金", "保险", "信托", "期货", "消费金融", "消金", "支付清算", "征信",
];

const OUTSOURCING_JD_KEYWORDS = [
  "驻场", "外包", "人力外派", "劳务派遣", "外派至", "驻点", "外协", "OD",
];

const HR_TITLES = ["HRBP", "猎头", "招聘专家", "TA", "HRG"];
const TECH_LEAD_TITLES = [
  "研发总监", "测试经理", "CTO", "老板", "创始人", "联合创始人", "CEO",
  "技术总监", "测试总监", "QA总监", "研发经理", "总经理",
];

export function parseScaleRange(scaleText = "") {
  const s = String(scaleText).replace(/,/g, "");
  if (!s) return { min: 0, max: 0, bucket: "未知" };
  if (/10000\s*人?以上/.test(s)) return { min: 10000, max: Infinity, bucket: "10000+" };
  if (/1000\s*[-~到]\s*9999/.test(s)) return { min: 1000, max: 9999, bucket: "1000-9999" };
  if (/500\s*[-~到]\s*999/.test(s)) return { min: 500, max: 999, bucket: "500-999" };
  if (/500\s*人?以上/.test(s)) return { min: 500, max: Infinity, bucket: "500+" };
  if (/100\s*[-~到]\s*499/.test(s)) return { min: 100, max: 499, bucket: "100-499" };
  if (/20\s*[-~到]\s*99/.test(s)) return { min: 20, max: 99, bucket: "20-99" };
  if (/0\s*[-~到]\s*20|20人以下/.test(s)) return { min: 0, max: 20, bucket: "0-20" };
  const nums = s.match(/\d+/g)?.map(Number) || [];
  if (nums.length >= 2) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return { min, max, bucket: `${min}-${max}` };
  }
  if (nums.length === 1) {
    return { min: nums[0], max: nums[0], bucket: `${nums[0]}` };
  }
  return { min: 0, max: 0, bucket: s };
}

export function shouldTriggerWebSearch(job) {
  const scale = parseScaleRange(job.scale);
  const fin = String(job.financing || "");
  const scaleHit = scale.min >= 100 || scale.max >= 500;
  const finHit = FINANCING_A_PLUS.some((k) => fin.toUpperCase().includes(k.toUpperCase()));
  return {
    required: scaleHit || finHit,
    reason: scaleHit && finHit
      ? `规模(${job.scale}) >= 100人 且 融资(${job.financing}) >= A轮`
      : scaleHit
        ? `规模(${job.scale}) >= 100人`
        : finHit
          ? `融资阶段(${job.financing}) >= A轮`
          : "规模 < 100人 且 融资 < A轮（无需强制联网补查）",
  };
}

function hasUnnegatedKeyword(text, keywords) {
  const hits = [];
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isAscii = /^[A-Za-z0-9]+$/.test(kw);
    const pattern = isAscii ? `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])` : escaped;
    const flags = isAscii && kw === kw.toUpperCase() ? "g" : "gi";
    const matches = [...String(text).matchAll(new RegExp(pattern, flags))];
    const valid = matches.some((m) => {
      const prefix = String(text).slice(Math.max(0, m.index - 5), m.index);
      return !/(?:不|非|无|免|零|不是|绝非|并非|不做|没有|不涉及|无需|不用)$/.test(prefix);
    });
    if (valid) hits.push(kw);
  }
  return hits;
}

function matchesTitleToken(recruiter, tokens) {
  return tokens.some((k) => {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isAscii = /^[A-Za-z0-9]+$/.test(k);
    const re = isAscii
      ? new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i")
      : new RegExp(escaped, "i");
    return re.test(recruiter);
  });
}

export function parseJobStructure(job) {
  const company = String(job.company_name || "");
  const industry = String(job.industry || "");
  const jd = String(job.jd_text || "");
  const companyIntro = String(job.company_intro || "");
  const title = String(job.job_title || "");
  const recruiter = String(job.recruiter_title || "");
  const financing = String(job.financing || "");
  const scaleInfo = parseScaleRange(job.scale);

  const combinedText = `${company}\n${industry}\n${title}\n${jd}\n${companyIntro}`;
  const soeFinanceHits = hasUnnegatedKeyword(combinedText, SOE_FINANCE_KEYWORDS);
  const vendorHits = OUTSOURCING_VENDORS.filter((v) => company.includes(v));
  const outsourcingJdHits = hasUnnegatedKeyword(`${title}\n${jd}\n${industry}\n${companyIntro}`, [
    ...OUTSOURCING_JD_KEYWORDS,
    "人才外包",
    "业务外包",
    "派遣",
    "人力资源服务",
  ]);

  const isSoeOrFinance = soeFinanceHits.length > 0;
  const isOutsourcing = vendorHits.length > 0 || outsourcingJdHits.length > 0;

  const isIpo = FINANCING_IPO.some((k) => financing.toUpperCase().includes(k.toUpperCase()));
  const isBPlus = FINANCING_B_PLUS.some((k) => financing.toUpperCase().includes(k.toUpperCase()));

  const isHrBpOrHeadhunter = matchesTitleToken(recruiter, HR_TITLES);
  const isTechDirectHire = matchesTitleToken(recruiter, TECH_LEAD_TITLES);

  const strictJdHits = hasUnnegatedKeyword(jd, ["严格背调", "背景调查", "大厂背景", "大厂经验", "一线大厂", "大厂优先", "BAT"]);
  const urgentJdHits = hasUnnegatedKeyword(`${title}\n${jd}`, ["急招", "急聘", "独立负责测试", "独立负责", "0到1", "从0到1", "0-1"]);

  return {
    scale: scaleInfo,
    financing: financing || "未知",
    is_soe_or_finance: isSoeOrFinance,
    soe_finance_hits: soeFinanceHits,
    is_outsourcing: isOutsourcing,
    outsourcing_hits: [...vendorHits, ...outsourcingJdHits],
    is_ipo: isIpo,
    is_b_plus: isBPlus,
    recruiter_role: isTechDirectHire ? "技术直招" : isHrBpOrHeadhunter ? "HRBP/猎头" : "常规招聘者",
    is_tech_direct_hire: isTechDirectHire,
    is_hrbp_or_headhunter: isHrBpOrHeadhunter,
    strict_jd_hits: strictJdHits,
    urgent_jd_hits: urgentJdHits,
  };
}

const STRICT_SCAM_KEYWORDS = [
  "培训贷", "先交费", "收费培训", "实训费用", "转行培训", "零基础包就业", "带薪培训收", "试岗期无薪", "购买课程",
];
const BAIT_NO_EXP_KEYWORDS = ["接受小白", "小白可投", "无经验可", "零基础", "接受转行"];
const BAIT_TRAINING_SIGNALS = ["包教包会", "岗前实训", "项目实训", "产教融合", "推荐就业", "人才孵化"];

export function detectScamOrBait(job) {
  const text = `${job.job_title || ""}\n${job.jd_text || ""}\n${job.company_intro || ""}`;
  const strictHits = hasUnnegatedKeyword(text, STRICT_SCAM_KEYWORDS);
  if (strictHits.length > 0) {
    return { is_scam: true, reasons: strictHits };
  }
  const noExpHits = hasUnnegatedKeyword(text, BAIT_NO_EXP_KEYWORDS);
  const trainHits = hasUnnegatedKeyword(text, BAIT_TRAINING_SIGNALS);
  if (noExpHits.length > 0 && trainHits.length > 0) {
    return { is_scam: true, reasons: [...noExpHits, ...trainHits] };
  }
  return { is_scam: false, reasons: [] };
}

export function evaluateJobRisk(job, intel = null, { blacklisted = null } = {}) {
  const parsed = parseJobStructure(job);
  const scam = detectScamOrBait(job);

  if (blacklisted) {
    return {
      parsed: { ...parsed, scam_reasons: scam.reasons, blacklisted: true },
      risk_score: 100,
      zone: "SKIP",
      recommended_track: "跳过_黑名单企业",
      evidence: [`命中黑名单拦截：${blacklisted.company_name}（${blacklisted.reason || "手动拉黑"}）`],
    };
  }

  if (scam.is_scam) {
    return {
      parsed: { ...parsed, scam_reasons: scam.reasons },
      risk_score: 95,
      zone: "SKIP",
      recommended_track: "跳过_疑似培训或引流",
      evidence: [`反诈/引流闸门拦截：命中小白引流/收费实训特征（${scam.reasons.join("、")}）`],
    };
  }

  let score = 10;
  const evidence = ["基础分：10"];

  // 1. 央国企/银行/金融/大厂驻场外包：+60
  if (parsed.is_soe_or_finance || parsed.is_outsourcing) {
    score += 60;
    const reasons = [...parsed.soe_finance_hits, ...parsed.outsourcing_hits].slice(0, 5);
    evidence.push(`+60：命中央国企/银行金融/驻场外包信号（${reasons.join("、")}）`);
  }

  // 2. 舆情实锤查个税或第三方背调：+50
  if (intel?.hit_background_check) {
    score += 50;
    const vendorPart = intel.matched_vendors?.length ? `机构：${intel.matched_vendors.join("、")}` : "";
    const sigPart = intel.matched_signals?.length ? `实锤信号：${intel.matched_signals.join("、")}` : "";
    evidence.push(`+50：联网舆情实锤查个税或第三方背调（${[vendorPart, sigPart].filter(Boolean).join("；")}）`);
  } else if (intel?.search_status === "DONE") {
    evidence.push("+0：联网补查未发现实锤第三方背调或查个税/社保记录");
  } else if (intel?.search_status === "PENDING" || shouldTriggerWebSearch(job).required) {
    evidence.push("待补查：满足规模>=100人或融资>=A轮，建议执行联网背调补查");
  }

  // 3. 上市/融资/规模（互斥取最高档）
  if (parsed.is_ipo) {
    score += 35;
    evidence.push(`+35：已上市/IPO（${parsed.financing}）`);
  } else if (parsed.is_b_plus || parsed.scale.min >= 500) {
    score += 25;
    evidence.push(`+25：B轮及以上或500人以上（规模：${job.scale || "未知"}，融资：${parsed.financing}）`);
  } else if (parsed.scale.min >= 100 && parsed.scale.min <= 499) {
    score += 10;
    evidence.push(`+10：100-499人规模（${job.scale}）`);
  }

  // 4. 招聘人角色
  if (parsed.is_hrbp_or_headhunter && !parsed.is_tech_direct_hire) {
    score += 15;
    evidence.push(`+15：招聘人为 HRBP/猎头（${job.recruiter_title}）`);
  } else if (parsed.is_tech_direct_hire) {
    score -= 15;
    evidence.push(`-15：招聘人为技术直招/老板（${job.recruiter_title}）`);
  }

  // 5. JD 关键词
  if (parsed.strict_jd_hits.length > 0) {
    score += 15;
    evidence.push(`+15：JD含严格背调/大厂背景要求（${parsed.strict_jd_hits.join("、")}）`);
  }
  if (parsed.urgent_jd_hits.length > 0) {
    score -= 10;
    evidence.push(`-10：JD含急招/独立负责测试/0到1信号（${parsed.urgent_jd_hits.join("、")}）`);
  }

  const risk_score = Math.max(0, Math.min(100, score));
  let zone = "GREEN";
  let recommended_track = "B轨_绿区池";
  if (risk_score >= 60) {
    zone = "RED";
    recommended_track = "A轨_真实日期版";
  } else if (risk_score >= 30) {
    zone = "YELLOW";
    recommended_track = "先探底后定轨";
  }

  if (intel?.summary) {
    evidence.push(`舆情摘要：${intel.summary}`);
  }

  return {
    parsed,
    risk_score,
    zone,
    recommended_track,
    evidence,
  };
}
