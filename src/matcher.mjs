export const DEFAULT_TARGET_ROLES = [
  "AI应用测试",
  "AI测试",
  "软件测试",
  "测试工程师",
  "AI评测",
  "大模型测试工程师",
  "模型评测工程师",
  "AI训练师",
  "提示词工程师",
];

/**
 * 开源 ATS / BossFlow 启发的多维度能力词典：
 * 支持中英文同义词归一（例如 接口自动化 ≈ API测试 ≈ Requests/Postman，Prompt ≈ 提示词）。
 */
export const CAPABILITY_TAXONOMY = [
  // Core QA & Work Content
  { key: "功能测试", cluster: "core_qa", weight: 1.4, aliases: ["功能测试", "黑盒测试", "系统测试", "冒烟测试", "业务测试"] },
  { key: "测试用例", cluster: "core_qa", weight: 1.3, aliases: ["测试用例", "测试计划", "测试方案", "测试报告", "需求评审"] },
  { key: "缺陷管理", cluster: "core_qa", weight: 1.1, aliases: ["缺陷管理", "bug定位", "缺陷跟踪", "复现", "质量保障", "全流程"] },
  { key: "回归测试", cluster: "core_qa", weight: 1.0, aliases: ["回归测试", "集成测试", "联调测试", "验收测试", "uat"] },
  // API & Automation
  { key: "接口测试", cluster: "automation_api", weight: 1.5, aliases: ["接口测试", "api测试", "接口自动化", "postman", "requests", "http接口", "restful"] },
  { key: "Python自动化", cluster: "automation_api", weight: 1.5, aliases: ["python", "pytest", "unittest", "自动化脚本", "自动化框架", "自动化测试"] },
  { key: "UI自动化", cluster: "automation_api", weight: 1.3, aliases: ["playwright", "selenium", "ui自动化", "web自动化", "app自动化", "appium"] },
  { key: "CI/CD持续集成", cluster: "automation_api", weight: 1.1, aliases: ["ci/cd", "cicd", "jenkins", "gitlab", "allure", "git"] },
  // Perf, Infra & DB
  { key: "性能测试", cluster: "perf_infra", weight: 1.2, aliases: ["性能测试", "压测", "压力测试", "jmeter", "locust", "负载测试"] },
  { key: "数据库/SQL", cluster: "perf_infra", weight: 1.2, aliases: ["sql", "mysql", "数据库", "redis", "数据校验"] },
  { key: "Linux/Docker", cluster: "perf_infra", weight: 1.1, aliases: ["linux", "docker", "抓包", "charles", "fiddler", "日志定位"] },
  { key: "多端/兼容性测试", cluster: "perf_infra", weight: 1.1, aliases: ["兼容", "android", "ios", "小程序", "web后台", "客户端"] },
  // AI, LLM, RAG, Eval & Training
  { key: "大模型/AI测试", cluster: "ai_eval", weight: 1.6, aliases: ["大模型", "llm", "ai测试", "ai应用", "生成式ai", "aigc", "智能问答", "对话机器人"] },
  { key: "模型效果评测", cluster: "ai_eval", weight: 1.6, aliases: ["评测", "模型评估", "效果评估", "评测集", "benchmark", "幻觉", "badcase", "准确率", "召回率"] },
  { key: "RAG/知识库", cluster: "ai_eval", weight: 1.5, aliases: ["rag", "知识库", "向量库", "向量检索", "milvus", "chromadb", "embedding"] },
  { key: "Prompt/提示词", cluster: "ai_eval", weight: 1.5, aliases: ["prompt", "提示词", "prompt调优", "提示词工程", "上下文工程"] },
  { key: "Agent/工作流", cluster: "ai_eval", weight: 1.4, aliases: ["agent", "智能体", "dify", "langchain", "coze", "工作流"] },
  { key: "AI训练/微调标注", cluster: "ai_eval", weight: 1.3, aliases: ["ai训练", "语料", "标注", "sft", "rlhf", "微调", "数据集", "质检"] },
];

const CLUSTER_LABELS = {
  core_qa: "功能与全流程质量保障",
  automation_api: "接口与自动化工程",
  perf_infra: "性能/SQL/Linux定位",
  ai_eval: "AI/大模型/RAG/Prompt评测",
};

function normalizeText(text = "") {
  return String(text || "").toLowerCase();
}

function matchesAlias(lowerText, alias) {
  const clean = alias.toLowerCase();
  if (/^[a-z0-9./+-]+$/i.test(clean)) {
    const esc = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "i").test(lowerText);
  }
  return lowerText.includes(clean);
}

function hasCapability(lowerText, cap) {
  return cap.aliases.some((a) => matchesAlias(lowerText, a));
}

function splitMustVsBonus(jdText = "") {
  const lines = String(jdText || "").split(/[\r\n。；;]+/).map((s) => s.trim()).filter(Boolean);
  const mustLines = [];
  const bonusLines = [];
  const dutyLines = [];
  for (const line of lines) {
    if (/加分|优先|了解即可|有.*经验者优先/.test(line)) {
      bonusLines.push(line);
    } else if (/负责|承担|设计|编写|执行|搭建|主导|推动|评测|优化/.test(line)) {
      dutyLines.push(line);
      mustLines.push(line);
    } else {
      mustLines.push(line);
    }
  }
  return {
    mustLower: mustLines.join("\n").toLowerCase(),
    bonusLower: bonusLines.join("\n").toLowerCase(),
    dutyLower: (dutyLines.length ? dutyLines : lines).join("\n").toLowerCase(),
  };
}

export function parseSalaryRangeK(salaryText = "") {
  const raw = String(salaryText || "").trim();
  if (!raw || /面议/.test(raw)) {
    return { min: null, max: null, mid: null, raw, unit: "UNKNOWN" };
  }
  const dayRange = raw.match(/(\d+(?:\.\d+)?)\s*[-~到至]\s*(\d+(?:\.\d+)?)\s*元?\s*\/\s*天/);
  if (dayRange) {
    const min = Number(((Number(dayRange[1]) * 21.75) / 1000).toFixed(1));
    const max = Number(((Number(dayRange[2]) * 21.75) / 1000).toFixed(1));
    return { min, max, mid: Number(((min + max) / 2).toFixed(1)), raw, unit: "DAY" };
  }
  const daySingle = raw.match(/(\d+(?:\.\d+)?)\s*元\s*\/\s*天/);
  if (daySingle) {
    const k = Number(((Number(daySingle[1]) * 21.75) / 1000).toFixed(1));
    return { min: k, max: k, mid: k, raw, unit: "DAY" };
  }
  const rangeK = raw.match(/(\d+(?:\.\d+)?)\s*[-~到至]\s*(\d+(?:\.\d+)?)\s*[kK千]/);
  if (rangeK) {
    const min = Number(rangeK[1]);
    const max = Number(rangeK[2]);
    return { min, max, mid: Number(((min + max) / 2).toFixed(1)), raw, unit: "K" };
  }
  const rangeYuan = raw.match(/(\d{4,5})\s*[-~到至]\s*(\d{4,5})/);
  if (rangeYuan) {
    const min = Number((Number(rangeYuan[1]) / 1000).toFixed(1));
    const max = Number((Number(rangeYuan[2]) / 1000).toFixed(1));
    return { min, max, mid: Number(((min + max) / 2).toFixed(1)), raw, unit: "YUAN" };
  }
  const singleK = raw.match(/(\d+(?:\.\d+)?)\s*[kK千]/);
  if (singleK) {
    const k = Number(singleK[1]);
    return { min: k, max: k, mid: k, raw, unit: "K" };
  }
  return { min: null, max: null, mid: null, raw, unit: "UNKNOWN" };
}

export function evaluateSalaryFit(salaryText = "", settings = {}) {
  const minSalaryK = settings.filter_min_salary_k === "" || settings.filter_min_salary_k == null
    ? 7
    : Number(settings.filter_min_salary_k);
  const targetMinK = Number(settings.target_salary_min_k || 9);
  const targetMaxK = Number(settings.target_salary_max_k || 12);
  const parsed = parseSalaryRangeK(salaryText);

  if (parsed.min === null) {
    return {
      ...parsed,
      tier: "UNKNOWN",
      label: parsed.raw || "面议",
      highlighted: false,
      below_min: false,
      weight_bonus: 0,
      rank: 1,
    };
  }

  if (minSalaryK > 0 && parsed.min < minSalaryK) {
    return {
      ...parsed,
      tier: "BELOW_MIN",
      label: `低于${minSalaryK}K`,
      highlighted: false,
      below_min: true,
      weight_bonus: -15,
      rank: 0,
    };
  }

  const effMax = parsed.max ?? parsed.min;
  const overlap = Math.max(0, Math.min(effMax, targetMaxK) - Math.max(parsed.min, targetMinK));
  const insideStrict = parsed.min >= targetMinK && effMax <= targetMaxK;
  const centeredCore =
    parsed.mid >= targetMinK &&
    parsed.mid <= targetMaxK &&
    parsed.min >= targetMinK - 1 &&
    effMax <= targetMaxK + 1 &&
    overlap >= 2;

  if (insideStrict || centeredCore) {
    return {
      ...parsed,
      tier: "TARGET_EXACT",
      label: `${targetMinK}-${targetMaxK}K理想薪资`,
      highlighted: true,
      below_min: false,
      weight_bonus: 14,
      rank: 4,
    };
  }

  const coversIdealBand =
    overlap >= 1 &&
    parsed.min >= targetMinK - 1 &&
    effMax <= targetMaxK + 4;
  if (coversIdealBand) {
    return {
      ...parsed,
      tier: "TARGET_COVER",
      label: `覆盖${targetMinK}-${targetMaxK}K`,
      highlighted: true,
      below_min: false,
      weight_bonus: 9,
      rank: 3,
    };
  }

  if (effMax <= targetMinK + 1 && parsed.min < targetMinK) {
    return {
      ...parsed,
      tier: "LOWER_OK",
      label: `${minSalaryK}-${targetMinK}K过渡`,
      highlighted: false,
      below_min: false,
      weight_bonus: -3,
      rank: 1,
    };
  }

  return {
    ...parsed,
    tier: parsed.min > targetMaxK ? "ABOVE_TARGET" : "OVERLAP_WIDE",
    label: parsed.min > targetMaxK ? "高薪竞聘" : "区间偏宽",
    highlighted: false,
    below_min: false,
    weight_bonus: parsed.min >= targetMinK && parsed.min <= targetMaxK ? 3 : 0,
    rank: 2,
  };
}

function detectExplicitRemoteCity(job, targetCityName = "广州") {
  const target = String(targetCityName || "广州").replace(/市$/, "").trim();
  if (!target) return "";
  const title = String(job.job_title || "");
  const jdHead = String(job.jd_text || "").slice(0, 260);
  const workAddr = String(job.work_address || "").trim();

  const knownCities = ["北京", "上海", "深圳", "杭州", "成都", "武汉", "南京", "苏州", "芜湖", "西安", "重庆", "长沙", "天津", "青岛", "厦门", "合肥", "郑州"];
  const others = knownCities.filter((c) => c !== target);
  const othersAlternation = others.join("|");

  // 1) 标题或JD明确标注 base / 工作地点在外地
  const explicitRe = new RegExp(`(?:base|工作地点|办公地点|驻地|常驻)[:：\\s【\\(]*?(?:在)?(${othersAlternation})`, "i");
  const titleMatch = title.match(explicitRe) || title.match(new RegExp(`[【\\(（]base\\s*(${othersAlternation})[】\\)）]?`, "i"));
  if (titleMatch?.[1]) return titleMatch[1];

  const jdMatch = jdHead.match(explicitRe);
  if (jdMatch?.[1] && !jdHead.includes(target)) return jdMatch[1];

  // 2) 标题直接指明异地分公司招聘，且无本地地址
  const titleCityMatch = title.match(new RegExp(`(${othersAlternation})(?:公司|翻译|项目|分部|研发)?[|｜·]`));
  if (titleCityMatch?.[1] && !workAddr.includes(target)) return titleCityMatch[1];

  // 3) 已解析的工作地址明确落入外地城市
  if (workAddr && !workAddr.includes(target)) {
    const addrCity = others.find((c) => workAddr.includes(`${c}市`) || workAddr.startsWith(c));
    if (addrCity) return addrCity;
  }
  return "";
}

export function parseExperienceYears(expText = "", jdText = "") {
  const rawExp = String(expText || "").trim();
  const jdExpMatch = String(jdText || "").match(/(\d+\s*[-~到至]\s*\d+\s*年|\d+\s*年以上|1年以内|经验不限)/);
  const combined = rawExp || (jdExpMatch ? jdExpMatch[0] : "");
  if (/经验不限|不限经验/.test(rawExp)) {
    return { min: 0, max: 3, label: rawExp || "经验不限" };
  }
  if (/在校|应届/.test(rawExp)) {
    return { min: 0, max: 1, label: rawExp, isCampus: true };
  }
  if (/(天\/周|个月)/.test(rawExp)) {
    return { min: 0, max: 1, label: rawExp, isInternPeriod: true };
  }
  const range = combined.match(/(\d+)\s*[-~到至]\s*(\d+)\s*年/);
  if (range) return { min: Number(range[1]), max: Number(range[2]), label: `${range[1]}-${range[2]}年` };
  const plus = combined.match(/(\d+)\s*年以上/);
  if (plus) return { min: Number(plus[1]), max: 99, label: `${plus[1]}年以上` };
  if (/1年以内|1年以下/.test(combined)) return { min: 0, max: 1, label: "1年以内" };
  return { min: 1, max: 3, label: rawExp || "1-3年" };
}

function getCandidateYears(resume) {
  const lbl = String(resume?.years_label || "");
  const m = lbl.match(/(\d+)/);
  if (m) return Number(m[1]);
  return resume?.experiences?.length >= 2 ? 2 : 1;
}

/**
 * 第一关：硬性岗位与经验过滤漏斗
 * 1) 过滤实习 / 校招 / 兼职
 * 2) 过滤产品 / 开发 / 算法 / 销售 / 运营 / 硬件路测 / 纯低壁垒标注等非测试岗位
 * 3) 年限分级：优先 1-3年 / 经验不限；3-5年仅当高度测试相关时考虑保留；5-10年淘汰
 */
export function evaluateJobEligibility(job, settings = {}) {
  const title = String(job.job_title || "").trim();
  const jd = String(job.jd_text || "").trim();
  const expReq = String(job.experience_req || "").trim();
  const fullLower = normalizeText(`${title}\n${jd}`);

  const excludeIntern = settings.filter_exclude_intern !== "false";
  const excludeNonQa = settings.filter_exclude_non_qa !== "false";
  const excludeRemote = settings.filter_exclude_remote !== "false";
  const targetCityName = String(settings.search_city_name || "广州").trim();
  const expMode = settings.filter_exp_mode || "prefer_1_3_allow_3_5";
  const salaryFit = evaluateSalaryFit(job.salary_range, settings);

  // 1. 实习 / 兼职 / 校招拦截
  if (excludeIntern) {
    const titleIntern = /实习|兼职|校招|管培生|储备干部|暑期/.test(title);
    const expIntern = /(天\/周|个月|实习|在校|应届)/.test(expReq);
    const jdIntern = /纯线上实习|在校生实习|暑期实习|日常实习|按天计薪|每周至少出勤/.test(jd.slice(0, 220));
    if (titleIntern || expIntern || jdIntern) {
      return {
        eligible: false,
        filter_status: "FILTERED",
        filter_category: "INTERN_OR_PARTTIME",
        filter_reason: `已过滤·实习/校招/兼职（${titleIntern ? "标题含实习/校招" : expReq || "JD实习"}）`,
        qa_relevance: 0,
        exp_tier: "INTERN",
        exp_badge: "实习/校招",
      };
    }
  }

  // 计算软件测试与AI评测相关度
  const titleHasCoreQa = /软件测试|测试工程师|测试开发|测开|AI测试|AI应用测试|大模型测试|模型评测|AI评测|^测试$|功能测试|自动化测试|接口测试|QA|Quality/i.test(title);
  const titleHasSoftTest = /测试|评测/i.test(title);
  const titleHasPromptOrTrainer = /提示词|prompt|ai训练/i.test(title);
  const jdQaCaps = CAPABILITY_TAXONOMY.filter((cap) => hasCapability(normalizeText(jd), cap));
  const coreQaCapsCount = jdQaCaps.filter((c) => ["core_qa", "automation_api", "perf_infra"].includes(c.cluster)).length;
  const aiEvalCapsCount = jdQaCaps.filter((c) => c.cluster === "ai_eval").length;
  const qaRelevance = Math.min(
    100,
    (titleHasCoreQa ? 50 : titleHasSoftTest ? 38 : titleHasPromptOrTrainer ? 28 : 0) +
      Math.min(35, coreQaCapsCount * 7) +
      Math.min(25, aiEvalCapsCount * 7)
  );

  // 2. 非测试类杂岗过滤
  if (excludeNonQa) {
    // A. 硬件 / 驾驶路测 / 车身域整车 / 电子实验室 / 动环电力 / 纯低壁垒标注市场测评
    const offDomainHardware = /自动驾驶.*测试|智能驾驶测试|试驾|安全员|路测员|开车测试|车身域|整车集成|电子元器件|实验室|动环|电力监控|电磁兼容|EMC|安规|射频测试|硬件测试|老化测试|仪器仪表/.test(`${title}\n${jd.slice(0, 400)}`);
    if (offDomainHardware) {
      return {
        eligible: false,
        filter_status: "FILTERED",
        filter_category: "NON_QA_ROLE",
        filter_reason: "已过滤·硬件/车身域/实验室/动环/驾驶路测等非软件AI测试",
        qa_relevance: qaRelevance,
        exp_tier: "OFF_DOMAIN",
        exp_badge: "非软件测试",
      };
    }

    const pureLabelingOrMarket =
      /数据标注员|兼职标注|线上居家办公|居家标注|市场调研|商家服务|商品测评|接受小白|影视类专业|小语种翻译|母语者|native\s*speaker/.test(`${title}\n${jd.slice(0, 360)}`) ||
      (/翻译公司|(?:菲律宾语|印尼语|巴葡语|越南语|泰语|阿拉伯语).*(?:评测|标注)/.test(`${title}\n${jd.slice(0, 260)}`) && coreQaCapsCount < 2) ||
      (/短剧.*评测|视频评测/i.test(title) && coreQaCapsCount < 2);
    if (pureLabelingOrMarket) {
      return {
        eligible: false,
        filter_status: "FILTERED",
        filter_category: "NON_QA_ROLE",
        filter_reason: "已过滤·低壁垒数据标注/外语翻译标注/市场测评",
        qa_relevance: qaRelevance,
        exp_tier: "OFF_DOMAIN",
        exp_badge: "纯标注/翻译",
      };
    }

    // B. 产品 / 运营 / 销售 / 讲师 / 制作 / 行政专员
    const isProductOpsSales = /产品经理|产品专家|产品专员|产品策划|产品助理|销售|商务|BD|客服|运营|讲师|老师|抽卡|漫剧|制作主管|视频剪辑|文案|设计|人力资源/.test(title);
    if (isProductOpsSales && !titleHasSoftTest) {
      return {
        eligible: false,
        filter_status: "FILTERED",
        filter_category: "NON_QA_ROLE",
        filter_reason: "已过滤·产品/运营/销售/内容等非测试岗",
        qa_relevance: qaRelevance,
        exp_tier: "OFF_DOMAIN",
        exp_badge: "产品/运营/销售",
      };
    }

    // C. 纯开发 / 算法 / 架构 / Infra / 解决方案 / AI应用专员
    const isDevOrAlgo = /Java开发|前端开发|后端开发|全栈开发|算法工程师|大模型工程师|AI\s*Infra|架构师|解决方案工程师|实施工程师|应用开发|开发工程师|ai应用工程师|应用专员|落地专员/.test(title);
    if (isDevOrAlgo && !titleHasSoftTest) {
      return {
        eligible: false,
        filter_status: "FILTERED",
        filter_category: "NON_QA_ROLE",
        filter_reason: "已过滤·开发/算法/Infra/落地专员等非测试岗",
        qa_relevance: qaRelevance,
        exp_tier: "OFF_DOMAIN",
        exp_badge: "开发/算法/专员",
      };
    }

    // D. 混合多岗位研发外派池，如 "软件（测试/C/C++/java/python）"
    if (/测试\s*[/／]\s*(C|C\+\+|Java|Python|开发)/i.test(title)) {
      return {
        eligible: false,
        filter_status: "FILTERED",
        filter_category: "NON_QA_ROLE",
        filter_reason: "已过滤·多方向混合研发外派池（非专注测试岗位）",
        qa_relevance: qaRelevance,
        exp_tier: "OFF_DOMAIN",
        exp_badge: "混合外派池",
      };
    }

    // E. 提示词/AI训练师纯度校验 + 兜底测试相关性门槛
    if (titleHasPromptOrTrainer && !titleHasSoftTest) {
      const validPromptOrTrainer = aiEvalCapsCount >= 2 && !/抽卡|漫剧|视频剪辑|电商文案/.test(fullLower);
      if (!validPromptOrTrainer) {
        return {
          eligible: false,
          filter_status: "FILTERED",
          filter_category: "NON_QA_ROLE",
          filter_reason: "已过滤·非工程评测向提示词/AI训练岗",
          qa_relevance: qaRelevance,
          exp_tier: "OFF_DOMAIN",
          exp_badge: "非评测向",
        };
      }
    }

    if (!titleHasSoftTest && !titleHasPromptOrTrainer && qaRelevance < 45) {
      return {
        eligible: false,
        filter_status: "FILTERED",
        filter_category: "NON_QA_ROLE",
        filter_reason: "已过滤·标题与JD均未体现软件/AI测试核心职责",
        qa_relevance: qaRelevance,
        exp_tier: "OFF_DOMAIN",
        exp_badge: "非测试岗",
      };
    }
  }

  // 2.5 最低薪资门槛过滤（起薪低于最低期望默认 7K 直接淘汰）
  if (salaryFit.below_min) {
    return {
      eligible: false,
      filter_status: "FILTERED",
      filter_category: "SALARY_TOO_LOW",
      filter_reason: `已过滤·起薪低于 ${settings.filter_min_salary_k ?? 7}K（${job.salary_range || salaryFit.raw}）`,
      qa_relevance: qaRelevance,
      exp_tier: "LOW_SALARY",
      exp_badge: salaryFit.label,
    };
  }

  // 2.6 异地/跨城工作地过滤（防止 Boss 搜索混入 base杭州/北京/芜湖/外市工作地）
  if (excludeRemote) {
    const remoteCity = detectExplicitRemoteCity(job, targetCityName);
    if (remoteCity) {
      return {
        eligible: false,
        filter_status: "FILTERED",
        filter_category: "REMOTE_CITY",
        filter_reason: `已过滤·非${targetCityName}工作地（检测到「${remoteCity}」）`,
        qa_relevance: qaRelevance,
        exp_tier: "REMOTE",
        exp_badge: `异地·${remoteCity}`,
      };
    }
  }

  // 3. 经验年限筛选机制：1-3年最高权重全留；3-5年仅高度相关测试可留；5年以上淘汰
  const reqExp = parseExperienceYears(expReq, jd);
  if (expMode !== "all") {
    if (reqExp.min >= 5) {
      return {
        eligible: false,
        filter_status: "FILTERED",
        filter_category: "EXP_OUT_OF_RANGE",
        filter_reason: `已过滤·经验要求 ${reqExp.label}（超出 1-3年 / 3-5年冲刺上限）`,
        qa_relevance: qaRelevance,
        exp_tier: "TOO_HIGH",
        exp_badge: `${reqExp.label}超档`,
      };
    }
    if (reqExp.min >= 3) {
      if (expMode === "1_3_only") {
        return {
          eligible: false,
          filter_status: "FILTERED",
          filter_category: "EXP_OUT_OF_RANGE",
          filter_reason: `已过滤·当前设定仅保留 1-3年及不限（该岗要求 ${reqExp.label}）`,
          qa_relevance: qaRelevance,
          exp_tier: "STRETCH_3_5",
          exp_badge: `${reqExp.label}`,
        };
      }
      const highlyQaRelated = titleHasCoreQa && (coreQaCapsCount >= 2 || aiEvalCapsCount >= 2) && qaRelevance >= 62;
      if (!highlyQaRelated) {
        return {
          eligible: false,
          filter_status: "FILTERED",
          filter_category: "EXP_OUT_OF_RANGE",
          filter_reason: `已过滤·要求 ${reqExp.label} 且测试核心匹配度不足以冲刺`,
          qa_relevance: qaRelevance,
          exp_tier: "STRETCH_3_5",
          exp_badge: `${reqExp.label}·相关性不足`,
        };
      }
      return {
        eligible: true,
        filter_status: "PASS",
        filter_category: "PASS",
        filter_reason: "",
        qa_relevance: qaRelevance,
        exp_tier: "STRETCH_3_5",
        exp_badge: "3-5年·测试强相关可冲刺",
      };
    }
  }

  return {
    eligible: true,
    filter_status: "PASS",
    filter_category: "PASS",
    filter_reason: "",
    qa_relevance: qaRelevance,
    exp_tier: "IDEAL_1_3",
    exp_badge: reqExp.label === "经验不限" ? "经验不限·契合" : "1-3年黄金契合",
  };
}

/**
 * 5 维度开源风格 JD-简历加权匹配打分（总分 100）：
 * 1. 核心工作内容重合度 (35)
 * 2. 关键技能栈命中率 · 区分必需/加分 (25)
 * 3. 目标岗位方向契合度 (15)
 * 4. 硬性资历与学历门槛 (15)
 * 5. 项目经历与场景相关性 (10)
 */
export function matchResumeToJob(job, resume, settings = {}) {
  const eligibility = evaluateJobEligibility(job, settings);
  const jobTitle = String(job.job_title || "");
  const jdText = String(job.jd_text || "");
  const fullJdLower = normalizeText(`${jobTitle}\n${jdText}`);
  const { mustLower, bonusLower, dutyLower } = splitMustVsBonus(jdText);

  const resumeBlob = [
    resume?.summary || "",
    ...(resume?.skills || []),
    ...(resume?.experiences || []).map((e) => `${e.company || ""} ${e.role || ""} ${e.content || ""}`),
    ...(resume?.projects || []).map((p) => `${p.name || ""} ${p.role || ""} ${p.content || ""}`),
    resume?.raw_text || "",
  ].join("\n");
  const resumeLower = normalizeText(resumeBlob);
  const workBlobLower = normalizeText([
    resume?.summary || "",
    ...(resume?.experiences || []).map((e) => `${e.role || ""} ${e.content || ""}`),
    ...(resume?.projects || []).map((p) => `${p.name || ""} ${p.role || ""} ${p.content || ""}`),
  ].join("\n"));

  const jdCaps = CAPABILITY_TAXONOMY.filter((cap) => hasCapability(fullJdLower, cap)).map((cap) => {
    const inMust = hasCapability(mustLower, cap) || hasCapability(normalizeText(jobTitle), cap);
    const inBonus = !inMust && hasCapability(bonusLower, cap);
    return {
      ...cap,
      tier: inBonus ? "bonus" : "must",
      effectiveWeight: cap.weight * (inBonus ? 0.7 : 1.5),
    };
  });

  const matchedCaps = jdCaps.filter((c) => hasCapability(resumeLower, c));
  const missingCaps = jdCaps.filter((c) => !hasCapability(resumeLower, c));
  const matchedKeywords = matchedCaps.map((c) => c.key);
  const missingKeywords = missingCaps.map((c) => c.key);
  const missingMustHaves = missingCaps.filter((c) => c.tier === "must").map((c) => c.key);

  // D1: 核心工作内容重合度 (35分) — 修复空/无测试JD默认给高分的漏洞
  const jdDutyCaps = jdCaps.filter((c) => hasCapability(dutyLower, c) || c.tier === "must");
  const dutyDenom = jdDutyCaps.reduce((s, c) => s + c.weight, 0);
  const dutyMatched = jdDutyCaps.filter((c) => hasCapability(workBlobLower, c) || hasCapability(resumeLower, c));
  const dutyNum = dutyMatched.reduce((s, c) => s + c.weight, 0);
  const activeJdClusters = [...new Set(jdCaps.map((c) => c.cluster))];
  const matchedClusters = activeJdClusters.filter((cl) => matchedCaps.some((c) => c.cluster === cl));

  let workContentScore = 4;
  if (jdCaps.length > 0 && dutyDenom > 0) {
    const dutyRatio = dutyNum / dutyDenom;
    const clusterRatio = matchedClusters.length / activeJdClusters.length;
    workContentScore = Math.round(Math.min(35, (dutyRatio * 0.68 + clusterRatio * 0.32) * 35));
  } else if (/测试|评测/.test(jobTitle) && jdText.length > 20) {
    workContentScore = 18;
  }

  // D2: 关键技能栈命中率 (25分)
  const techDenom = jdCaps.reduce((s, c) => s + c.effectiveWeight, 0);
  const techNum = matchedCaps.reduce((s, c) => s + c.effectiveWeight, 0);
  const techStackScore =
    jdCaps.length === 0
      ? 4
      : techDenom > 0
        ? Math.round(Math.min(25, (techNum / techDenom) * 25))
        : 6;

  // D3: 目标岗位方向契合度 (15分)
  let roleScore = 4;
  const isPureQaOrAiTest = /AI应用测试|AI测试|大模型测试|模型评测|AI评测|测试工程师|软件测试|QA|测试开发|测开|^测试$/i.test(jobTitle);
  const isPromptOrTrainer = /提示词|Prompt|AI训练/i.test(jobTitle);
  if (!eligibility.eligible && eligibility.filter_category === "NON_QA_ROLE") {
    roleScore = 2;
  } else if (isPureQaOrAiTest && jdCaps.length > 0) {
    roleScore = 15;
  } else if (isPureQaOrAiTest) {
    roleScore = 13;
  } else if (isPromptOrTrainer && eligibility.qa_relevance >= 40) {
    roleScore = 11;
  } else if (/测试|评测/i.test(jobTitle)) {
    roleScore = 12;
  }

  // D4: 硬性资历与学历门槛 (15分)
  const candYears = getCandidateYears(resume);
  const reqExp = parseExperienceYears(job.experience_req, jdText);
  let expPts = 10;
  let expNote = "经验要求契合（1-3年/不限黄金档）";
  if (reqExp.min >= 5) {
    expPts = 1;
    expNote = `经验门槛超档（要求 ${reqExp.label}，当前 ${candYears}年经验）`;
  } else if (reqExp.min >= 3) {
    expPts = eligibility.eligible ? 7 : 4;
    expNote = eligibility.eligible
      ? `3-5年强相关测试岗，可冲刺（建议微调简历突出独立测试闭环）`
      : `要求 ${reqExp.label}，当前 ${candYears}年经验偏弱`;
  } else if (eligibility.filter_category === "INTERN_OR_PARTTIME") {
    expPts = 2;
    expNote = `实习/校招岗（${reqExp.label}）`;
  }

  const degReq = String(job.education_req || "");
  const eduText = JSON.stringify(resume?.education || []);
  let eduPts = 5;
  if (/硕士|博士/.test(degReq) && !/硕士|博士/.test(eduText)) {
    eduPts = 1;
    expNote += `；学历要求${degReq}`;
  }
  const hardGateScore = expPts + eduPts;

  // D5: 项目经历与业务场景相关性 (10分)
  const domainHits = ["web", "saas", "android", "客户端", "自动化", "知识库", "rag", "prompt", "评测", "大模型", "企业", "采购", "营销"]
    .filter((tok) => fullJdLower.includes(tok) && resumeLower.includes(tok));
  const hasQuantifiable = /\d+\+|闭环|独立负责|全流程/.test(resumeBlob);
  const projectScore =
    jdCaps.length === 0
      ? 2
      : Math.min(10, Math.round((domainHits.length >= 3 ? 7 : domainHits.length * 2 + 2) + (hasQuantifiable ? 3 : 1)));

  const salaryFit = evaluateSalaryFit(job.salary_range, settings);
  const coreScore = workContentScore + techStackScore + roleScore + hardGateScore + projectScore;
  const matchScore = Math.max(0, Math.min(99, coreScore + salaryFit.weight_bonus));

  // 投递建议分级
  const hardBlocked = !eligibility.eligible || reqExp.min >= 5 || job.zone === "SKIP";
  let applyAdvice = "REVISE_FIRST";
  let adviceLabel = "建议微调简历后投";
  let adviceSummary = "";

  const yearsDesc = resume?.years_label || "当前简历";
  if (!eligibility.eligible) {
    applyAdvice = "LOW_FIT";
    adviceLabel = "已过滤";
    adviceSummary = eligibility.filter_reason;
  } else if (hardBlocked || matchScore < 55) {
    applyAdvice = "LOW_FIT";
    adviceLabel = "匹配偏低";
    adviceSummary = `岗位核心职责与${yearsDesc}测试经历重合度偏低（${matchScore}分），建议优先沟通高契合测试岗。`;
  } else if (eligibility.exp_tier === "STRETCH_3_5") {
    applyAdvice = "REVISE_FIRST";
    adviceLabel = "3-5年可冲刺";
    adviceSummary = `虽标 3-5 年但高度聚焦测试工作（命中：${matchedKeywords.slice(0, 4).join("、") || "软件测试"}），可在招呼语中突出自研平台与自动化闭环直接冲刺。`;
  } else if (coreScore >= 72 && matchScore >= 76 && missingMustHaves.length <= 2) {
    applyAdvice = "DIRECT_APPLY";
    adviceLabel = "强烈推荐沟通";
    adviceSummary = `经验要求与核心工作内容（${matchedClusters.map((c) => CLUSTER_LABELS[c]).join("、") || "软件质量保障"}）高度契合，建议直接一键打招呼并附图片简历。`;
  } else {
    applyAdvice = "REVISE_FIRST";
    adviceLabel = "匹配良好·可沟通";
    adviceSummary = missingMustHaves.length
      ? `核心测试栈契合，JD 额外关注「${missingMustHaves.slice(0, 3).join("、")}」，可在打招呼话术中突出相近实战快速破冰。`
      : `整体契合度良好（${matchScore}分，${expNote}），可直接打招呼沟通具体业务场景。`;
  }
  if (eligibility.eligible && salaryFit.highlighted) {
    adviceSummary += ` 薪资「${job.salary_range}」命中 ${salaryFit.label}（权重 +${salaryFit.weight_bonus} 分）。`;
  }

  const reviseSuggestions = [];
  if (missingMustHaves.length > 0 && eligibility.eligible) {
    reviseSuggestions.push(`若真实具备「${missingMustHaves.slice(0, 3).join("、")}」相关实战，请在个人优势第1-2行与对应项目首句前置写出关键词及指标。`);
  }
  if (missingCaps.some((c) => c.cluster === "ai_eval") && /rag|prompt|大模型|评测/i.test(resumeBlob)) {
    reviseSuggestions.push("可将过往 AI/Prompt/RAG 问答效果验证经验具体化为评测用例规模与准确率提升数据。");
  }
  if (eligibility.exp_tier === "STRETCH_3_5") {
    reviseSuggestions.push("该岗要求 3-5年，建议前置突出「独立负责全流程测试体系/千条级用例/自动化提效闭环」成熟度。");
  }
  if (reviseSuggestions.length === 0 && eligibility.eligible) {
    reviseSuggestions.push("核心工作职责与 2 年真实经历契合度高，保持现有时间线直接投递即可。");
  }

  const baseExperiences = resume?.experiences || [];
  const baseProjects = resume?.projects || [];
  const tailoredSummary = buildTailoredSummary(job, resume, matchedKeywords, missingMustHaves);
  const tailoredProjects = baseProjects.map((proj) => ({
    ...proj,
    highlighted: jdCaps.some((cap) => hasCapability(normalizeText(proj.content || ""), cap)),
    tailored_note: matchedKeywords.length
      ? `前置突出：${matchedKeywords.slice(0, 4).join("、")} 对应场景的测试闭环与量化成果`
      : "补充与该岗位直接相关的测试覆盖与缺陷闭环数据",
  }));
  const tailoredExperiences = baseExperiences.map((exp) => ({
    ...exp,
    tailored_focus: missingMustHaves.length
      ? `可按真实经历前置强调与「${missingMustHaves.slice(0, 3).join("、")}」相关的工程协作细节`
      : "当前工作职责与 JD 核心要求吻合度高，保留真实数据成果即可",
  }));

  const greetingTemplates = buildGreetingTemplates(job, resume, matchedKeywords, missingMustHaves, applyAdvice);
  const isTechRecruiter = /总监|经理|CTO|老板|创始人|CEO|Lead/i.test(job.recruiter_title || "");
  const defaultTemplate = isTechRecruiter
    ? greetingTemplates[1]
    : applyAdvice === "REVISE_FIRST"
      ? greetingTemplates[2]
      : greetingTemplates[0];

  const tailoredResume = {
    track_key: resume?.track_key || "A",
    years_label: resume?.years_label || "2年经验",
    candidate_name: resume?.candidate_name || "",
    original_summary: resume?.summary || "",
    tailored_summary: tailoredSummary,
    emphasized_skills: [...new Set([...matchedKeywords, ...(resume?.skills || [])])].slice(0, 14),
    experiences: tailoredExperiences,
    projects: tailoredProjects,
    education: resume?.education || [],
    gap_tips: reviseSuggestions.join(" "),
  };
  tailoredResume.fact_guard = factGuardCheck(resume, tailoredResume);

  return {
    match_score: matchScore,
    apply_advice: applyAdvice,
    advice_label: adviceLabel,
    advice_summary: adviceSummary,
    eligibility,
    salary_fit: salaryFit,
    dimensions: {
      work_content: { score: workContentScore, max: 35, label: "工作内容重合" },
      tech_stack: { score: techStackScore, max: 25, label: "技能栈命中" },
      role_alignment: { score: roleScore, max: 15, label: "岗位方向契合" },
      hard_gate: { score: hardGateScore, max: 15, label: "资历门槛", note: expNote },
      project_context: { score: projectScore, max: 10, label: "项目场景相关" },
    },
    matched_clusters: matchedClusters.map((c) => CLUSTER_LABELS[c]),
    matched_keywords: matchedKeywords,
    missing_keywords: missingKeywords,
    missing_must_haves: missingMustHaves,
    revise_suggestions: reviseSuggestions,
    greeting_templates: greetingTemplates,
    custom_greeting: defaultTemplate.text,
    tailored_resume: tailoredResume,
  };
}

/**
 * 事实锁校验：确保动态改写后的简历未篡改原始公司名称、工作起止日期与教育背景
 */
export function factGuardCheck(originalResume, tailoredResume) {
  const issues = [];
  const origExps = originalResume?.experiences || [];
  const tailExps = tailoredResume?.experiences || [];

  if (origExps.length !== tailExps.length) {
    issues.push(`工作经历段数发生变化（原 ${origExps.length} 段 -> 改写后 ${tailExps.length} 段）`);
  } else {
    for (let i = 0; i < origExps.length; i++) {
      if ((origExps[i].company || "") !== (tailExps[i].company || "")) {
        issues.push(`公司名称被修改：${origExps[i].company} -> ${tailExps[i].company}`);
      }
      if ((origExps[i].period || "") !== (tailExps[i].period || "")) {
        issues.push(`工作时间线被修改：${origExps[i].period} -> ${tailExps[i].period}`);
      }
    }
  }

  const origEdu = JSON.stringify(originalResume?.education || []);
  const tailEdu = JSON.stringify(tailoredResume?.education || []);
  if (origEdu !== tailEdu) {
    issues.push("教育背景字段与母版不一致");
  }

  return {
    passed: issues.length === 0,
    issues,
    checked_at: new Date().toISOString(),
  };
}

function buildTailoredSummary(job, resume, matched, missingMustHaves) {
  const base = (resume?.summary || "").trim();
  const focus = matched.length ? matched.slice(0, 5).join(" / ") : "软件与AI应用全流程质量保障";
  const roleHint = job.job_title || "AI测试工程师";
  const prefix = `【针对「${job.company_name || "目标团队"} · ${roleHint}」适配侧重】重点突出 ${focus} 实战交付经验。`;
  if (!base) {
    return `${prefix}具备 2 年软件与 AI 应用测试实战经验，熟悉功能/接口/自动化测试体系及大模型 RAG/Prompt 效果验证。`;
  }
  const gapHint = missingMustHaves.length ? `\n（建议按真实项目酌情补充：${missingMustHaves.slice(0, 3).join("、")}）` : "";
  return `${prefix}\n${base}${gapHint}`;
}

export function buildGreetingTemplates(job, resume, matchedKeywords = [], missingMustHaves = [], applyAdvice = "DIRECT_APPLY") {
  const title = job.job_title || "测试工程师";
  const years = resume?.years_label || "1年经验";
  const highlights = matchedKeywords.length
    ? matchedKeywords.slice(0, 3).join("、")
    : "大模型评测、Python接口自动化及流式压测";
  const clip = (s) => (s.length > 120 ? `${s.slice(0, 117)}...` : s);

  const direct = clip(
    `您好！看到贵司在招${title}，我有${years}AI应用与软件测试实战，熟悉${highlights}并主导过端云与SaaS全链路质量闭环，最快一周到岗，盼发简历详聊！`
  );

  const tech = clip(
    `您好！对贵司${title}很感兴趣。过往独立负责千条评测基线、${highlights}及自研测试平台落地，擅长用自动化脚本与抓包排障闭环线上问题，期待沟通！`
  );

  const bridge = clip(
    applyAdvice === "REVISE_FIRST" && missingMustHaves.length
      ? `您好！关注到贵司${title}岗位，我具备扎实的${highlights}与全链路测试开发底座，对${missingMustHaves[0]}业务场景上手很快，方便发份简历请您看看吗？`
      : `您好！我有${years}软件与AI测试经验，熟练掌握${highlights}与高并发压测排障，与贵司${title}日常工作很契合，希望能发份简历和您交流！`
  );

  return [
    { key: "direct", label: "高匹配直投", text: direct },
    { key: "tech", label: "突出技术成果", text: tech },
    { key: "bridge", label: "精炼礼貌破冰", text: bridge },
  ];
}

export function buildCustomGreeting(job, resume, matchedKeywords = []) {
  const templates = buildGreetingTemplates(job, resume, matchedKeywords);
  const recruiter = String(job.recruiter_title || "").trim();
  return /总监|经理|CTO|老板|创始人|CEO|Lead/i.test(recruiter) ? templates[1].text : templates[0].text;
}

/**
 * 根据话术风格标识（auto / direct / tech / bridge / llm）从岗位预设话术中选取对应文案。
 */
export function pickGreetingByTemplateStyle(job = {}, templateStyle = "auto") {
  const style = String(templateStyle || "auto").trim();
  const templates = Array.isArray(job.match?.greeting_templates) ? job.match.greeting_templates : [];
  if (style && style !== "auto") {
    const found = templates.find((t) => t.key === style);
    if (found?.text) return found.text;
  }
  return job.custom_greeting || templates[0]?.text || "";
}
