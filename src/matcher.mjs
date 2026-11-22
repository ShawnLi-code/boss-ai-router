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
  { key: "Python自动化", cluster: "automation_api", weight: 1.5, aliases: ["python", "pytest", "unittest", "自动化脚本", "自动化框架"] },
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

export function parseExperienceYears(expText = "", jdText = "") {
  const raw = `${expText || ""} ${jdText || ""}`;
  if (/经验不限|不限经验|应届|在校/.test(expText || "")) {
    return { min: 0, max: 3, label: expText || "经验不限" };
  }
  const range = raw.match(/(\d+)\s*[-~到至]\s*(\d+)\s*年/);
  if (range) return { min: Number(range[1]), max: Number(range[2]), label: `${range[1]}-${range[2]}年` };
  const plus = raw.match(/(\d+)\s*年以上/);
  if (plus) return { min: Number(plus[1]), max: 99, label: `${plus[1]}年以上` };
  if (/1年以内|1年以下/.test(raw)) return { min: 0, max: 1, label: "1年以内" };
  return { min: 1, max: 3, label: expText || "1-3年" };
}

function getCandidateYears(resume) {
  const lbl = String(resume?.years_label || "");
  const m = lbl.match(/(\d+)/);
  if (m) return Number(m[1]);
  return resume?.experiences?.length >= 2 ? 2 : 1;
}

/**
 * 5 维度开源风格 JD-简历加权匹配打分（总分 100）：
 * 1. 核心工作内容重合度 (35)
 * 2. 关键技能栈命中率 · 区分必需/加分 (25)
 * 3. 目标岗位方向契合度 (15)
 * 4. 硬性资历与学历门槛 (15)
 * 5. 项目经历与场景相关性 (10)
 */
export function matchResumeToJob(job, resume) {
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

  // Extract JD & Resume capabilities with Must-Have vs Bonus weighting
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

  // D1: 核心工作内容重合度 (35分)
  const jdDutyCaps = jdCaps.filter((c) => hasCapability(dutyLower, c) || c.tier === "must");
  const dutyDenom = jdDutyCaps.reduce((s, c) => s + c.weight, 0);
  const dutyMatched = jdDutyCaps.filter((c) => hasCapability(workBlobLower, c) || hasCapability(resumeLower, c));
  const dutyNum = dutyMatched.reduce((s, c) => s + c.weight, 0);
  const activeJdClusters = [...new Set(jdCaps.map((c) => c.cluster))];
  const matchedClusters = activeJdClusters.filter((cl) => matchedCaps.some((c) => c.cluster === cl));
  const dutyRatio = dutyDenom > 0 ? dutyNum / dutyDenom : 0.65;
  const clusterRatio = activeJdClusters.length > 0 ? matchedClusters.length / activeJdClusters.length : 0.7;
  const workContentScore = Math.round(Math.min(35, (dutyRatio * 0.68 + clusterRatio * 0.32) * 35));

  // D2: 关键技能栈命中率 (25分)
  const techDenom = jdCaps.reduce((s, c) => s + c.effectiveWeight, 0);
  const techNum = matchedCaps.reduce((s, c) => s + c.effectiveWeight, 0);
  const techStackScore = techDenom > 0 ? Math.round(Math.min(25, (techNum / techDenom) * 25)) : 16;

  // D3: 目标岗位方向契合度 (15分)
  let roleScore = 10;
  const isTargetRoleTitle = /AI应用测试|AI测试|大模型测试|模型评测|AI评测|测试工程师|软件测试|QA|测试开发|AI训练师|提示词工程师|Prompt/i.test(jobTitle);
  const isStrongTechTestOrAi = /测试|评测|评估|Prompt|提示词|RAG|LLM|大模型|AI/i.test(fullJdLower);
  const isOffTarget = /C\+\+驱动|FPGA|芯片验证|射频测试|硬件电路|汽车底盘|电销|销售代表|语音外呼客服/i.test(fullJdLower);
  if (isOffTarget) {
    roleScore = 3;
  } else if (isTargetRoleTitle && isStrongTechTestOrAi) {
    roleScore = 15;
  } else if (isTargetRoleTitle || isStrongTechTestOrAi) {
    roleScore = 12;
  }

  // D4: 硬性资历与学历门槛 (15分)
  const candYears = getCandidateYears(resume);
  const reqExp = parseExperienceYears(job.experience_req, jdText);
  let expPts = 10;
  let expNote = "经验要求匹配（2年经验契合）";
  if (reqExp.min >= 5) {
    expPts = 2;
    expNote = `经验门槛偏高（要求 ${reqExp.label}，当前 ${candYears}年经验）`;
  } else if (reqExp.min >= 3 && candYears < 3) {
    expPts = 6;
    expNote = `经验微跨档（要求 ${reqExp.label}，当前 ${candYears}年可冲刺但需突出主导项目）`;
  }
  const degReq = String(job.education_req || "");
  const eduText = JSON.stringify(resume?.education || []);
  let eduPts = 5;
  if (/硕士|博士/.test(degReq) && !/硕士|博士/.test(eduText)) {
    eduPts = 1;
    expNote += `；学历门槛偏高（要求${degReq}）`;
  }
  const hardGateScore = expPts + eduPts;

  // D5: 项目经历与业务场景相关性 (10分)
  const domainHits = ["web", "saas", "android", "客户端", "自动化", "知识库", "rag", "prompt", "评测", "大模型", "企业", "采购", "营销"]
    .filter((tok) => fullJdLower.includes(tok) && resumeLower.includes(tok));
  const hasQuantifiable = /\d+\+|闭环|独立负责|全流程/.test(resumeBlob);
  const projectScore = Math.min(10, Math.round((domainHits.length >= 3 ? 7 : domainHits.length * 2 + 2) + (hasQuantifiable ? 3 : 1)));

  const matchScore = Math.max(0, Math.min(99, workContentScore + techStackScore + roleScore + hardGateScore + projectScore));

  // 投递建议分级 (BossFlow / job-description-skill 模式)
  const hardBlocked = reqExp.min >= 5 || isOffTarget || job.zone === "SKIP";
  let applyAdvice = "REVISE_FIRST";
  let adviceLabel = "建议微调简历后投";
  let adviceSummary = "";

  if (hardBlocked || matchScore < 55) {
    applyAdvice = "LOW_FIT";
    adviceLabel = "匹配度偏低";
    adviceSummary = isOffTarget
      ? "岗位方向偏离软件测试/AI评测核心赛道，建议跳过。"
      : reqExp.min >= 5
        ? `要求 ${reqExp.label}，硬性年限跨档过大，投递转化率较低。`
        : `工作内容与当前 2 年经历重合度偏低（${matchScore}分），建议优先投高匹配岗位。`;
  } else if (matchScore >= 76 && missingMustHaves.length <= 2) {
    applyAdvice = "DIRECT_APPLY";
    adviceLabel = "可直接投递";
    adviceSummary = `核心工作内容（${matchedClusters.map((c) => CLUSTER_LABELS[c]).join("、") || "质量保障"}）与2年经历高度契合，可直接选模板跳转沟通并附简历。`;
  } else {
    applyAdvice = "REVISE_FIRST";
    adviceLabel = "建议微调简历后投";
    adviceSummary = missingMustHaves.length
      ? `核心基础符合，但 JD 重点考察「${missingMustHaves.slice(0, 3).join("、")}」尚未在简历显式突出，建议微调侧重点导出 PDF 后再投。`
      : `整体匹配尚可（${matchScore}分，${expNote}），建议强化量化成果后投递。`;
  }

  const reviseSuggestions = [];
  if (missingMustHaves.length > 0) {
    reviseSuggestions.push(`若真实具备「${missingMustHaves.slice(0, 3).join("、")}」相关实战，请在个人优势第1-2行与对应项目首句前置写出关键词及指标。`);
  }
  if (missingCaps.some((c) => c.cluster === "ai_eval") && /rag|prompt|大模型|评测/i.test(resumeBlob)) {
    reviseSuggestions.push("可将过往 AI/Prompt/RAG 问答效果验证经验具体化为评测用例规模与准确率提升数据。");
  }
  if (reqExp.min >= 3) {
    reviseSuggestions.push(`该岗要求 ${reqExp.label}，建议着重强调「独立负责测试体系/千条级用例闭环」的成熟度。`);
  }
  if (reviseSuggestions.length === 0) {
    reviseSuggestions.push("核心工作职责与技能已充分覆盖 JD 要求，保持现有 2 年真实时间线直接投递即可。");
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
  const years = resume?.years_label || "2年经验";
  const highlights = matchedKeywords.length
    ? matchedKeywords.slice(0, 3).join("、")
    : "接口自动化、Pytest及AI效果评测";
  const clip = (s) => (s.length > 120 ? `${s.slice(0, 117)}...` : s);

  const direct = clip(
    `您好！看到贵司在招${title}，我有${years}相关实战，熟悉${highlights}并主导过Web与App全流程质量闭环，与岗位日常工作高度契合，可发完整简历进一步沟通！`
  );

  const tech = clip(
    `您好！对贵司${title}很感兴趣。我过往${years}独立承接过千条用例与${highlights}建设，重视用脚本和指标定位核心缺陷与AI效果问题，期待直接沟通具体业务场景！`
  );

  const bridge = clip(
    applyAdvice === "REVISE_FIRST" && missingMustHaves.length
      ? `您好！关注到贵司${title}，我有${years}软件测试与${highlights}实战底座，对${missingMustHaves[0]}方向上手极快，想了解团队当前主要业务侧重并发送简历！`
      : `您好！我具备${years}测试及${highlights}落地经验，过往有B端SaaS与客户端全链路交付背景，很想了解贵司${title}岗位详情，方便发送一份定制简历您参考。`
  );

  return [
    { key: "direct", label: "直接匹配型", text: direct },
    { key: "tech", label: "工作内容深挖型", text: tech },
    { key: "bridge", label: "迁移探底型", text: bridge },
  ];
}

export function buildCustomGreeting(job, resume, matchedKeywords = []) {
  const templates = buildGreetingTemplates(job, resume, matchedKeywords);
  const recruiter = String(job.recruiter_title || "").trim();
  return /总监|经理|CTO|老板|创始人|CEO|Lead/i.test(recruiter) ? templates[1].text : templates[0].text;
}
