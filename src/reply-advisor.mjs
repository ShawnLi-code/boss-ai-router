import { DEFAULT_FOLLOWUP_PROMPT } from "./db.mjs";
import { buildChatCompletionsUrl, isLlmConfigured } from "./llm.mjs";

const TECH_TOPIC_RULES = [
  { key: "ui_auto", label: "UI自动化", regex: /ui\s*自动化|ui自动化|selenium|playwright|cypress|puppeteer|appium|airtest/i },
  { key: "perf_test", label: "性能压测", regex: /性能测试|压测|jmeter|loadrunner|locust/i },
  { key: "app_test", label: "App/移动端测试", regex: /app测试|移动端|ios测试|android测试|\badb\b|monkey/i },
  { key: "api_auto", label: "接口自动化", regex: /接口自动化|api自动化|接口测试|pytest|postman|requests|rest/i },
  { key: "ai_eval", label: "AI/大模型测试", regex: /大模型|\bllm\b|\brag\b|\bagent\b|智能体|评测|提示词|prompt|\bai\b/i },
  { key: "security_test", label: "安全测试", regex: /安全测试|渗透|漏洞/i },
  { key: "java_stack", label: "Java", regex: /\bjava\b/i },
  { key: "python_stack", label: "Python", regex: /\bpython\b/i },
  { key: "sql_db", label: "SQL/数据库", regex: /\bsql\b|mysql|数据库/i },
];

function cleanResumeText(str = "") {
  return String(str || "")
    .replace(/^[•·\-*\d.、\s]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickNaturalClause(raw = "", maxLen = 42) {
  const cleaned = cleanResumeText(raw);
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  const parts = cleaned.split(/[，,。；;]/).map((s) => s.trim()).filter(Boolean);
  let out = "";
  for (const p of parts) {
    const next = out ? `${out}，${p}` : p;
    if (next.length > maxLen) break;
    out = next;
  }
  return out || "";
}

function analyzeResumeCapabilities(job = {}, resume = {}) {
  const skills = Array.isArray(resume.skills) ? resume.skills.map((s) => String(s).trim()).filter(Boolean) : [];
  const exps = Array.isArray(resume.experiences) ? resume.experiences : [];
  const projects = Array.isArray(resume.projects) ? resume.projects : [];
  const firstExp = cleanResumeText(exps[0]?.content || "");
  const firstProjName = cleanResumeText(projects[0]?.name || "");
  const firstProjDesc = cleanResumeText(projects[0]?.content || projects[0]?.description || "");
  const resumeCorpus = [
    resume.summary || "",
    skills.join(" "),
    exps.map((e) => `${e.role || ""} ${e.content || ""}`).join(" "),
    projects.map((p) => `${p.name || ""} ${p.content || p.description || ""}`).join(" "),
  ].join(" ");

  const years = resume.years_label || "1年经验";
  const matched = Array.isArray(job.match?.matched_keywords) ? job.match.matched_keywords.slice(0, 3) : [];
  const coreSkills = matched.length ? matched.join("、") : (skills.slice(0, 3).join("、") || "功能与接口测试");

  const hasAiTest = /AI|大模型|RAG|提示词|智能体|Agent/i.test(resumeCorpus);
  const hasApiAuto = /接口自动化|接口测试|Pytest|Postman|Python/i.test(resumeCorpus);
  const spokenStrength = hasAiTest && hasApiAuto
    ? "AI应用测试和接口自动化"
    : hasAiTest
      ? "AI应用功能与评测"
      : hasApiAuto
        ? "功能测试和接口自动化"
        : (skills.slice(0, 2).join("和") || "功能测试与问题排查");

  const highlightPhrase = hasAiTest
    ? "主要做大模型/AI功能测试、接口自动化和日常排查"
    : "主要做全流程功能测试、接口自动化和抓包定位";

  return {
    years,
    coreSkills,
    spokenStrength,
    highlightPhrase,
    firstProjName,
    expClause: pickNaturalClause(firstExp || firstProjDesc, 38),
    resumeCorpus,
  };
}

function evaluateAskedTopics(lastHrText = "", resumeCorpus = "") {
  const text = String(lastHrText || "");
  const asked = TECH_TOPIC_RULES.filter((r) => r.regex.test(text));
  const matched = asked.filter((r) => r.regex.test(resumeCorpus));
  const missing = asked.filter((r) => !r.regex.test(resumeCorpus));
  const isDurationQ = /多久|几年|多长时间|多少年|做了几年/.test(text);
  return { asked, matched, missing, isDurationQ };
}

function detectConversationIntent(cleanMsgs = [], customHint = "", hl = {}) {
  const hrMsgs = cleanMsgs.filter((m) => m.sender === "HR");
  const lastMsg = cleanMsgs[cleanMsgs.length - 1];
  const hint = String(customHint || "").trim();

  if (hrMsgs.length === 0 && !hint) {
    return {
      intent: "NO_REPLY_YET",
      intent_label: "等待 HR 首轮回复 / 主动破冰",
      strategy_tip: "对方还没回消息（HR 回复前 Boss 通常限制发图）。隔天再简短补一句就好，别连发多条。",
      lastHrText: "",
      topicCheck: { asked: [], matched: [], missing: [], isDurationQ: false },
    };
  }

  // 若对话里有 HR 提问，且最后一条已经由「我」回答过（没有新粘贴 HR 消息），提示已回复状态
  if (!hint && hrMsgs.length > 0 && lastMsg?.sender === "ME") {
    const myRecentText = cleanMsgs.slice().reverse().find((m) => m.sender === "ME");
    const sentImgRecently = cleanMsgs.slice(cleanMsgs.findLastIndex((m) => m.sender === "HR") + 1).some((m) => m.kind === "image" || /图片/.test(m.text));
    return {
      intent: "WAITING_AFTER_MY_REPLY",
      intent_label: "你已回复对方，当前建议等 HR 查看",
      strategy_tip: `你${myRecentText?.time ? `在 ${myRecentText.time} ` : ""}已经回过对方${sentImgRecently ? "并附上了图片简历" : ""}，别再重复回答同一个问题。先等对方反馈；如果过半天没回想轻推一句，再从下方挑一条短句。`,
      lastHrText: hrMsgs[hrMsgs.length - 1]?.text || "",
      sentImgRecently,
      topicCheck: { asked: [], matched: [], missing: [], isDurationQ: false },
    };
  }

  const text = hint || hrMsgs[hrMsgs.length - 1]?.text || "";
  const topicCheck = evaluateAskedTopics(text, hl.resumeCorpus);

  if (/需要.*?\d+年|经验不(?:够|足)|至少\d+年|偏初级|年限要求|只招\d+年/.test(text)) {
    return {
      intent: "EXP_GAP",
      intent_label: "HR 顾虑工作年限偏短 / 卡年限",
      strategy_tip: "不要虚构年限！直接认真实年限，强调自己独立扛过核心测试项目、上手快，不行就体面收尾省得互相耽误。",
      lastHrText: text,
      topicCheck,
    };
  }
  if (/暂不合适|不合适|已招满|暂不考虑|遗憾|先这样|感谢投递/.test(text) && !/简历/.test(text)) {
    return {
      intent: "POLITE_REJECT",
      intent_label: "HR 礼貌婉拒 / 感谢投递",
      strategy_tip: "对方大概率是硬性条件卡死了，礼貌谢过就行；如果特别想去，顺口问一句组里有没有初级或相近测试岗。",
      lastHrText: text,
      topicCheck,
    };
  }
  if (/发.*简历|看看简历|附件简历|微信|加[vV]|微信号|vx|WX|联系方式|邮箱/.test(text)) {
    return {
      intent: "ASK_RESUME",
      intent_label: "HR 主动要简历 / 联系方式",
      strategy_tip: "HR 已经开口要简历了，直接简短回一句并勾选下方「顺带发出高清图片简历」一次发过去。",
      lastHrText: text,
      topicCheck,
    };
  }
  if (/面试|约.*时间|方便.*聊|线下面|视频面|腾讯会议|电话沟通|来公司|几点方便/.test(text)) {
    return {
      intent: "INTERVIEW_INVITE",
      intent_label: "HR 邀约面试 / 约沟通时间",
      strategy_tip: "先爽快约时间，同时顺便问一句线上还是线下、大概几轮/看重哪块，以及是否双休，免得白跑。",
      lastHrText: text,
      topicCheck,
    };
  }
  if (/期望薪资|目前薪资|薪资要求|几时到岗|最快入职|在职|离职|到岗/.test(text)) {
    return {
      intent: "ASK_SALARY_OR_TIME",
      intent_label: "询问薪资期望 / 到岗时间",
      strategy_tip: "直接报目标区间并说明到岗灵活，顺便自然问一下岗位薪资结构和工作制。",
      lastHrText: text,
      topicCheck,
    };
  }
  if (topicCheck.missing.length > 0 && topicCheck.matched.length === 0) {
    const askedLabel = topicCheck.missing.map((t) => t.label).join("、");
    return {
      intent: "SKILL_GAP_HONEST",
      intent_label: `HR 追问「${askedLabel}」经验（与当前简历主线不完全重合）`,
      strategy_tip: `千万别硬吹「这块实战很多」！直接坦白之前主要做「${hl.spokenStrength}」，「${askedLabel}」实际做得少，再说一句思路相通、现在用 AI 辅助写脚本补起来很快，并顺便问清岗位实际工作占比最真实。`,
      lastHrText: text,
      topicCheck,
    };
  }
  if (topicCheck.matched.length > 0 || /做过|负责什么|项目|框架|怎么测|测试流程|抓包/.test(text)) {
    const matchedLabel = topicCheck.matched.map((t) => t.label).join("、") || hl.coreSkills;
    return {
      intent: "TECH_PROBE",
      intent_label: `HR/业务方了解「${matchedLabel}」实战情况`,
      strategy_tip: topicCheck.isDurationQ
        ? "对方在问做过多久：直接报真实时间 + 一句大白话说明平时具体干了啥就行，别背简历条文。"
        : "用大白话讲清楚「平时怎么测、解决过什么问题」，控制在 80 字以内最容易让对方继续聊。",
      lastHrText: text,
      topicCheck,
    };
  }
  return {
    intent: "GENERAL_FOLLOWUP",
    intent_label: "常规沟通 / 继续推进",
    strategy_tip: "顺着对方的话自然接一句，同时附发图片简历或顺便了解岗位业务与双休情况。",
    lastHrText: text,
    topicCheck,
  };
}

/**
 * 基于真实聊天记录、目标岗位 JD 与候选人真实简历，生成 3 套可直接选用/修改的连续回复模板。
 */
export function analyzeConversationAndSuggestReplies({
  job = {},
  resume = {},
  messages = [],
  customHint = "",
  settings = {},
} = {}) {
  const cleanMsgs = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.text || m.imageUrl) && m.sender !== "SYSTEM")
    .map((m) => ({
      sender: m.sender === "ME" ? "ME" : "HR",
      text: String(m.text || "[图片消息]").trim(),
      kind: m.kind || (m.imageUrl ? "image" : "text"),
      time: m.time || "",
    }));

  const hl = analyzeResumeCapabilities(job, resume);
  const { intent, intent_label, strategy_tip, lastHrText, sentImgRecently, topicCheck } = detectConversationIntent(cleanMsgs, customHint, hl);
  const roleName = job.job_title || "这个岗位";
  const salIdealMin = settings.target_salary_min_k || "9";
  const salIdealMax = settings.target_salary_max_k || "12";

  let templates = [];

  if (intent === "WAITING_AFTER_MY_REPLY") {
    templates = [
      {
        key: "gentle_ping",
        label: "礼貌确认是否收到",
        tag: "轻量跟进",
        text: sentImgRecently
          ? `您好，刚才把情况说明和简历图片发您了，您忙完方便扫一眼~ 要是有哪里想进一步了解随时喊我。`
          : `您好，刚才简单回了下您的消息；如果您方便的话我再把一页图片简历发您看看，上面项目细节更全一些~`,
      },
      {
        key: "ask_daily_split",
        label: "顺便了解团队分工",
        tag: "开启新话题",
        text: `对了，方便提前了解下咱们组这个岗日常主要测哪块业务呀？功能、接口和专项测试大概怎么分配呢？`,
      },
      {
        key: "wait_calmly",
        label: "不打扰客气收一句",
        tag: "佛系稳妥",
        text: `您先忙工作，简历放这儿您抽空看就行，如果觉得大方向合适随时叫我~`,
      },
    ];
  } else if (intent === "SKILL_GAP_HONEST") {
    const askedName = topicCheck.missing.map((t) => t.label).join("、") || "这块专项";
    templates = [
      {
        key: "honest_transfer",
        label: "坦诚现状+可快速补齐",
        tag: "推荐 · 说人话",
        text: `实话讲，${askedName}我在之前项目里单独写得不算多，主要还是做${hl.spokenStrength}为主。不过自动化断言和排查逻辑是相通的，现在配合 AI 辅助生成脚本上手很快，您可以先看看我简历判断下~`,
      },
      {
        key: "ask_real_ratio",
        label: "反问岗位实际比例",
        tag: "防踩坑",
        text: `${askedName}这块我实战相对少一些，过往重点在${hl.spokenStrength}。方便问下咱们这个岗进组后是纯写${askedName}脚本，还是功能、接口和业务测试都会一起扛呢？`,
      },
      {
        key: "short_sincere",
        label: "简短真诚不画饼",
        tag: "简洁版",
        text: `我之前项目重心在${hl.spokenStrength}，${askedName}确实用得少；如果团队需要很快能上手干活的，我学习补齐挺快的，方便先发份简历给您看下过往产出吗？`,
      },
    ];
  } else if (intent === "EXP_GAP") {
    templates = [
      {
        key: "impact",
        label: "坦诚年限+实干上手快",
        tag: "推荐尝试",
        text: `理解您看重经验！我目前确实是${hl.years}，不过平时一直在独立扛项目里的${hl.spokenStrength}，排障和推进习惯挺扎实的。如果年限不是一刀切，希望能发简历给您看看实际做的东西~`,
      },
      {
        key: "probe_junior",
        label: "体面留余地+问相近岗",
        tag: "留备用机会",
        text: `明白，如果「${roleName}」硬性要 3 年以上也没关系，多谢您提前告知！要是有偏${hl.spokenStrength}的初/中级测试坑位，也欢迎优先考虑我，祝招人顺利~`,
      },
      {
        key: "polite_close",
        label: "礼貌收尾致谢",
        tag: "礼貌结束",
        text: `好的明白，非常感谢您的反馈与回复！后续如果有适配经验要求的测试岗位欢迎随时联系，祝招聘顺利！`,
      },
    ];
  } else if (intent === "POLITE_REJECT") {
    templates = [
      {
        key: "polite_thanks",
        label: "体面致谢留好感",
        tag: "推荐",
        text: `好的谢谢您回复！如果后续贵司测试团队有适合 ${hl.years}、侧重${hl.spokenStrength}的机会，欢迎再联系我，祝招聘顺利！`,
      },
      {
        key: "ask_other_role",
        label: "顺带探问相近岗位",
        tag: "挖潜机会",
        text: `感谢告知！顺便请教下，咱们团队最近还有偏功能、接口或 AI 测试方向的其他岗位在招吗？我这块上手挺快的。`,
      },
      {
        key: "short_ack",
        label: "简短礼貌收尾",
        tag: "简洁版",
        text: `明白，感谢您的告知与宝贵时间，祝好！`,
      },
    ];
  } else if (intent === "ASK_RESUME") {
    templates = [
      {
        key: "send_with_hl",
        label: "发简历+带一句对口点",
        tag: "最稳妥",
        text: `好的，马上把高清简历发您查收！我平时主要做${hl.spokenStrength}，跟这个岗位挺贴的，您看下有想了解的随时问我~`,
      },
      {
        key: "send_and_ask",
        label: "发简历+顺便问工作制",
        tag: "双向了解",
        text: `简历发您啦，请查收~ 顺便想了解下咱们这个岗位日常是双休吗，主要负责哪条业务线的测试呢？`,
      },
      {
        key: "send_short",
        label: "简明直接发送",
        tag: "简洁版",
        text: `好的，这边已把高清图片简历发在聊天里，您随时查看，有需要补充的信息我随时发您！`,
      },
    ];
  } else if (intent === "INTERVIEW_INVITE") {
    templates = [
      {
        key: "confirm_time",
        label: "爽快约时间+问考察重点",
        tag: "推荐",
        text: `好的没问题，我明天或这周工作日下午都方便！想提前确认下是线上面试还是到司面、大概几轮呢，我提前准备下。`,
      },
      {
        key: "confirm_detail",
        label: "确认地点、双休与薪资",
        tag: "防白跑",
        text: `可以的，感谢邀约！麻烦发我下具体面试时间和地址~ 另外顺便确认下岗位是否双休、薪资大致在什么范围呢？`,
      },
      {
        key: "fast_agree",
        label: "快速敲定时间",
        tag: "简洁版",
        text: `好的，我这边今天下午 14:30 后或明天全天都方便，您看安排在哪个时间段合适？`,
      },
    ];
  } else if (intent === "ASK_SALARY_OR_TIME") {
    templates = [
      {
        key: "salary_range",
        label: "报期望薪资+快速到岗",
        tag: "推荐",
        text: `我目前期望薪资在 ${salIdealMin}-${salIdealMax}K 左右（具体也可以结合定级和奖金结构聊），如果双方合适，我一周内就能办理入职到岗。`,
      },
      {
        key: "salary_ask_struct",
        label: "报范围+反问定级结构",
        tag: "稳健谈判",
        text: `期望月薪主要看 ${salIdealMin}-${salIdealMax}K，到岗时间很灵活。想顺便问下咱们这个岗对应的薪资结构、公积金和是否双休呢？`,
      },
      {
        key: "availability",
        label: "强调随时能到岗",
        tag: "效率优先",
        text: `我现在随时可以安排到岗，期望月薪在 ${salIdealMin}-${salIdealMax}K 区间，如果能力匹配咱们随时约聊！`,
      },
    ];
  } else if (intent === "TECH_PROBE") {
    const matchedName = topicCheck.matched.map((t) => t.label).join("、") || hl.spokenStrength;
    const concreteTail = hl.expClause ? `，之前在项目里主要负责${hl.expClause}` : "";
    templates = [
      {
        key: "tech_concrete",
        label: topicCheck.isDurationQ ? "按真实年限+项目大白话回答" : "用项目里干过的实事直接答",
        tag: "推荐 · 说人话",
        text: topicCheck.isDurationQ
          ? `${matchedName}我实际做了有 ${hl.years}了${concreteTail}。平时定位 Bug、写回归脚本和提效都自己扛，细节都在简历里，我发您看下？`
          : `${matchedName}这块我一直有在做${concreteTail}，常用 ${hl.coreSkills}。平时都是自己写用例、跑回归再抓包定位问题，方便的话我发您简历看具体案例~`,
      },
      {
        key: "tech_deep",
        label: "补充日常排障与闭环习惯",
        tag: "突出务实",
        text: `日常测需求除了功能与接口验证，我也习惯抓包看请求日志、写点小脚本跑回归和对比数据，尽量把问题复现步骤拆透后再抛给开发，沟通效率会高很多。`,
      },
      {
        key: "tech_chat",
        label: "发简历+约几分钟短聊",
        tag: "高效推进",
        text: `文字一两句说不太全，我先把一页简历发您看下技术栈和项目产出，感兴趣的话咱们约个 10 分钟语音细聊下业务需求？`,
      },
    ];
  } else if (intent === "NO_REPLY_YET") {
    templates = [
      {
        key: "nudge_value",
        label: "补一句匹配点温和跟进",
        tag: "二次触达",
        text: `您好，补充一句：我平时主要做${hl.spokenStrength}，看到贵司在招「${roleName}」挺对口的，您方便的时候回复我一下，我把简历发您看看~`,
      },
      {
        key: "nudge_probe",
        label: "确认岗位是否还在招",
        tag: "简洁探测",
        text: `您好打扰了~ 请问咱们「${roleName}」目前还在看人吗？我这边匹配 ${hl.coreSkills}，希望能有机会沟通！`,
      },
      {
        key: "nudge_img",
        label: "询问发图片简历",
        tag: "发简历前置",
        text: `您好！如果您方便的话可以回复我一下，我把整理好的一页高清简历发给您评估下是否合适~`,
      },
    ];
  } else {
    templates = [
      {
        key: "follow_img",
        label: "自然接话+顺便了解业务",
        tag: "推荐",
        text: `谢谢回复！我平时主要做${hl.spokenStrength}，这边先把高清图片简历发您看看；顺便想了解下咱们这个岗位日常核心测哪块、是否双休呢？`,
      },
      {
        key: "follow_probe",
        label: "探底工作制与岗位重点",
        tag: "防踩坑",
        text: `您好！想了解下咱们「${roleName}」日常主要偏功能/接口还是专项测试，工作制是不是双休呀？我这块过往主要负责 ${hl.coreSkills}。`,
      },
      {
        key: "follow_call",
        label: "直接约进一步沟通",
        tag: "积极推进",
        text: `好的没问题，我对贵司这个方向挺感兴趣的！您看先看下我简历，还是方便约几分钟简单语音对下岗位需求？`,
      },
    ];
  }

  return {
    intent,
    intent_label,
    strategy_tip,
    last_hr_text: lastHrText,
    used_llm: false,
    templates: templates.map((t) => ({
      ...t,
      text: t.text.length > 180 ? `${t.text.slice(0, 177)}...` : t.text,
    })),
  };
}

/**
 * 若用户在设置里配置了大模型，则结合真实多轮对话润色 3 套回复模板；未配置或失败时自动回退到本地规则推荐。
 */
export async function generateContextualReplies({
  job = {},
  resume = {},
  messages = [],
  customHint = "",
  settings = {},
} = {}) {
  const base = analyzeConversationAndSuggestReplies({ job, resume, messages, customHint, settings });
  if (!isLlmConfigured(settings)) {
    return {
      ...base,
      used_llm: false,
      llm_notice: "尚未填写 AI API Key：当前先展示本地参考。去「巡检与账号设置」填好 Key 并保存后，即可由 DeepSeek V4.1 Flash Fast 结合你的真实经历生成口语化回复。",
    };
  }

  const cleanMsgs = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.text || m.imageUrl) && m.sender !== "SYSTEM")
    .slice(-12);
  const threadText = cleanMsgs.map((m) => {
    const body = m.kind === "image" || /^\[图片(?:消息|简历)?\]$/.test(String(m.text || "").trim())
      ? (m.sender === "ME" ? "[已发出高清图片简历]" : "[图片消息]")
      : m.text;
    return `${m.sender === "ME" ? "我" : "HR"}${m.time ? `(${m.time})` : ""}：${body}`;
  }).join("\n");

  const expText = (Array.isArray(resume.experiences) ? resume.experiences : [])
    .map((e) => `${e.company || ""}｜${e.role || ""}｜${e.period || ""}\n${cleanResumeText(e.content || "")}`)
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1400);
  const projText = (Array.isArray(resume.projects) ? resume.projects : [])
    .map((p) => `${p.name || ""}${p.role ? `（${p.role}）` : ""}\n${cleanResumeText(p.content || p.description || "")}`)
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1200);

  const customRule = String(settings.followup_reply_prompt || DEFAULT_FOLLOWUP_PROMPT).trim();
  const endpoint = buildChatCompletionsUrl(settings.llm_base_url);
  const prompt = [
    customRule,
    "",
    `【目标岗位】${job.company_name || ""} | ${job.job_title || ""} | 薪资:${job.salary_range || ""} | 经验要求:${job.experience_req || ""}`,
    `【岗位 JD】\n${(job.jd_text || "").slice(0, 900)}`,
    "",
    `【候选人真实简历】`,
    `- 真实经验标签：${resume.years_label || "1年经验"}`,
    `- 个人简介：${cleanResumeText(resume.summary || "").slice(0, 500)}`,
    `- 技能列表：${(resume.skills || []).join("、")}`,
    expText ? `- 工作经历：\n${expText}` : "",
    projText ? `- 项目经历：\n${projText}` : "",
    "",
    threadText ? `【目前双方真实对话记录（按时间顺序）】\n${threadText}` : "【目前双方真实对话记录】暂无（我方准备主动跟进）",
    customHint ? `【补充的 HR 最新一句话】${customHint}` : "",
    "",
    '请只输出纯 JSON 对象（不要包含 Markdown 代码块）：{"intent_label":"对方当前意图（不超过18字）","strategy_tip":"1句实话建议（不超过60字）","templates":[{"label":"方案1标题","tag":"推荐","text":"回复正文1"},{"label":"方案2标题","tag":"稳健","text":"回复正文2"},{"label":"方案3标题","tag":"简洁","text":"回复正文3"}]}',
  ].filter(Boolean).join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.llm_api_key}`,
      },
      body: JSON.stringify({
        model: settings.llm_model,
        temperature: 0.45,
        messages: [
          { role: "system", content: "你是 Boss直聘求职者的连续对话助手。只输出合法 JSON 对象，不要包含 ```json 代码块。" },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 120)}` : ""}`);
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("模型未返回合法 JSON");
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.templates) || parsed.templates.length === 0) throw new Error("模型返回缺少 templates");
    return {
      ...base,
      intent_label: parsed.intent_label || base.intent_label,
      strategy_tip: parsed.strategy_tip || base.strategy_tip,
      used_llm: true,
      llm_model: settings.llm_model,
      llm_error: "",
      templates: parsed.templates.slice(0, 3).map((t, idx) => ({
        key: `llm_${idx}`,
        label: String(t.label || `方案 ${idx + 1}`).slice(0, 16),
        tag: String(t.tag || "AI生成").slice(0, 10),
        text: String(t.text || "").trim(),
      })).filter((t) => t.text),
    };
  } catch (err) {
    return {
      ...base,
      used_llm: false,
      llm_error: String(err?.message || "大模型调用失败"),
      llm_notice: `AI 调用失败（${String(err?.message || "未知错误")}），当前暂展示本地兜底参考。`,
    };
  } finally {
    clearTimeout(timer);
  }
}
