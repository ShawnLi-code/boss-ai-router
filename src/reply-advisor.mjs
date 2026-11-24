import { isLlmConfigured } from "./llm.mjs";

function pickResumeHighlights(job = {}, resume = {}) {
  const skills = Array.isArray(resume.skills) ? resume.skills.slice(0, 6) : [];
  const exps = Array.isArray(resume.experiences) ? resume.experiences : [];
  const projects = Array.isArray(resume.projects) ? resume.projects : [];
  const firstExp = exps[0]?.content || "";
  const firstProj = projects[0]?.name || "";
  const years = resume.years_label || "1年经验";
  const matched = Array.isArray(job.match?.matched_keywords) ? job.match.matched_keywords.slice(0, 4) : [];
  const coreSkills = matched.length ? matched.join("、") : (skills.slice(0, 4).join("、") || "功能/接口/自动化测试");

  const hasAiTest = /AI|大模型|RAG|提示词|智能体|Agent/i.test(`${job.job_title} ${job.jd_text} ${resume.summary} ${firstExp} ${firstProj}`);
  const highlightPhrase = hasAiTest
    ? "独立负责大模型/AI智能体与全链路接口、自动化测试及自研测试平台落地"
    : "独立负责Web/客户端全流程测试、接口自动化及抓包排障闭环";

  return {
    years,
    coreSkills,
    firstProj,
    hasAiTest,
    highlightPhrase,
    expSnippet: firstExp.replace(/\s+/g, " ").slice(0, 56),
  };
}

function detectConversationIntent(lastHrText = "", allHrText = "") {
  const text = String(lastHrText || allHrText || "").trim();
  if (!text) {
    return {
      intent: "NO_REPLY_YET",
      intent_label: "等待 HR 首轮回复 / 主动破冰",
      strategy_tip: "对方暂未回复（Boss 在 HR 回复前默认锁图片），建议先保持耐心或隔 1 天补充一条高价值短句，避免高频催促。",
    };
  }
  if (/需要.*?\d+年|年限|经验不(?:够|足)|至少\d+年|偏初级|年限要求|只招\d+年/.test(text)) {
    return {
      intent: "EXP_GAP",
      intent_label: "HR 认为工作年限偏短 / 卡年限",
      strategy_tip: "千万别虚构年限！策略是「承认真实年限 + 用高密度自研/全链路实战成果对冲 + 低成本验证（做题/短聊）」；若对方确实硬性卡死则体面收尾并留好感度。",
    };
  }
  if (/暂不合适|不合适|已招满|暂不考虑|遗憾|先这样|感谢投递/.test(text) && !/简历/.test(text)) {
    return {
      intent: "POLITE_REJECT",
      intent_label: "HR 礼貌婉拒 / 感谢投递",
      strategy_tip: "大概率岗位条件卡死，礼貌致谢即可；如果对这家公司业务很感兴趣，可以顺便礼貌询问团队是否有相近测试岗或初级岗。",
    };
  }
  if (/发.*简历|看看简历|附件简历|微信|加[vV]|微信号|vx|WX|联系方式|邮箱/.test(text)) {
    return {
      intent: "ASK_RESUME",
      intent_label: "HR 索要简历 / 联系方式",
      strategy_tip: "HR 已经回复，此时 Boss 图片/附件简历已解锁！建议直接发一句高匹配短语并勾选「顺带发图片简历」一键发出。",
    };
  }
  if (/面试|约.*时间|方便.*聊|线下面|视频面|腾讯会议|电话沟通|来公司|几点方便/.test(text)) {
    return {
      intent: "INTERVIEW_INVITE",
      intent_label: "HR 邀约面试 / 约沟通时间",
      strategy_tip: "先爽快确认时间与方式，顺带礼貌核实办公地点/面试侧重点或岗位工作制（是否双休、核心考核方向），避免白跑一趟。",
    };
  }
  if (/期望薪资|目前薪资|薪资要求|几时到岗|最快入职|在职|离职|到岗/.test(text)) {
    return {
      intent: "ASK_SALARY_OR_TIME",
      intent_label: "询问薪资期望 / 到岗时间",
      strategy_tip: "薪资建议锚定 9-12K 目标区间（或先确认岗位定级与薪资结构），同时明确自己可以快速配合到岗。",
    };
  }
  if (/自动化|接口|性能|压测|AI|大模型|RAG|提示词|做过|负责什么|项目|框架|Python|Java|抓包|SQL/.test(text)) {
    return {
      intent: "TECH_PROBE",
      intent_label: "HR/业务方追问技术栈与项目细节",
      strategy_tip: "用「做了什么 + 用什么工具/方案 + 量化结果/闭环效果」100 字内简明作答，直接命中对方想考察的点。",
    };
  }
  return {
    intent: "GENERAL_FOLLOWUP",
    intent_label: "常规互动 / 继续推进沟通",
    strategy_tip: "结合岗位亮点简短回应，并顺势发送高清图片简历或礼貌确认工作制（双休/核心职责）与下一步安排。",
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
    .filter((m) => m && m.text && m.sender !== "SYSTEM")
    .map((m) => ({ sender: m.sender === "ME" ? "ME" : "HR", text: String(m.text).trim(), time: m.time || "" }));

  const hrMsgs = cleanMsgs.filter((m) => m.sender === "HR");
  const lastHrText = customHint.trim() || hrMsgs[hrMsgs.length - 1]?.text || "";
  const allHrText = hrMsgs.map((m) => m.text).join("\n");
  const hl = pickResumeHighlights(job, resume);
  const { intent, intent_label, strategy_tip } = detectConversationIntent(lastHrText, allHrText);
  const roleName = job.job_title || "该岗位";
  const salIdealMin = settings.target_salary_min_k || "9";
  const salIdealMax = settings.target_salary_max_k || "12";

  let templates = [];

  if (intent === "EXP_GAP") {
    templates = [
      {
        key: "impact",
        label: "高密度实战对冲",
        tag: "推荐尝试",
        text: `理解您对年限的考虑！我虽然目前是${hl.years}，但在公司${hl.highlightPhrase}（覆盖 ${hl.coreSkills}），上手密度比较高。如果不卡死硬性年限，希望能发您一份简历看下项目匹配度，也欢迎出题或约 10 分钟初聊验真~`,
      },
      {
        key: "probe_junior",
        label: "体面留缘+探其他岗",
        tag: "留备用机会",
        text: `感谢您的坦诚回复！明白贵司「${roleName}」优先考虑 3 年以上候选人；我在现有经历里主要深耕 ${hl.coreSkills}，自驱力和排障能力比较扎实，若团队后续有看重实战能力的初/中级测试机会，也希望您能优先考虑我，祝招贤顺利！`,
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
        text: `好的谢谢您回复！如果后续贵司测试团队有合适 ${hl.years}、侧重 ${hl.coreSkills} 的岗位机会，欢迎再联系我，祝招聘顺利！`,
      },
      {
        key: "ask_other_role",
        label: "顺带探问相近岗位",
        tag: "挖潜机会",
        text: `感谢反馈！方便顺便请问下，团队目前还有偏功能/接口或 AI 评测方向的测试岗位在看人吗？我目前 ${hl.highlightPhrase}，可以快速上手。`,
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
        label: "发简历+高亮匹配点",
        tag: "最稳妥",
        text: `好的，马上发您一份最新简历请查收！我目前重点匹配贵司「${roleName}」要求的 ${hl.coreSkills}，有疑问随时沟通，期待进一步交流。`,
      },
      {
        key: "send_and_ask",
        label: "发简历+确认工作安排",
        tag: "高效双向评估",
        text: `简历已发送给您查收~ 我过往${hl.highlightPhrase}。方便问下该岗位日常是否双休、主要负责哪块业务线呢？`,
      },
      {
        key: "send_short",
        label: "简明发送",
        tag: "简洁版",
        text: `好的，这边已把高清图片简历发在聊天里，您随时查看，有需要补充的信息我随时发您！`,
      },
    ];
  } else if (intent === "INTERVIEW_INVITE") {
    templates = [
      {
        key: "confirm_time",
        label: "爽快确认+问考察重点",
        tag: "推荐",
        text: `好的没问题，我时间比较灵活（明天/本周工作日下午都可以）！方便请问下是线上面试还是线下，主要几轮、重点考察哪块技术呢，我提前做好准备。`,
      },
      {
        key: "confirm_detail",
        label: "确认地址与工作制",
        tag: "防白跑",
        text: `可以的，感谢邀约！请问面试具体时间和地点方便发我下吗？另外想提前确认下岗位工作时间是否是双休、薪资范围大概在什么区间呢？`,
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
        label: "锚定目标薪资+看重空间",
        tag: "推荐",
        text: `我目前期望薪资在 ${salIdealMin}-${salIdealMax}K 左右（具体也可结合团队薪资结构与绩效沟通），如果双方匹配度高，最快可以一周内/协商确定时间到岗。`,
      },
      {
        key: "salary_ask_struct",
        label: "先反问定级与薪资结构",
        tag: "稳健谈判",
        text: `我主要看重岗位匹配度与团队氛围，期望月薪参考 ${salIdealMin}-${salIdealMax}K，到岗时间很灵活。也想先了解下贵司该岗位的薪资定级、社保公积金与双休情况？`,
      },
      {
        key: "availability",
        label: "重点强调快速到岗",
        tag: "效率优先",
        text: `我目前可随时沟通并尽快安排到岗，期望月薪在 ${salIdealMin}-${salIdealMax}K 区间，如果核心能力符合团队要求咱们可以进一步约聊！`,
      },
    ];
  } else if (intent === "TECH_PROBE") {
    templates = [
      {
        key: "tech_concrete",
        label: "用项目实绩直接作答",
        tag: "推荐",
        text: `这块我实战比较多：在近期项目里${hl.highlightPhrase}，常用 ${hl.coreSkills}${hl.expSnippet ? `（${hl.expSnippet.slice(0, 32)}…）` : ""}。可以发份简历给您看详细案例！`,
      },
      {
        key: "tech_deep",
        label: "补充工具与闭环思维",
        tag: "突出深度",
        text: `是的，我日常测试除了用例设计与接口回归，还会自己写脚本做自动化断言、用抓包与日志排查定位线上 Bug，保证问题可复现可闭环，和贵司要求非常对口。`,
      },
      {
        key: "tech_chat",
        label: "约电话/语音细聊技术",
        tag: "高效推进",
        text: `这几个技术方向我都有实际落地经验，三言两语聊不细，如果您感兴趣我可以先把简历发您，或者方便约个 10 分钟语音/线上沟通具体拆解！`,
      },
    ];
  } else if (intent === "NO_REPLY_YET") {
    templates = [
      {
        key: "nudge_value",
        label: "补充亮点温和追问",
        tag: "二次触达",
        text: `您好，补充一句：我过往${hl.highlightPhrase}，涉及 ${hl.coreSkills}，看到贵司「${roleName}」非常契合，如果方便可以发您简历看看~`,
      },
      {
        key: "nudge_probe",
        label: "确认岗位是否还在招",
        tag: "简洁探测",
        text: `您好，打扰了~ 请问贵司「${roleName}」目前还在看人吗？我这边擅长 ${hl.coreSkills}，希望能有机会沟通！`,
      },
      {
        key: "nudge_img",
        label: "询问发图片简历",
        tag: "发简历前置",
        text: `您好！如果您方便的话可以回复我一下，我把整理好的一页高清简历发给您评估下是否匹配「${roleName}」~`,
      },
    ];
  } else {
    templates = [
      {
        key: "follow_img",
        label: "顺势发简历+推进了解",
        tag: "推荐",
        text: `感谢回复！我目前重点匹配贵司「${roleName}」的 ${hl.coreSkills}，这边先把高清图片简历发您看看；也想了解下这个岗位的日常核心业务和工作制情况？`,
      },
      {
        key: "follow_probe",
        label: "探底工作制与岗位定位",
        tag: "防踩坑",
        text: `您好！想进一步了解下贵司「${roleName}」：目前团队主要做哪块产品测试、日常是否双休以及技术栈侧重哪块呢？我过往主要负责 ${hl.coreSkills}。`,
      },
      {
        key: "follow_call",
        label: "直接约进一步沟通",
        tag: "积极推进",
        text: `好的没问题，我对贵司这个方向很感兴趣！您看是先看看我简历，还是方便约个时间简短沟通几分钟了解下团队需求？`,
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
  if (!isLlmConfigured(settings)) return base;

  const cleanMsgs = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.text && m.sender !== "SYSTEM")
    .slice(-10);
  const threadText = cleanMsgs.map((m) => `${m.sender === "ME" ? "我" : "HR"}：${m.text}`).join("\n");
  const endpoint = `${settings.llm_base_url.replace(/\/+$/, "")}/chat/completions`;
  const prompt = [
    "你是 Boss直聘求职者的连续对话助手。请严格基于候选人真实简历（严禁编造工作年限、学校或未经历的公司），结合双方历史聊天记录和对方最新回复，输出 3 套不同策略的中文回复模板（每条 30-150 字，口吻自然真诚、不卑不亢）。",
    `目标岗位：${job.company_name || ""} | ${job.job_title || ""} | 薪资:${job.salary_range || ""} | 要求:${job.experience_req || ""}`,
    `JD要点：${(job.jd_text || "").slice(0, 800)}`,
    `候选人真实履历：${resume.years_label || "1年经验"}；摘要：${(resume.summary || "").slice(0, 500)}；技能：${(resume.skills || []).join(", ")}`,
    `工作与项目：${JSON.stringify([...(resume.experiences || []), ...(resume.projects || [])]).slice(0, 1000)}`,
    threadText ? `目前聊天记录：\n${threadText}` : "目前聊天记录：暂无（我方准备发起后续跟进）",
    customHint ? `对方最新一句话/补充背景：${customHint}` : "",
    "",
    '只返回纯 JSON 对象：{"intent_label":"对方意图简述","strategy_tip":"1句回复策略建议","templates":[{"label":"方案名1","tag":"推荐","text":"回复内容1"},{"label":"方案名2","tag":"稳健","text":"回复内容2"},{"label":"方案名3","tag":"简洁","text":"回复内容3"}]}',
  ].filter(Boolean).join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 16000);
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
          { role: "system", content: "只输出合法 JSON，不要包含 Markdown 代码块。" },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("LLM未返回JSON");
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.templates) || parsed.templates.length === 0) throw new Error("缺少templates");
    return {
      ...base,
      intent_label: parsed.intent_label || base.intent_label,
      strategy_tip: parsed.strategy_tip || base.strategy_tip,
      used_llm: true,
      templates: parsed.templates.slice(0, 3).map((t, idx) => ({
        key: `llm_${idx}`,
        label: String(t.label || `方案 ${idx + 1}`).slice(0, 16),
        tag: String(t.tag || "AI建议").slice(0, 10),
        text: String(t.text || "").trim(),
      })).filter((t) => t.text),
    };
  } catch {
    return base;
  } finally {
    clearTimeout(timer);
  }
}
