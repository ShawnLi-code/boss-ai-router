import { getSettings } from "./db.mjs";

export function isLlmConfigured(settings = getSettings()) {
  return Boolean(settings.llm_base_url && settings.llm_api_key && settings.llm_model);
}

export function buildChatCompletionsUrl(baseUrl = "") {
  const clean = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  return clean.endsWith("/chat/completions") ? clean : `${clean}/chat/completions`;
}

/**
 * 可选：若用户在网页设置里配置了 OpenAI-compatible 接口（如 DeepSeek / OpenAI / 本地 Ollama），
 * 则用大模型进一步润色简历侧重点与 120 字以内专属打招呼话术；未配置时自动静默回退到本地规则引擎。
 */
export async function refineMatchWithLlm(job, resume, baseResult) {
  const settings = getSettings();
  if (!isLlmConfigured(settings)) {
    return { ...baseResult, used_llm: false };
  }

  const endpoint = buildChatCompletionsUrl(settings.llm_base_url);
  const prompt = [
    "你是 AI测试岗位求职与风控助手。请根据目标岗位与求职者对应轨道的简历素材，输出 JSON：",
    "1) tailored_summary: 结合 JD 关键词重构的个人优势摘要（保持原有工作年限与时间线真实性，禁止编造未经历的公司/时间）",
    "2) custom_greeting: 120字以内、贴合招聘人头衔与 JD 核心痛点的 Boss直聘打招呼话术",
    "3) gap_tips: 1-2句关键差距或面试避坑提醒",
    "",
    `岗位：${job.company_name} | ${job.job_title} | 规模:${job.scale} | 融资:${job.financing} | 招聘人:${job.recruiter_title}`,
    `JD：${(job.jd_text || "").slice(0, 1400)}`,
    `轨道：${resume.track_key}轨 (${resume.years_label})`,
    `简历摘要：${(resume.summary || "").slice(0, 600)}`,
    `技能：${(resume.skills || []).join(", ")}`,
    `工作/项目：${JSON.stringify([...(resume.experiences || []), ...(resume.projects || [])]).slice(0, 1600)}`,
    "",
    "仅返回合法 JSON 对象：{\"tailored_summary\":\"...\",\"custom_greeting\":\"...\",\"gap_tips\":\"...\"}",
  ].join("\n");

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
        temperature: 0.4,
        messages: [
          { role: "system", content: "只输出纯 JSON，不要包含 Markdown 代码块。" },
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
    const greeting = String(parsed.custom_greeting || baseResult.custom_greeting).trim();
    return {
      ...baseResult,
      used_llm: true,
      tailored_resume: {
        ...baseResult.tailored_resume,
        tailored_summary: parsed.tailored_summary || baseResult.tailored_resume.tailored_summary,
        gap_tips: parsed.gap_tips || baseResult.tailored_resume.gap_tips,
      },
      custom_greeting: greeting.length > 120 ? `${greeting.slice(0, 117)}...` : greeting,
      greeting_templates: Array.isArray(baseResult.greeting_templates)
        ? [
            {
              key: "llm",
              label: "AI 定制推荐",
              text: greeting.length > 120 ? `${greeting.slice(0, 117)}...` : greeting,
            },
            ...baseResult.greeting_templates.filter((t) => t.key !== "llm"),
          ]
        : baseResult.greeting_templates,
      revise_suggestions: parsed.gap_tips
        ? [parsed.gap_tips, ...(baseResult.revise_suggestions || []).slice(0, 2)]
        : baseResult.revise_suggestions,
    };
  } catch {
    return { ...baseResult, used_llm: false };
  } finally {
    clearTimeout(timer);
  }
}
