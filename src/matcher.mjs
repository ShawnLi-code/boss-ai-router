const AI_TEST_KEYWORDS = [
  "AI测试", "大模型测试", "LLM", "RAG", "Agent", "Prompt", "评测", "评估",
  "自动化测试", "Pytest", "Playwright", "Python", "接口测试", "性能测试",
  "JMeter", "Locust", "CI/CD", "Docker", "SQL", "LangChain", "Dify",
  "多模态", "微调", "幻觉", "安全测试", "测试开发", "质量保障", "QA",
  "测试用例", "回归测试", "Linux", "Git", "FastAPI", "React",
];

function extractKeywords(text = "") {
  const lower = String(text).toLowerCase();
  return AI_TEST_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
}

export function matchResumeToJob(job, resume) {
  const jdText = `${job.job_title || ""}\n${job.jd_text || ""}`;
  const jdKeywords = extractKeywords(jdText);

  const resumeBlob = [
    resume?.summary || "",
    ...(resume?.skills || []),
    ...(resume?.experiences || []).map((e) => `${e.company || ""} ${e.role || ""} ${e.content || ""}`),
    ...(resume?.projects || []).map((p) => `${p.name || ""} ${p.role || ""} ${p.content || ""}`),
    resume?.raw_text || "",
  ].join("\n");

  const resumeKeywords = extractKeywords(resumeBlob);
  const matched = jdKeywords.filter((kw) =>
    resumeKeywords.some((rk) => rk.toLowerCase() === kw.toLowerCase())
  );
  const missing = jdKeywords.filter((kw) => !matched.includes(kw));

  let matchScore = 62;
  if (jdKeywords.length > 0) {
    const ratio = matched.length / jdKeywords.length;
    matchScore = Math.round(45 + ratio * 50);
  }
  if (/AI|大模型|LLM|RAG|Agent|智能体|测试/i.test(job.job_title || "") && /RAG|LLM|测试|Prompt/i.test(resumeBlob)) {
    matchScore = Math.min(98, matchScore + 5);
  }

  // 动态调整简历高亮与项目侧重（不篡改日期与公司真实性，仅调整突出重点与排序）
  const baseExperiences = resume?.experiences || [];
  const baseProjects = resume?.projects || [];

  const tailoredSummary = buildTailoredSummary(job, resume, matched, missing);
  const tailoredProjects = baseProjects.map((proj) => ({
    ...proj,
    highlighted: jdKeywords.some((kw) => (proj.content || "").toLowerCase().includes(kw.toLowerCase())),
    tailored_note: matched.length
      ? `建议前置突出：${matched.slice(0, 4).join("、")} 对应场景的评测指标与落地成果`
      : "建议补充与该岗位直接相关的测试闭环数据",
  }));

  const tailoredExperiences = baseExperiences.map((exp) => ({
    ...exp,
    tailored_focus: missing.length
      ? `可补充或强调与「${missing.slice(0, 3).join("、")}」相关的真实测试协作案例`
      : "当前工作经历与 JD 核心能力匹配度较高，保持数据化结果表述",
  }));

  const custom_greeting = buildCustomGreeting(job, resume, matched);

  const tailoredResume = {
    track_key: resume?.track_key || "B",
    years_label: resume?.years_label || "",
    candidate_name: resume?.candidate_name || "",
    original_summary: resume?.summary || "",
    tailored_summary: tailoredSummary,
    emphasized_skills: [...new Set([...matched, ...(resume?.skills || [])])].slice(0, 12),
    experiences: tailoredExperiences,
    projects: tailoredProjects,
    education: resume?.education || [],
    gap_tips: missing.length
      ? `当前 JD 提及但简历显式命中较弱的关键词：${missing.join("、")}（建议仅在真实做过的前提下补充）`
      : "核心技术栈已全面覆盖 JD 关键词",
  };
  tailoredResume.fact_guard = factGuardCheck(resume, tailoredResume);

  return {
    match_score: Math.max(0, Math.min(99, matchScore)),
    matched_keywords: matched,
    missing_keywords: missing,
    tailored_resume: tailoredResume,
    custom_greeting,
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

function buildTailoredSummary(job, resume, matched, missing) {
  const base = (resume?.summary || "").trim();
  const focus = matched.length ? matched.slice(0, 5).join(" / ") : "AI应用与质量保障";
  const roleHint = job.job_title || "AI测试工程师";
  const prefix = `【针对「${job.company_name || "目标团队"} · ${roleHint}」动态优化侧重】重点突出 ${focus} 实战经验。`;
  if (!base) {
    return `${prefix}熟悉大模型 RAG/Agent 效果评测、接口及 UI 自动化测试，能快速定位业务缺陷并推动产研闭环。`;
  }
  const gapHint = missing.length ? `\n（可按真实经历酌情补充：${missing.slice(0, 3).join("、")}）` : "";
  return `${prefix}\n${base}${gapHint}`;
}

export function buildCustomGreeting(job, resume, matchedKeywords = []) {
  const recruiter = String(job.recruiter_title || "").trim();
  const isTech = /总监|经理|CTO|老板|创始人|CEO|Lead/i.test(recruiter);
  const title = job.job_title || "AI测试";
  const highlights = matchedKeywords.length
    ? matchedKeywords.slice(0, 3).join("/")
    : "RAG知识库评测、Python自动化测试及Prompt调优";

  let text = "";
  if (isTech) {
    text = `您好！看到贵司在招${title}，我具备${highlights}实战落地经验，独立搭过RAG智能问答并主导全链路测试提效，很期待直接和您沟通技术细节，可附定制简历。`;
  } else if (/HRBP|猎头/i.test(recruiter)) {
    text = `您好！关注到贵司${title}机会，我有${highlights}相关项目与大厂产研协同测试经验，可快速上手并保障高质量交付，期待进一步沟通并发送详细简历。`;
  } else {
    text = `您好！对贵司${title}非常感兴趣，熟悉${highlights}，有企业级产品全链路测试与AI应用落地经验，能高效推动缺陷闭环，盼沟通！`;
  }

  // 严格控制在 120 字以内
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
