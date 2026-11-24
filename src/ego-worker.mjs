import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DATA_DIR } from "./db.mjs";
import { calculateBikePlusMetroMetrics } from "./commute.mjs";

const RUNS_DIR = path.join(DATA_DIR, "ego-runs");
fs.mkdirSync(RUNS_DIR, { recursive: true });

let activeLock = null;

export function getActiveLock() {
  return activeLock;
}

function acquireLock(label) {
  if (activeLock) {
    throw new Error(`当前已有浏览器任务正在运行（${activeLock.label}），为防风控同一时间仅允许单任务串行执行`);
  }
  activeLock = { label, startedAt: new Date().toISOString() };
}

function releaseLock() {
  activeLock = null;
}

function runEgoScript(scriptName, code, timeoutMs = 180_000, { onLine = null } = {}) {
  const filePath = path.join(RUNS_DIR, `${Date.now()}-${scriptName}.mjs`);
  fs.writeFileSync(filePath, code, "utf8");
  const entry = `await import('${pathToFileURL(filePath).href}')`;

  if (!onLine) {
    return new Promise((resolve, reject) => {
      execFile(
        "ego-browser",
        ["nodejs", "-e", entry],
        { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const combined = [stdout, stderr].filter(Boolean).join("\n");
          if (err) {
            return reject(new Error(`${err.message}\n${combined}`.trim()));
          }
          resolve({ stdout: stdout || "", stderr: stderr || "", combined });
        }
      );
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn("ego-browser", ["nodejs", "-e", entry], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let bufOut = "";
    let bufErr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch {}
    }, timeoutMs);

    const flushLines = (chunk, isErr) => {
      const text = chunk.toString("utf8");
      if (isErr) {
        stderr += text;
        bufErr += text;
        const parts = bufErr.split(/\r?\n/);
        bufErr = parts.pop() || "";
        for (const l of parts) if (l) onLine(l, "stderr");
      } else {
        stdout += text;
        bufOut += text;
        const parts = bufOut.split(/\r?\n/);
        bufOut = parts.pop() || "";
        for (const l of parts) if (l) onLine(l, "stdout");
      }
    };

    child.stdout?.on("data", (c) => flushLines(c, false));
    child.stderr?.on("data", (c) => flushLines(c, true));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (bufOut) onLine(bufOut, "stdout");
      if (bufErr) onLine(bufErr, "stderr");
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      if (code === 0 || timedOut) {
        resolve({ stdout, stderr, combined, timedOut, exitCode: code });
      } else {
        reject(new Error(`ego-browser exited with code ${code}\n${combined}`.trim()));
      }
    });
  });
}

function parseMarkedJson(output, marker = "RESULT_JSON:") {
  const lines = String(output).split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith(marker)) {
      return JSON.parse(lines[i].slice(marker.length));
    }
  }
  throw new Error(`Ego脚本未返回有效结果。输出：\n${String(output).slice(-1200)}`);
}

export async function listEgoProfiles() {
  const code = `
const list = await profiles();
console.log("RESULT_JSON:" + JSON.stringify(list));
`;
  const { combined } = await runEgoScript("list-profiles", code, 30_000);
  return parseMarkedJson(combined);
}

export async function finishEgoSpace(spaceId) {
  const idNum = Number(spaceId);
  const code = `
const entry = (await listTaskSpaces()).find((s) => s.id === ${idNum});
if (entry) {
  const task = entry.ownership === "user"
    ? await claimTaskSpace(${idNum})
    : entry.ownership === "agentDelegatedToUser"
      ? await takeOverTaskSpace(${idNum})
      : await taskSpace(${idNum});
  await task.finish({ keep: [] });
}
console.log("RESULT_JSON:" + JSON.stringify({ closed: true, spaceId: ${idNum} }));
`;
  const { combined } = await runEgoScript("finish-space", code, 30_000);
  return parseMarkedJson(combined);
}

export async function searchCompaniesViaEgo(companyNames = [], profileId = "Profile 1", onLog = () => {}) {
  const uniqueNames = [...new Set(companyNames.map((s) => String(s || "").trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return {};

  acquireLock(`企业三段式深度尽调（${uniqueNames.length} 家公司）`);
  try {
    onLog(`正在通过 Ego 进行工商全称核验 + 背调查个税 + 知乎/脉脉口碑排查（${uniqueNames.length} 家）...`);
    const code = `
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const companies = ${JSON.stringify(uniqueNames)};
const task = await taskSpace("boss-intel-search-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
const results = {};
try {
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));

async function queryBaidu(wd) {
  const url = "https://www.baidu.com/s?wd=" + encodeURIComponent(wd);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 22000 }).catch(() => {});
  await page.waitForTimeout(randDelay(1300, 2100));
  const needVerify = await page.evaluate(() => /wappass\\.baidu\\.com|安全验证/.test(location.href + (document.title || "")));
  if (needVerify) return { blocked: true, items: [] };
  const items = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("#content_left .c-container, #content_left .result").forEach((el) => {
      const title = (el.querySelector("h3")?.innerText || "").trim();
      const href = el.querySelector("h3 a")?.href || "";
      const snippet = (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 380);
      if (title && snippet) out.push({ title, url: href, snippet });
    });
    return out.slice(0, 7);
  });
  return { blocked: false, items };
}

for (let i = 0; i < companies.length; i++) {
  const name = companies[i];
  const shortBrand = name
    .replace(/^(?:中国|广东|深圳|广州|北京|上海|杭州|成都|河北|香港)/g, "")
    .replace(/(?:科技游戏|信息技术|网络科技|教育科技|电子科技|广告传媒|数字科技|科技有限公司|有限责任公司|股份有限公司|科技|信息|网络|软件|智能|电子|股份|有限|责任|公司|集团|游戏|传媒|贸易|教育|咨询|服饰|服务|（.*?）|\\(.*?\\))/g, "")
    .trim();

  // Stage 1: 工商全称、实缴资本与天眼查/爱企查资质
  const q1 = shortBrand && shortBrand.length >= 2 && shortBrand !== name
    ? \`("\${name}" OR "\${shortBrand}") (爱企查 OR 天眼查 OR 企查查 OR 有限公司)\`
    : \`"\${name}" (爱企查 OR 天眼查 OR 企查查 OR 有限公司)\`;
  const r1 = await queryBaidu(q1);
  if (r1.blocked) { results[name] = { query: q1, blocked: true }; break; }

  // 从 Stage 1 抽出工商注册全称
  let registeredName = "";
  const fullRe = /([\\u4e00-\\u9fa5]{2,22}(?:股份有限公司|有限责任公司|有限公司))/g;
  const counts = new Map();
  const stem = shortBrand.slice(0, 2);
  for (const it of r1.items) {
    const txt = \`\${it.title} \${it.snippet}\`;
    for (const m of txt.matchAll(fullRe)) {
      if ((shortBrand.length >= 2 && m[1].includes(shortBrand)) || (stem.length >= 2 && m[1].includes(stem)) || m[1].includes(name)) {
        counts.set(m[1], (counts.get(m[1]) || 0) + 1);
      }
    }
  }
  registeredName = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] || "";

  const entityExpr = registeredName && registeredName !== name
    ? \`("\${registeredName}" OR "\${name}"\${shortBrand.length >= 2 ? \` OR "\${shortBrand}"\` : ""})\`
    : (shortBrand && shortBrand.length >= 2 && shortBrand !== name ? \`("\${name}" OR "\${shortBrand}")\` : \`"\${name}"\`);

  // Stage 2: 入职背调、第三方背调机构与查个税流水
  const q2 = \`\${entityExpr} (背调 OR 背景调查 OR 个税 OR 流水 OR 离职证明 OR 社保截图)\`;
  const r2 = await queryBaidu(q2);
  if (r2.blocked) { results[name] = { query: q2, blocked: true }; break; }

  // Stage 3: 知乎/看准/脉脉职场口碑、欠薪/裁员/PUA雷区
  const q3 = \`\${entityExpr} (知乎 OR 看准 OR 脉脉 OR 欠薪 OR 拖欠工资 OR 裁员 OR PUA OR 外包)\`;
  const r3 = await queryBaidu(q3);
  if (r3.blocked) { results[name] = { query: q3, blocked: true }; break; }

  results[name] = {
    query: \`\${q1} || \${q2} || \${q3}\`,
    blocked: false,
    registeredName,
    creditItems: r1.items,
    bgItems: r2.items,
    repItems: r3.items,
  };
  if (i < companies.length - 1) {
    await page.waitForTimeout(randDelay(1200, 2000));
  }
}
} finally {
  await task.finish({ keep: [] }).catch(() => {});
}
console.log("RESULT_JSON:" + JSON.stringify({ status: "OK", results }));
`;
    const { combined } = await runEgoScript("baidu-intel", code, Math.max(90_000, uniqueNames.length * 25_000));
    const parsed = parseMarkedJson(combined);
    return parsed.results || {};
  } finally {
    releaseLock();
  }
}

export async function syncResumeFromBoss(trackKey, profileId, onLog = () => {}) {
  acquireLock(`读取 ${trackKey} 轨简历 (${profileId})`);
  try {
    onLog(`正在使用 Ego 配置 ${profileId} 打开 Boss直聘在线简历页面（低速模拟真人）...`);
    const code = `
const task = await taskSpace("boss-sync-resume-${trackKey}-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
await page.goto("https://www.zhipin.com/web/geek/resume", { waitUntil: "domcontentloaded", timeout: 25000 });
await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
await page.waitForTimeout(2400 + Math.floor(Math.random() * 1200));
await page.mouse.wheel(0, 260, { label: "scroll resume gently" });
await page.waitForTimeout(900);

const url = await page.url();
const parsed = await page.evaluate(() => {
  const body = (document.body?.innerText || "");
  const needVerify = /verify-slider|security-check|\\/security(?:\\/|$)|\\/web\\/user/i.test(location.pathname)
    || /请完成安全验证|拖动滑块|扫码登录|手机号登录|密码登录/.test(body.slice(0, 600));
  if (needVerify) {
    return { needVerify: true, preview: body.slice(0, 250) };
  }
  const getTxt = (sel) => (document.querySelector(sel)?.innerText || "").trim();
  const baseText = getTxt(".resume-baseInfo, .resume-userinfo");
  const summaryText = getTxt(".resume-userDesc, .resume-summary");
  const expectText = getTxt(".resume-expectList, .resume-purpose");
  const workText = getTxt(".resume-workExpList, .resume-history");
  const projectText = getTxt(".resume-projectExpList, .resume-project");
  const eduText = getTxt(".resume-educationExpList, .resume-education");
  const skillText = getTxt(".resume-professionalSkill, .resume-professional-skill");
  const certText = getTxt(".resume-certificationList, .resume-certification");

  const lines = baseText.split(/\\n+/).map(s => s.trim()).filter(Boolean)
    .filter(s => !s.includes("邮箱是简历重要的基本信息"));
  const candidateName = lines[0] || "";
  const yearsMatch = baseText.match(/\\d+年(?:以上)?经验|应届生|在校生/);
  const yearsLabel = yearsMatch ? yearsMatch[0] : "";

  const workItems = [...document.querySelectorAll(".resume-workExpList .history-item, .resume-history .history-item")].map(el => ({
    raw: (el.innerText || "").trim(),
    company: (el.querySelector(".name, h4, .company-name")?.innerText || "").trim(),
    role: (el.querySelector(".project-name, .position, .title")?.innerText || "").trim(),
    period: (el.querySelector(".period, .time")?.innerText || "").trim(),
    content: (el.querySelector(".item-text, .text-type, .content")?.innerText || "").trim(),
  }));

  const projectItems = [...document.querySelectorAll(".resume-projectExpList .history-item, .resume-project .history-item")].map(el => ({
    raw: (el.innerText || "").trim(),
    name: (el.querySelector(".name, h4")?.innerText || "").trim(),
    role: (el.querySelector(".project-name, .position, .title")?.innerText || "").trim(),
    period: (el.querySelector(".period, .time")?.innerText || "").trim(),
    content: (el.querySelector(".item-text, .text-type, .content")?.innerText || "").trim(),
  }));

  const eduItems = [...document.querySelectorAll(".resume-educationExpList .history-item, .resume-education .history-item")].map(el => ({
    raw: (el.innerText || "").trim(),
  }));

  return {
    needVerify: false,
    candidateName,
    yearsLabel,
    baseText,
    summaryText,
    expectText,
    workText,
    projectText,
    eduText,
    skillText,
    certText,
    workItems,
    projectItems,
    eduItems,
    fullRawText: [baseText, summaryText, expectText, workText, projectText, eduText, skillText, certText].filter(Boolean).join("\\n\\n"),
  };
});

if (parsed.needVerify) {
  await task.handOff();
  console.log("RESULT_JSON:" + JSON.stringify({
    status: "VERIFICATION_REQUIRED",
    taskSpaceId: task.spaceId,
    profileId: ${JSON.stringify(profileId)},
    url,
    message: "Boss直聘需要登录或安全验证，已把控制权交给你，请在 Ego 浏览器中完成验证后重试",
  }));
} else {
  await task.finish({ keep: [] });
  console.log("RESULT_JSON:" + JSON.stringify({
    status: "OK",
    taskSpaceId: task.spaceId,
    url,
    parsed,
  }));
}
`;
    const { combined } = await runEgoScript(`sync-resume-${trackKey}`, code, 60_000);
    const res = parseMarkedJson(combined);
    if (res.status === "VERIFICATION_REQUIRED") {
      onLog(`⚠️ 账号 ${profileId} 需要人工验证/登录（TaskSpace #${res.taskSpaceId}），已移交控制权！`);
      return res;
    }
    const structured = normalizeParsedResume(trackKey, res.parsed);
    onLog(`✅ 已成功同步 ${trackKey} 轨简历（${structured.candidate_name || profileId} · ${structured.years_label || "经验未知"}）`);
    return { status: "OK", resume: structured };
  } finally {
    releaseLock();
  }
}

function normalizeParsedResume(trackKey, p) {
  const cleanSection = (txt, heading) =>
    String(txt || "").replace(new RegExp(`^${heading}\\s*`, "m"), "").trim();

  const parseHistoryByPeriod = (rawSection, isWork) => {
    // Strip trailing embedded sections and Boss UI suggestion banners inside workExpList
    let text = cleanSection(rawSection, isWork ? "工作经历" : "项目经历");
    text = text
      .replace(/当前工作经历内容填写较为简单[^\n]*\n?/g, "")
      .replace(/工作经历结束时间不是至今[^\n]*\n?/g, "")
      .replace(/\n(?:专业技能|个人总结)\n[\s\S]*$/m, "")
      .trim();
    const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);

    const periodRe = /^20\d{2}\.\d{2}\s*[-~—至]\s*(?:20\d{2}\.\d{2}|至今)$/;
    const periodIndices = [];
    for (let i = 0; i < lines.length; i++) {
      if (periodRe.test(lines[i])) periodIndices.push(i);
    }
    if (periodIndices.length === 0) return [];

    // Find start index of each block (1-3 header lines before its period line)
    const blockStarts = periodIndices.map((pIdx, idx) => {
      const prevEnd = idx === 0 ? 0 : periodIndices[idx - 1] + 1;
      let start = pIdx - 1;
      // Include role line (+ optional "实习" line) + company/project name line
      while (start > prevEnd && pIdx - start < 3 && lines[start - 1].length < 40 && !lines[start - 1].startsWith("•") && !lines[start - 1].includes("：")) {
        start--;
      }
      return Math.max(prevEnd, start);
    });

    const blocks = [];
    for (let i = 0; i < periodIndices.length; i++) {
      const start = blockStarts[i];
      const pIdx = periodIndices[i];
      const nextStart = i + 1 < blockStarts.length ? blockStarts[i + 1] : lines.length;
      const headerLines = lines.slice(start, pIdx);
      const bodyLines = lines.slice(pIdx + 1, nextStart).filter((l) => !/^内容[:：]?$/.test(l));
      const titleLine = headerLines[0] || "";
      const roleLine = headerLines.slice(1).join(" · ");
      blocks.push(
        isWork
          ? { company: titleLine, role: roleLine, period: lines[pIdx], content: bodyLines.join("\n") }
          : { name: titleLine, role: roleLine, period: lines[pIdx], content: bodyLines.join("\n") }
      );
    }
    return blocks;
  };

  const experiences = p.workItems?.length && p.workItems.some((x) => x.company || x.content)
    ? p.workItems.map((x) => ({
        company: x.company || x.raw.split("\n")[0] || "",
        role: x.role || "",
        period: x.period || "",
        content: x.content || x.raw,
      }))
    : parseHistoryByPeriod(p.workText, true);

  const projects = p.projectItems?.length && p.projectItems.some((x) => x.name || x.content)
    ? p.projectItems.map((x) => ({
        name: x.name || x.raw.split("\n")[0] || "",
        role: x.role || "",
        period: x.period || "",
        content: x.content || x.raw,
      }))
    : parseHistoryByPeriod(p.projectText, false);

  const eduLines = cleanSection(p.eduText, "教育经历").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const expIdx = eduLines.findIndex((l) => /^经历[:：]?$/.test(l));
  const eduContent = expIdx >= 0 ? eduLines.slice(expIdx + 1).join("\n").trim() : "";
  const education = eduLines.length
    ? [{
        school: eduLines[0] || "",
        period: eduLines.find((l) => /20\d{2}/.test(l)) || "",
        major: eduLines[2] || "",
        degree: eduLines.find((l) => /本科|硕士|大专|博士/.test(l)) || "",
        content: eduContent,
      }]
    : [];

  const skillText = cleanSection(p.skillText, "专业技能");
  const knownSkillTokens = [
    "Python", "Pytest", "HTTPX", "asyncio", "FastAPI", "Playwright", "Selenium", "Requests", "Allure",
    "Postman", "Apifox", "JMeter", "Docker", "Linux", "SQL", "MySQL", "SQLite", "Java", "Git",
    "RAG", "LLM", "Prompt", "MCP", "Function Call", "DeepSeek", "LangChain", "React", "Wireshark", "Charles",
  ];
  const skills = knownSkillTokens.filter((k) =>
    `${p.fullRawText}`.toLowerCase().includes(k.toLowerCase())
  );
  if (skillText && skills.length < 4) {
    skills.push(...skillText.split(/[，,。\n；;]+/).map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= 24).slice(0, 8));
  }

  return {
    track_key: trackKey,
    source: "boss_ego_sync",
    candidate_name: p.candidateName || "",
    years_label: p.yearsLabel || "1年经验",
    summary: cleanSection(p.summaryText, "个人优势"),
    skills: [...new Set(skills)],
    experiences,
    projects,
    education,
    raw_text: (p.fullRawText || "").replace(/当前工作经历内容填写较为简单[^\n]*\n?/g, ""),
    synced_at: new Date().toISOString(),
  };
}

export function buildBossSearchUrl({
  query = "AI测试",
  city = "101280100",
  jobType = "",
  experience = "",
  salary = "",
} = {}) {
  const params = new URLSearchParams();
  params.set("city", String(city || "101280100"));
  params.set("query", String(query || "AI测试"));
  if (jobType) params.set("jobType", String(jobType));
  if (experience) params.set("experience", String(experience));
  if (salary) params.set("salary", String(salary));
  return `https://www.zhipin.com/web/geek/jobs?${params.toString()}`;
}

/**
 * 判断 Boss直聘页面是否处于登录/安全验证拦截态（只检查 pathname，避免误伤 ?securityId= 参数）。
 */
export function isBossVerificationUrl(rawUrl, bodyText = "") {
  let pathname = "";
  try {
    pathname = new URL(String(rawUrl || "")).pathname;
  } catch {
    pathname = String(rawUrl || "").split("?")[0];
  }
  return /verify-slider|security-check|\/security(?:\/|$)|\/web\/user/i.test(pathname)
    || /请完成安全验证|拖动滑块|点击按钮进行验证|访问异常|账号异常|扫码登录/.test(String(bodyText || ""));
}

export async function scrapeBossJobs({
  profileId,
  query = "AI测试",
  city = "101280100",
  maxJobs = 8,
  minHrActive = "week",
  minDelayMs = 4500,
  maxDelayMs = 8500,
  existingIds = [],
  skipExisting = true,
  filterMinSalaryK = 7,
  excludeIntern = true,
  excludeNonQa = true,
  targetCityName = "广州",
  bossJobType = "",
  bossExperience = "",
  bossSalary = "",
  maxClicksPerStep = 32,
  onLog = () => {},
}) {
  const safeMax = Math.max(1, Math.min(50, Number(maxJobs) || 8));
  const safeMinDelay = Math.max(3000, Number(minDelayMs) || 4500);
  const safeMaxDelay = Math.max(safeMinDelay + 1000, Number(maxDelayMs) || 8500);
  const safeClickBudget = Math.max(safeMax + 5, Math.min(55, Number(maxClicksPerStep) || 32));

  acquireLock(`抓取 Boss 岗位「${query}」(${profileId})`);
  try {
    const filterTags = [
      bossJobType === "1901" ? "全职" : "",
      bossExperience ? `经验[${bossExperience}]` : "",
      bossSalary ? `薪资[${bossSalary}]` : "",
    ].filter(Boolean);
    onLog(`启动增量低频采集：配置 ${profileId}，关键词「${query}」，目标新增 ${safeMax} 条（跳过 ${existingIds.length} 条已知岗${filterTags.length ? ` · Boss原生筛选: ${filterTags.join("/")}` : ""}）`);
    const searchUrl = buildBossSearchUrl({
      query,
      city,
      jobType: bossJobType,
      experience: bossExperience,
      salary: bossSalary,
    });
    const code = `
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const knownSet = new Set(${JSON.stringify(existingIds)});
const skipExisting = ${JSON.stringify(Boolean(skipExisting))};
const filterMinSalaryK = ${JSON.stringify(Number(filterMinSalaryK ?? 7))};
const excludeIntern = ${JSON.stringify(Boolean(excludeIntern))};
const excludeNonQa = ${JSON.stringify(Boolean(excludeNonQa))};
const targetCityName = ${JSON.stringify(String(targetCityName || "广州").replace(/市$/, ""))};
const maxClickBudget = ${safeClickBudget};

function parseSalaryMinK(sal) {
  const s = String(sal || "");
  if (!s || /面议/.test(s)) return null;
  const dayM = s.match(/(\\d+(?:\\.\\d+)?)\\s*[-~到至]?\\s*\\d*\\s*元?\\s*\\/\\s*天/);
  if (dayM) return Number(((Number(dayM[1]) * 21.75) / 1000).toFixed(1));
  const kM = s.match(/(\\d+(?:\\.\\d+)?)\\s*[-~到至]\\s*\\d+(?:\\.\\d+)?\\s*[kK千]/);
  if (kM) return Number(kM[1]);
  const sM = s.match(/(\\d+(?:\\.\\d+)?)\\s*[kK千]/);
  return sM ? Number(sM[1]) : null;
}

const task = await taskSpace("boss-scrape-jobs-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
let handedOff = false;
const collected = [];
const seenIds = new Set();
let skippedExisting = 0;
let skippedPreFilter = 0;
let detailClicks = 0;
let scannedIdx = 0;

try {
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
await page.goto(${JSON.stringify(searchUrl)}, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector(".job-card-wrap", { timeout: 10000 }).catch(() => {});
await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(randDelay(2200, 3600));

async function checkVerify() {
  return await page.evaluate(() => {
    const body = (document.body?.innerText || "").slice(0, 700);
    return /verify-slider|security-check|\\/security(?:\\/|$)|\\/web\\/user/i.test(location.pathname)
      || /请完成安全验证|拖动滑块|点击按钮进行验证|访问异常|账号异常|扫码登录/.test(body);
  });
}

if (await checkVerify()) {
  handedOff = true;
  await task.handOff();
  console.log("RESULT_JSON:" + JSON.stringify({
    status: "VERIFICATION_REQUIRED",
    taskSpaceId: task.spaceId,
    url: await page.url(),
    jobs: [],
    stats: { scannedCards: 0, detailClicks: 0, skippedExisting: 0, skippedPreFilter: 0 },
  }));
  process.exit(0);
}

const totalTarget = ${safeMax};
const maxScanCards = Math.min(165, Math.max(75, totalTarget * 4 + 30));
let scrollStalls = 0;

for (let idx = 0; idx < maxScanCards && collected.length < totalTarget && detailClicks < maxClickBudget; idx++) {
  scannedIdx = idx + 1;
  let cardCount = await page.evaluate(() => document.querySelectorAll(".job-card-wrap").length);
  while (idx >= cardCount && scrollStalls < 3) {
    // 滚到底部触发 Boss 无限滚动加载更多（15 -> 30 -> 45...）
    await page.evaluate(() => {
      const cards = document.querySelectorAll(".job-card-wrap");
      cards[cards.length - 1]?.scrollIntoView({ block: "end" });
      window.scrollBy(0, 620);
    }).catch(() => {});
    await page.mouse.wheel(0, 560, { label: "scroll job list slowly" }).catch(() => {});
    await page.waitForTimeout(randDelay(2200, 3400));
    const afterCount = await page.evaluate(() => document.querySelectorAll(".job-card-wrap").length);
    if (afterCount <= cardCount) {
      scrollStalls++;
      if (scrollStalls >= 2) break;
    } else {
      scrollStalls = 0;
    }
    cardCount = afterCount;
  }
  if (idx >= cardCount) break;

  // 在列表卡片层面先读 Vue 元数据：已知岗位 & 明显杂岗直接零点击跳过，大幅降低风控命中
  const listMeta = await page.evaluate((i) => {
    const el = document.querySelectorAll(".job-card-wrap")[i];
    if (!el) return null;
    const d = el.__vue__?.data || {};
    const href = el.querySelector("a.job-name")?.getAttribute("href") || "";
    const encId = d.encryptJobId || href.split("?")[0] || "";
    return {
      encryptId: encId,
      jobName: d.jobName || (el.querySelector(".job-name")?.innerText || "").trim(),
      brandName: d.brandName || "",
      salaryDesc: d.salaryDesc || "",
      jobExperience: d.jobExperience || "",
      daysPerWeekDesc: d.daysPerWeekDesc || "",
      cityName: d.cityName || "",
      outland: Boolean(d.outland),
    };
  }, idx);
  if (!listMeta) break;

  if (skipExisting && listMeta.encryptId && (knownSet.has(listMeta.encryptId) || seenIds.has(listMeta.encryptId))) {
    skippedExisting++;
    continue;
  }

  // 列表零点击预筛：拦截实习、明显5年以上、低于最低薪资、<本市异地>与明显非测试岗位
  let preSkipReason = "";
  const t = String(listMeta.jobName || "");
  const exp = String(listMeta.jobExperience || "");
  if (excludeIntern && (/实习|兼职|校招|管培生|暑期/.test(t) || listMeta.daysPerWeekDesc || /(天\\/周|个月|在校|应届)/.test(exp))) {
    preSkipReason = "实习/应届";
  } else if (/^(?:5-10年|5年以上|10年以上)/.test(exp)) {
    preSkipReason = "经验>=5年";
  } else if (filterMinSalaryK > 0) {
    const salMin = parseSalaryMinK(listMeta.salaryDesc);
    if (salMin !== null && salMin < filterMinSalaryK) preSkipReason = "低于起薪";
  }
  if (!preSkipReason && (listMeta.outland || (listMeta.cityName && targetCityName && !listMeta.cityName.includes(targetCityName)))) {
    preSkipReason = "异地";
  }
  if (!preSkipReason && excludeNonQa) {
    const obviousNonQa = /销售|商务|BD|客服|运营|产品经理|产品专家|产品策划|Java开发|前端开发|后端开发|全栈开发|算法工程师|解决方案工程师|实施工程师|自动驾驶|智能驾驶|智驾测试|路测员|安全员|动环|充电桩|电气.*调试|自控调试|硬件测试|元器件测试|整车集成|车身域|EMC|安规|射频测试|测试\\s*[\\/／]\\s*(?:C|Java|Python|开发)/i.test(t);
    if (obviousNonQa && !/软件测试|AI测试|大模型测试|模型评测|AI评测/.test(t)) {
      preSkipReason = "明显非软件AI测";
    }
  }
  if (preSkipReason) {
    skippedPreFilter++;
    continue;
  }

  // 通过列表预筛后才执行真人点击读取详情
  const targetPoint = await page.evaluate((i) => {
    const cards = document.querySelectorAll(".job-card-wrap");
    const el = cards[i];
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const cData = el.__vue__?.data || {};
    return {
      x: Math.round(r.left + r.width * 0.82),
      y: Math.round(r.top + r.height * 0.78),
      expectedEncryptId: cData.encryptJobId || "",
    };
  }, idx);
  if (!targetPoint) break;

  await page.waitForTimeout(randDelay(700, 1400));
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 6, label: "move to job card" }).catch(() => {});
  await page.mouse.click(targetPoint.x, targetPoint.y, { label: "select job card" });
  detailClicks++;
  await page.waitForTimeout(randDelay(1800, 3000));

  if (await checkVerify()) {
    handedOff = true;
    await task.handOff();
    console.log("RESULT_JSON:" + JSON.stringify({
      status: "VERIFICATION_REQUIRED",
      taskSpaceId: task.spaceId,
      url: await page.url(),
      jobs: collected,
      stats: { scannedCards: scannedIdx, detailClicks, skippedExisting, skippedPreFilter },
    }));
    process.exit(0);
  }

  if (targetPoint.expectedEncryptId) {
    await page.waitForFunction(
      (expId) => {
        const d = document.querySelector(".job-detail-box")?.__vue__?.data;
        return d?.jobInfo?.encryptId === expId;
      },
      targetPoint.expectedEncryptId,
      { timeout: 6000 }
    ).catch(() => {});
  }

  await page.mouse.move(780, 420, { steps: 5, label: "move to job detail" }).catch(() => {});
  await page.mouse.wheel(0, 240, { label: "read jd details" }).catch(() => {});
  await page.waitForTimeout(randDelay(${safeMinDelay}, ${safeMaxDelay}));
  // 分段休眠防风控：每 12 次实点休息 14-22 秒，每 6 次小憩 4.5-7.5 秒
  if (detailClicks > 0 && detailClicks % 12 === 0) {
    const segMs = randDelay(14000, 22000);
    console.error(\`[COOLDOWN] 已连续点看 \${detailClicks} 个新详情，分段休眠 \${Math.round(segMs / 1000)}s 防风控...\`);
    await page.waitForTimeout(segMs);
  } else if (detailClicks > 0 && detailClicks % 6 === 0) {
    await page.waitForTimeout(randDelay(4500, 7500));
  }

  const item = await page.evaluate((i) => {
    const cardEl = document.querySelectorAll(".job-card-wrap")[i];
    const cardVue = cardEl?.__vue__?.data || {};
    const detailEl = document.querySelector(".job-detail-box");
    const detailVue = detailEl?.__vue__?.data || {};
    const jobInfo = detailVue.jobInfo || {};
    const brandComInfo = detailVue.brandComInfo || {};
    const bossInfo = detailVue.bossInfo || {};

    const jobTitle = jobInfo.jobName || cardVue.jobName || (detailEl?.querySelector(".job-name")?.innerText || "").trim();
    const companyName = brandComInfo.brandName || cardVue.brandName || (cardEl?.querySelector(".boss-name")?.innerText || "").trim();
    const scale = brandComInfo.scaleName || cardVue.brandScaleName || "";
    const financing = brandComInfo.stageName || cardVue.brandStageName || "";
    const industry = brandComInfo.industryName || cardVue.brandIndustry || "";
    const recruiterTitle = bossInfo.title || cardVue.bossTitle || "";
    const recruiterName = bossInfo.name || cardVue.bossName || "";
    const salaryRange = jobInfo.salaryDesc || cardVue.salaryDesc || (detailEl?.querySelector(".job-salary")?.innerText || "").trim();
    const jdText = jobInfo.postDescription || (detailEl?.querySelector(".job-detail-body .desc")?.innerText || "").trim();
    const companyIntro = (brandComInfo.introduce || "").trim();
    const recruiterActive = bossInfo.activeTimeDesc || (cardVue.bossOnline ? "在线" : "") || "";
    const moreHref = detailEl?.querySelector(".more-job-btn")?.getAttribute("href") || cardEl?.querySelector("a.job-name")?.getAttribute("href") || "";
    const externalId = jobInfo.encryptId || cardVue.encryptJobId || moreHref.split("?")[0] || (companyName + "::" + jobTitle);
    const domAddress = (detailEl?.querySelector(".location-address, .job-address")?.innerText || "")
      .replace(/^工作地址\\s*/g, "")
      .replace(/点击查看地图/g, "")
      .trim();
    const workAddress = (jobInfo.address || domAddress || "").trim();
    const areaDistrict = [cardVue.areaDistrict, cardVue.businessDistrict].filter(Boolean).join("·");

    return {
      external_id: externalId,
      job_title: jobTitle,
      company_name: companyName,
      customer_brand: brandComInfo.customerBrandName || "",
      scale,
      financing,
      industry,
      city: jobInfo.locationName || cardVue.cityName || "",
      area_district: areaDistrict,
      work_address: workAddress,
      longitude: jobInfo.longitude ?? null,
      latitude: jobInfo.latitude ?? null,
      recruiter_title: recruiterTitle,
      recruiter_name: recruiterName,
      recruiter_active: recruiterActive,
      salary_range: salaryRange,
      experience_req: jobInfo.experienceName || cardVue.jobExperience || "",
      education_req: jobInfo.degreeName || cardVue.jobDegree || "",
      jd_text: jdText,
      company_intro: companyIntro,
      job_url: moreHref ? (moreHref.startsWith("http") ? moreHref : "https://www.zhipin.com" + moreHref) : location.href,
    };
  }, idx);

  const activePolicy = ${JSON.stringify(minHrActive)};
  const passesActive = (() => {
    const act = String(item?.recruiter_active || "");
    if (!act || activePolicy === "all") return true;
    if (/离线|半年前|3月前|半年内|三月内|2月前/.test(act)) return false;
    if (activePolicy === "today") return /在线|刚刚|分钟|小时|今日/.test(act);
    if (activePolicy === "3days") return /在线|刚刚|分钟|小时|今日|昨日|3日|[1-3]天内/.test(act);
    if (activePolicy === "week") return /在线|刚刚|分钟|小时|今日|昨日|天内|本周|3日|7日/.test(act);
    if (activePolicy === "month") return !/半年前|3月前|三月内|半年内/.test(act);
    return true;
  })();

  if (item && item.company_name && item.job_title && !passesActive) {
    console.error(\`[SKIP INACTIVE] \${item.company_name} | \${item.job_title}（HR状态：\${item.recruiter_active}）\`);
    continue;
  }

  if (item && item.company_name && item.job_title && !seenIds.has(item.external_id)) {
    seenIds.add(item.external_id);
    collected.push(item);
    console.log("ITEM_JSON:" + JSON.stringify(item));
    console.error(\`[SCRAPED \${collected.length}/\${totalTarget}] \${item.company_name} | \${item.job_title} | \${item.salary_range}\`);
  }
}
} finally {
  if (!handedOff) {
    await task.finish({ keep: [] }).catch(() => {});
  }
}

console.log("RESULT_JSON:" + JSON.stringify({
  status: "OK",
  taskSpaceId: task.spaceId,
  jobs: collected,
  stats: { scannedCards: scannedIdx, detailClicks, skippedExisting, skippedPreFilter },
}));
`;
    const streamedJobs = [];
    const { combined, timedOut } = await runEgoScript(
      "scrape-jobs",
      code,
      Math.max(480_000, safeClickBudget * 28_000),
      {
        onLine: (line, src) => {
          if (line.startsWith("ITEM_JSON:")) {
            try { streamedJobs.push(JSON.parse(line.slice("ITEM_JSON:".length))); } catch {}
          } else if (line.startsWith("RESULT_JSON:")) {
            // handled after exit
          } else if (src === "stderr" || line.startsWith("[")) {
            onLog(line);
          }
        },
      }
    );
    let res;
    try {
      res = parseMarkedJson(combined);
    } catch (parseErr) {
      if (streamedJobs.length > 0 || timedOut) {
        onLog(`⏱️ 采集接近单批时间保护线，已自动抢救保留已读到的 ${streamedJobs.length} 条新岗位！`, "warn");
        return {
          status: "OK",
          taskSpaceId: null,
          jobs: streamedJobs,
          stats: { scannedCards: 0, detailClicks: streamedJobs.length, skippedExisting: 0, skippedPreFilter: 0 },
        };
      }
      throw parseErr;
    }
    const st = res.stats || {};
    if (res.status === "VERIFICATION_REQUIRED") {
      onLog(`⚠️ 抓取过程中遇到安全验证（TaskSpace #${res.taskSpaceId}），已停止并交出控制权！已省 ${st.skippedExisting || 0}+${st.skippedPreFilter || 0} 次点击，抓到 ${res.jobs.length} 条。`);
    } else {
      onLog(`✅ 增量采集完成：翻扫 ${st.scannedCards || 0} 张（跳过已存 ${st.skippedExisting || 0}、预筛省点击 ${st.skippedPreFilter || 0}），实点详情 ${st.detailClicks || 0} 次，新采 ${res.jobs.length} 条。`);
    }
    return res;
  } finally {
    releaseLock();
  }
}

export async function openBossJobPage({
  profileId = "Profile 1",
  jobUrl = "",
  companyName = "",
  jobTitle = "",
  onLog = () => {},
}) {
  const targetUrl =
    jobUrl && /^https?:\/\//i.test(jobUrl)
      ? jobUrl
      : `https://www.zhipin.com/web/geek/jobs?query=${encodeURIComponent(`${companyName} ${jobTitle}`.trim())}`;
  acquireLock(`打开岗位详情页「${companyName} · ${jobTitle}」(${profileId})`);
  try {
    onLog(`正在使用 ${profileId} 在 Ego 浏览器打开「${companyName} · ${jobTitle}」...`);
    const code = `
const task = await taskSpace("boss-open-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: "domcontentloaded", timeout: 25000 });
await page.waitForTimeout(1600);
await task.handOff();
console.log("RESULT_JSON:" + JSON.stringify({
  status: "HANDOFF",
  taskSpaceId: task.spaceId,
  url: await page.url(),
  message: "已在 Ego 浏览器打开岗位页面并交给你操作，你可以直接查看或发起沟通、发送简历",
}));
`;
    const { combined } = await runEgoScript("open-job-page", code, 45_000);
    const res = parseMarkedJson(combined);
    onLog(`🔗 ${res.message} (TaskSpace #${res.taskSpaceId})`);
    return res;
  } finally {
    releaseLock();
  }
}

export async function prepareBossDelivery({
  profileId,
  jobUrl,
  companyName,
  jobTitle,
  greetingText,
  autoSend = true,
  sendImageResume = true,
  imagePath = "",
  onlySendImage = false,
  allowAlreadyContacted = false,
  onLog = () => {},
}) {
  const targetUrl =
    jobUrl && /^https?:\/\//i.test(jobUrl)
      ? jobUrl
      : `https://www.zhipin.com/web/geek/jobs?query=${encodeURIComponent(`${companyName} ${jobTitle}`.trim())}`;
  const hasImage = Boolean(sendImageResume && imagePath && fs.existsSync(imagePath));
  const normalizedImagePath = hasImage ? imagePath.replace(/\\/g, "/") : "";

  acquireLock(`打招呼「${companyName} · ${jobTitle}」(${profileId})`);
  try {
    onLog(`正在使用 ${profileId} 打开岗位/聊天框（${companyName} · ${jobTitle}）...`);
    const code = `
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const task = await taskSpace("boss-deliver-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));

await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: "domcontentloaded", timeout: 25000 });
await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
await page.waitForTimeout(randDelay(2200, 3600));

const verifyState = await page.evaluate(() => {
  const body = (document.body?.innerText || "").slice(0, 700);
  const needVerify = /verify-slider|security-check|\\/security(?:\\/|$)|\\/web\\/user/i.test(location.pathname)
    || /请完成安全验证|拖动滑块|点击按钮进行验证|访问异常|账号异常|扫码登录/.test(body);
  const chatBtn = document.querySelector(".btn-startchat, .op-btn-chat");
  return {
    needVerify,
    url: location.href,
    chatBtnText: (chatBtn?.innerText || "").trim(),
  };
});

if (verifyState.needVerify) {
  await task.handOff();
  console.log("RESULT_JSON:" + JSON.stringify({
    status: "VERIFICATION_REQUIRED",
    taskSpaceId: task.spaceId,
    url: verifyState.url,
    message: "Boss直聘需要登录或安全验证，请在 Ego 中完成后再继续",
  }));
  process.exit(0);
}

await page.mouse.wheel(0, 220, { label: "review job before chat" }).catch(() => {});
await page.waitForTimeout(randDelay(1000, 1800));

if (verifyState.chatBtnText.includes("立即沟通")) {
  await page.click(".btn-startchat, .op-btn-chat", { label: "click start chat" });
  await page.waitForTimeout(randDelay(2200, 3400));
} else if (verifyState.chatBtnText.includes("继续沟通")) {
  await page.click(".btn-startchat, .op-btn-chat", { label: "open existing chat" });
  await page.waitForTimeout(randDelay(2000, 3000));
}

if (await page.evaluate(() => /verify-slider|security-check|\\/security(?:\\/|$)/i.test(location.pathname) || /请完成安全验证|拖动滑块/.test(document.body?.innerText || ""))) {
  await task.handOff();
  console.log("RESULT_JSON:" + JSON.stringify({
    status: "VERIFICATION_REQUIRED",
    taskSpaceId: task.spaceId,
    url: await page.url(),
    message: "点击沟通后触发安全验证，已移交给你在 Ego 浏览器处理",
  }));
  process.exit(0);
}

const inputSelector = "div.chat-input[contenteditable='true'], textarea.input-area, .edit-area [contenteditable='true'], .greet-boss-dialog textarea, .chat-conversation [contenteditable='true']";
const hasInput = await page.waitForSelector(inputSelector, { state: "visible", timeout: 8000 }).then(() => true).catch(() => false);

const shouldAutoSend = ${JSON.stringify(Boolean(autoSend))};
const allowAlreadyContacted = ${JSON.stringify(Boolean(allowAlreadyContacted))};
const alreadyContactedOnBoss = Boolean(${JSON.stringify(!onlySendImage)} && !allowAlreadyContacted && verifyState.chatBtnText.includes("继续沟通"));
const shouldSendText = Boolean(${JSON.stringify(Boolean(!onlySendImage && greetingText))} && !alreadyContactedOnBoss);
const shouldSendImg = ${JSON.stringify(Boolean(hasImage))};
const imgFilePath = ${JSON.stringify(normalizedImagePath)};
let textSent = alreadyContactedOnBoss;
let imageSent = false;
let imageBlockedReason = "";

if (hasInput && shouldSendText) {
  await page.click(inputSelector, { label: "focus chat input" });
  await page.waitForTimeout(450);
  await page.fill(inputSelector, ${JSON.stringify(greetingText)}).catch(async () => {
    await page.keyboard.paste(${JSON.stringify(greetingText)});
  });
  await page.waitForTimeout(randDelay(700, 1200));
  if (shouldAutoSend) {
    await page.click("button.btn-send, .btn-send", { label: "send greeting message" }).catch(async () => {
      await page.press(inputSelector, "Enter");
    });
    textSent = true;
    await page.waitForTimeout(randDelay(1400, 2200));
  }
}

if (shouldSendImg) {
  const canOpenChat = await page.evaluate(() => {
    if (!location.pathname.includes("/job_detail/")) return false;
    const btn = document.querySelector(".btn-startchat, .op-btn-chat");
    return Boolean(btn && (btn.innerText || "").includes("继续沟通"));
  }).catch(() => false);
  if (canOpenChat) {
    await page.click(".btn-startchat, .op-btn-chat", { label: "enter full chat for image" }).catch(() => {});
    await page.waitForTimeout(randDelay(2000, 2800));
  }

  // 检测 Boss 聊天框顶部的「发送图片」控件是否可用
  const imgBtnState = await page.evaluate(() => {
    const wrap = document.querySelector(".btn-sendimg, [aria-label='发送图片']");
    const inp = wrap?.querySelector("input[type='file']")
      || [...document.querySelectorAll(".chat-conversation input[type='file'], .chat-im input[type='file']")].find((i) => /image\\/gif|image\\/png/i.test(i.accept || ""));
    if (!inp) return { found: false, reason: "当前页面未展开完整聊天工具栏" };
    const cls = [wrap?.className || "", wrap?.parentElement?.className || ""].join(" ");
    const tip = (wrap?.innerText || wrap?.getAttribute("title") || wrap?.parentElement?.innerText || "").trim();
    const disabled = Boolean(inp.disabled || /unable|disable/i.test(cls) || /回复后/.test(tip));
    if (disabled) return { found: true, enabled: false, reason: tip || "Boss 限制需对方回复后才可发送图片" };
    inp.setAttribute("data-ego-chat-img", "1");
    return { found: true, enabled: true };
  });

  if (imgBtnState.found && imgBtnState.enabled) {
    await page.setInputFiles("input[data-ego-chat-img='1']", [imgFilePath]);
    await page.waitForTimeout(1600);

    // 部分版本上传图片后会弹出确认框（发送 / 确定）或直接发出，检查是否存在确认按钮或拦截提示
    const afterSet = await page.evaluate((doConfirm) => {
      const toastTxt = [...document.querySelectorAll(".toast, [class*='toast'], .boss-popup__content, .dialog-wrap")]
        .filter((el) => getComputedStyle(el).display !== "none" && el.offsetHeight > 5)
        .map((el) => (el.innerText || "").trim())
        .join(" ");
      if (/回复后.*发送|暂不支持|频繁/.test(toastTxt)) {
        return { blocked: true, reason: toastTxt.slice(0, 80) };
      }
      const wraps = [...document.querySelectorAll(".dialog-wrap, .boss-popup__wrapper")].filter((el) => {
        const s = getComputedStyle(el);
        return s.display !== "none" && s.visibility !== "hidden" && el.offsetHeight > 40;
      });
      for (const w of wraps) {
        const btn = [...w.querySelectorAll("button, .btn, span.btn, a.btn")].find((b) =>
          /^(?:发送|确定|确认发送|确认)$/.test((b.innerText || "").trim())
        );
        if (btn && doConfirm) {
          btn.setAttribute("data-ego-confirm-img", "1");
          return { blocked: false, needClickConfirm: true };
        }
      }
      return { blocked: false, needClickConfirm: false };
    }, shouldAutoSend);

    if (afterSet.blocked) {
      imageBlockedReason = afterSet.reason;
    } else {
      if (afterSet.needClickConfirm && shouldAutoSend) {
        await page.click("[data-ego-confirm-img='1'] >> nth=0", { label: "confirm send resume image" }).catch(() => {});
      }
      await page.waitForTimeout(1800);
      if (shouldAutoSend) imageSent = true;
    }
  } else {
    imageBlockedReason = imgBtnState.reason || "需对方回复后才可发图";
  }
}

if (alreadyContactedOnBoss) {
  const finalUrl = await page.url().catch(() => "");
  await task.finish({ keep: [] });
  const message = imageSent
    ? "🛡️ 检测到 Boss 之前已与该岗位沟通过（「继续沟通」），已跳过重复发文字并直接补发图片简历！"
    : "🛡️ 检测到 Boss 上此前已和该岗位沟通过（「继续沟通」），已拦截重复发招呼语并自动同步记录";
  console.log("RESULT_JSON:" + JSON.stringify({
    status: "ALREADY_CONTACTED_ON_BOSS",
    alreadyContactedOnBoss: true,
    textSent: true,
    imageSent,
    imageBlockedReason,
    taskSpaceId: task.spaceId,
    url: finalUrl,
    message,
  }));
  process.exit(0);
}

if (shouldAutoSend && (textSent || imageSent)) {
  const finalUrl = await page.url().catch(() => "");
  await task.finish({ keep: [] });
  const status = imageSent
    ? "SENT_WITH_IMAGE"
    : (shouldSendImg ? "SENT_TEXT_PENDING_IMAGE" : "SENT");
  const message = imageSent && textSent
    ? "✅ 已自动发出专属招呼语 + 高清图片简历！"
    : imageSent
      ? "✅ 已自动发出高清图片简历！"
      : shouldSendImg
        ? \`✅ 已发出专属招呼语（\${imageBlockedReason || "对方回复前暂不可发图"}，HR 回复后点「补发图片简历」秒发）\`
        : "✅ 已自动发出专属打招呼话术";
  console.log("RESULT_JSON:" + JSON.stringify({
    status,
    textSent,
    imageSent,
    imageBlockedReason,
    taskSpaceId: task.spaceId,
    url: finalUrl,
    message,
  }));
  process.exit(0);
}

// 半自动或仅补发图片受阻时：保留标签页移交给用户查看处理
const handoffUrl = await page.url().catch(() => "");
await task.handOff();
console.log("RESULT_JSON:" + JSON.stringify({
  status: "PREPARED_HANDOFF",
  textSent,
  imageSent,
  imageBlockedReason,
  taskSpaceId: task.spaceId,
  url: handoffUrl,
  hasInput,
  chatBtnText: verifyState.chatBtnText,
  message: onlySendImage && imageBlockedReason
    ? \`⚠️ 当前会话暂不可直接发图（\${imageBlockedReason}），已为你打开聊天窗口\`
    : hasInput
      ? "已在对应账号窗口预填好招呼语，请确认后发送"
      : "已打开岗位沟通页，请在 Ego 页面中确认后发送",
}));
`;
    const { combined } = await runEgoScript("prepare-delivery", code, 95_000);
    const res = parseMarkedJson(combined);
    onLog(`📨 ${res.message}`);
    return res;
  } finally {
    releaseLock();
  }
}

export async function fetchBossProfilePhone({ profileId, onLog = () => {} }) {
  acquireLock(`识别 Boss 绑定手机号 (${profileId})`);
  try {
    const code = `
const task = await taskSpace("boss-phone-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
try {
  const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
  await page.goto("https://www.zhipin.com/web/geek/resume", { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1800);
  const res = await page.evaluate(() => {
    const txt = (document.querySelector(".resume-baseInfo, .resume-userinfo")?.innerText || document.body?.innerText || "");
    const m = txt.match(/1[3-9]\\d[\\d*]{4,8}\\d{2,4}/);
    return { phone: m ? m[0] : "" };
  });
  await task.finish({ keep: [] });
  console.log("RESULT_JSON:" + JSON.stringify({ status: "OK", phone: res.phone }));
} finally {
  await task.finish({ keep: [] }).catch(() => {});
}
`;
    const { combined } = await runEgoScript("fetch-phone", code, 45_000);
    const parsed = parseMarkedJson(combined);
    if (parsed.phone) onLog(`📱 已识别 ${profileId} 绑定手机号：${parsed.phone}`);
    return parsed;
  } finally {
    releaseLock();
  }
}

export async function syncBossContactedChats({ profileId, maxItems = 60, onLog = () => {} }) {
  acquireLock(`同步 Boss 历史沟通记录 (${profileId})`);
  try {
    onLog(`正在打开 ${profileId} 的 Boss 聊天列表核对历史已沟通公司...`);
    const code = `
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const task = await taskSpace("boss-sync-chats-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
let handedOff = false;
try {
  const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
  await page.goto("https://www.zhipin.com/web/geek/chat", { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(randDelay(2200, 3200));

  const verify = await page.evaluate(() => {
    const body = (document.body?.innerText || "").slice(0, 600);
    return /verify-slider|security-check|\\/security(?:\\/|$)|\\/web\\/user/i.test(location.pathname)
      || /请完成安全验证|拖动滑块|点击按钮进行验证|访问异常|账号异常|扫码登录/.test(body);
  });
  if (verify) {
    handedOff = true;
    const url = await page.url().catch(() => "");
    await task.handOff();
    console.log("RESULT_JSON:" + JSON.stringify({
      status: "VERIFICATION_REQUIRED",
      taskSpaceId: task.spaceId,
      url,
      chats: [],
      message: "同步 Boss 沟通列表需要登录或安全验证，请在 Ego 完成后重试",
    }));
    process.exit(0);
  }

  for (let s = 0; s < 3; s++) {
    await page.evaluate(() => {
      const box = document.querySelector(".user-list, .chat-user, .geek-list");
      if (box) box.scrollTop += 600;
    }).catch(() => {});
    await page.waitForTimeout(700);
  }

  const chats = await page.evaluate((limit) => {
    const nodes = [...document.querySelectorAll(".user-list .friend-content, .chat-user .friend-content, li.friend-content, .geek-item, [class*='friend-item']")];
    const seen = new Set();
    const out = [];
    for (const el of nodes) {
      if (out.length >= limit) break;
      const li = el.closest("li") || el.parentElement;
      const vue = li?.__vue__ || el.__vue__ || {};
      const vueData = vue._props?.source || vue.data || vue.source || vue.friend || {};
      const nameSpan = (el.querySelector(".name-text")?.innerText || "").trim();
      const boxSpans = [...el.querySelectorAll(".name-box > span")]
        .map((s) => (s.innerText || "").trim())
        .filter(Boolean);
      const domCompany = boxSpans.find((t) => t && t !== nameSpan && !/^(?:HR|招聘者|经理|主管|总监|CEO|CTO|人事)$/i.test(t)) || "";
      const companyName = String(vueData.brandName || vueData.companyName || domCompany || "").trim();
      const jobTitle = String(vueData.positionName || vueData.jobName || "").trim();
      const recruiterName = String(vueData.name || vueData.geekName || nameSpan || "HR").trim();
      const lastMsg = String(vueData.lastText || vueData.lastMsg || el.querySelector(".last-msg-text")?.innerText || "").trim();
      const externalId = String(vueData.encryptJobId || "").trim();
      const hrReplied = vueData.lastIsSelf === false || vueData.lastIsSelf === 0;
      const lines = (el.innerText || "").split(/\\n+/).map((x) => x.trim()).filter(Boolean);
      const key = (externalId || (companyName + "|" + jobTitle + "|" + recruiterName)).toLowerCase();
      if (!companyName && !lines.length) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        external_id: externalId,
        company_name: companyName,
        job_title: jobTitle,
        recruiter_name: recruiterName,
        last_msg: lastMsg,
        hr_replied: hrReplied,
        unread_count: Number(vueData.unreadCount || 0),
        raw_text: lines.join(" | ").slice(0, 140),
      });
    }
    return out;
  }, ${Number(maxItems) || 60});

  await task.finish({ keep: [] });
  console.log("RESULT_JSON:" + JSON.stringify({ status: "OK", chats }));
} finally {
  if (!handedOff) {
    await task.finish({ keep: [] }).catch(() => {});
  }
}
`;
    const { combined } = await runEgoScript("sync-chats", code, 75_000);
    const res = parseMarkedJson(combined);
    if (res.status === "OK") {
      onLog(`✅ ${profileId} 已读取 ${(res.chats || []).length} 条最近 Boss 聊天会话`);
    }
    return res;
  } finally {
    releaseLock();
  }
}

export async function fetchBossConversationMessages({
  profileId,
  companyName = "",
  jobTitle = "",
  externalId = "",
  onLog = () => {},
}) {
  acquireLock(`拉取 Boss 对话内容 (${companyName || profileId})`);
  try {
    onLog(`正在打开 ${profileId} 的 Boss 聊天记录以对齐「${companyName}」最新对话...`);
    const code = `
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const task = await taskSpace("boss-read-chat-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
let handedOff = false;
try {
  const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
  await page.goto("https://www.zhipin.com/web/geek/chat", { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(randDelay(2000, 2800));

  const verify = await page.evaluate(() => {
    const body = (document.body?.innerText || "").slice(0, 600);
    return /verify-slider|security-check|\\/security(?:\\/|$)|\\/web\\/user/i.test(location.pathname)
      || /请完成安全验证|拖动滑块|点击按钮进行验证|访问异常|账号异常|扫码登录/.test(body);
  });
  if (verify) {
    handedOff = true;
    const url = await page.url().catch(() => "");
    await task.handOff();
    console.log("RESULT_JSON:" + JSON.stringify({
      status: "VERIFICATION_REQUIRED",
      taskSpaceId: task.spaceId,
      url,
      messages: [],
      message: "拉取 Boss 对话需要登录或安全验证，请在 Ego 完成后重试",
    }));
    process.exit(0);
  }

  const targetMeta = {
    externalId: ${JSON.stringify(String(externalId || ""))},
    companyName: ${JSON.stringify(String(companyName || ""))},
    jobTitle: ${JSON.stringify(String(jobTitle || ""))},
  };

  const pickIdx = await page.evaluate((meta) => {
    const nodes = [...document.querySelectorAll(".user-list .friend-content, .chat-user .friend-content, li.friend-content, .geek-item, [class*='friend-item']")];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const li = el.closest("li") || el.parentElement;
      const vue = li?.__vue__ || el.__vue__ || {};
      const src = vue._props?.source || vue.data || vue.source || vue.friend || {};
      if (meta.externalId && src.encryptJobId === meta.externalId) return i;
    }
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const li = el.closest("li") || el.parentElement;
      const vue = li?.__vue__ || el.__vue__ || {};
      const src = vue._props?.source || vue.data || vue.source || vue.friend || {};
      const brand = String(src.brandName || src.companyName || el.innerText || "");
      const pos = String(src.positionName || src.jobName || "");
      if (meta.companyName && brand.includes(meta.companyName)) {
        if (!meta.jobTitle || !pos || pos.includes(meta.jobTitle) || meta.jobTitle.includes(pos)) return i;
      }
    }
    return -1;
  }, targetMeta);

  if (pickIdx < 0) {
    await task.finish({ keep: [] });
    console.log("RESULT_JSON:" + JSON.stringify({
      status: "NOT_FOUND",
      messages: [],
      canSendImage: false,
      message: "当前账号最近聊天列表中未找到该公司的会话，可能尚未开聊或需切换另一个账号。",
    }));
    process.exit(0);
  }

  await page.click(".user-list .friend-content >> nth=" + pickIdx, { label: "select target chat thread" });
  await page.waitForTimeout(randDelay(1500, 2200));

  const extracted = await page.evaluate(() => {
    const msgEls = [...document.querySelectorAll(".chat-message .message-item, .message-content li.message-item, [class*='message-item']")].slice(-25);
    const messages = [];
    for (const el of msgEls) {
      const cls = String(el.className || "");
      if (cls.includes("item-system")) continue;
      const sender = cls.includes("item-myself") ? "ME" : "HR";
      const raw = (el.innerText || "").trim();
      if (!raw || /与该职位竞争者PK情况|查看详细分析|你撤回了一条消息|正在加载/.test(raw)) continue;
      const lines = raw.split(/\\n+/).map((x) => x.trim()).filter(Boolean);
      let time = "";
      if (lines[0] && /^(\\d{1,2}:\\d{2}|昨天|前天|\\d+月\\d+日)$/.test(lines[0])) {
        time = lines.shift();
      }
      if (lines[0] && /^(已读|送达|未读)$/.test(lines[0])) {
        lines.shift();
      }
      const cleanText = lines.join("\\n").trim();
      if (!cleanText) continue;
      messages.push({ sender, time, text: cleanText });
    }
    const imgWrap = document.querySelector(".btn-sendimg, [aria-label='发送图片']");
    const imgInp = imgWrap?.querySelector("input[type='file']");
    const imgCls = [imgWrap?.className || "", imgWrap?.parentElement?.className || ""].join(" ");
    const imgTip = (imgWrap?.innerText || imgWrap?.getAttribute("title") || "").trim();
    const canSendImage = Boolean(imgInp && !imgInp.disabled && !/unable|disable/i.test(imgCls) && !/回复后/.test(imgTip));
    return { messages, canSendImage };
  });

  await task.finish({ keep: [] });
  console.log("RESULT_JSON:" + JSON.stringify({
    status: "OK",
    messages: extracted.messages,
    canSendImage: extracted.canSendImage,
  }));
} finally {
  if (!handedOff) {
    await task.finish({ keep: [] }).catch(() => {});
  }
}
`;
    const { combined } = await runEgoScript("read-chat", code, 75_000);
    const res = parseMarkedJson(combined);
    if (res.status === "OK") {
      onLog(`💬 已读取「${companyName}」最近 ${(res.messages || []).length} 条对话记录`);
    }
    return res;
  } finally {
    releaseLock();
  }
}

export async function sendBossReplyMessage({
  profileId,
  companyName = "",
  jobTitle = "",
  externalId = "",
  replyText = "",
  sendImageResume = false,
  imagePath = "",
  onLog = () => {},
}) {
  const hasImage = Boolean(sendImageResume && imagePath && fs.existsSync(imagePath));
  const normalizedImagePath = hasImage ? imagePath.replace(/\\\\/g, "/") : "";
  acquireLock(`发送连续回复「${companyName}」(${profileId})`);
  try {
    onLog(`正在用 ${profileId} 发送跟进回复给「${companyName}」...`);
    const code = `
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const task = await taskSpace("boss-reply-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
let handedOff = false;
try {
  const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
  await page.goto("https://www.zhipin.com/web/geek/chat", { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(randDelay(2000, 2800));

  const verify = await page.evaluate(() => {
    const body = (document.body?.innerText || "").slice(0, 600);
    return /verify-slider|security-check|\\/security(?:\\/|$)|\\/web\\/user/i.test(location.pathname)
      || /请完成安全验证|拖动滑块|点击按钮进行验证|访问异常|账号异常|扫码登录/.test(body);
  });
  if (verify) {
    handedOff = true;
    const url = await page.url().catch(() => "");
    await task.handOff();
    console.log("RESULT_JSON:" + JSON.stringify({
      status: "VERIFICATION_REQUIRED",
      taskSpaceId: task.spaceId,
      url,
      message: "发送回复需要登录或安全验证，请在 Ego 完成后重试",
    }));
    process.exit(0);
  }

  const targetMeta = {
    externalId: ${JSON.stringify(String(externalId || ""))},
    companyName: ${JSON.stringify(String(companyName || ""))},
    jobTitle: ${JSON.stringify(String(jobTitle || ""))},
  };
  const pickIdx = await page.evaluate((meta) => {
    const nodes = [...document.querySelectorAll(".user-list .friend-content, .chat-user .friend-content, li.friend-content, .geek-item, [class*='friend-item']")];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const li = el.closest("li") || el.parentElement;
      const vue = li?.__vue__ || el.__vue__ || {};
      const src = vue._props?.source || vue.data || vue.source || vue.friend || {};
      if (meta.externalId && src.encryptJobId === meta.externalId) return i;
    }
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const li = el.closest("li") || el.parentElement;
      const vue = li?.__vue__ || el.__vue__ || {};
      const src = vue._props?.source || vue.data || vue.source || vue.friend || {};
      const brand = String(src.brandName || src.companyName || el.innerText || "");
      const pos = String(src.positionName || src.jobName || "");
      if (meta.companyName && brand.includes(meta.companyName)) {
        if (!meta.jobTitle || !pos || pos.includes(meta.jobTitle) || meta.jobTitle.includes(pos)) return i;
      }
    }
    return -1;
  }, targetMeta);

  if (pickIdx < 0) {
    await task.finish({ keep: [] });
    console.log("RESULT_JSON:" + JSON.stringify({
      status: "NOT_FOUND",
      textSent: false,
      imageSent: false,
      message: "未在当前账号聊天列表找到该会话，请核对是否选对了账号。",
    }));
    process.exit(0);
  }

  await page.click(".user-list .friend-content >> nth=" + pickIdx, { label: "open chat thread for reply" });
  await page.waitForTimeout(randDelay(1400, 2000));

  const inputSelector = "div.chat-input[contenteditable='true'], textarea.input-area, .chat-conversation [contenteditable='true']";
  const hasInput = await page.waitForSelector(inputSelector, { state: "visible", timeout: 6000 }).then(() => true).catch(() => false);
  const replyText = ${JSON.stringify(String(replyText || "").trim())};
  let textSent = false;
  let imageSent = false;
  let imageBlockedReason = "";

  if (hasInput && replyText) {
    await page.click(inputSelector, { label: "focus reply input" });
    await page.waitForTimeout(400);
    await page.fill(inputSelector, replyText).catch(async () => {
      await page.keyboard.paste(replyText);
    });
    await page.waitForTimeout(randDelay(650, 1100));
    await page.click("button.btn-send, .btn-send", { label: "click send reply" }).catch(async () => {
      await page.press(inputSelector, "Enter");
    });
    textSent = true;
    await page.waitForTimeout(randDelay(1200, 1900));
  }

  if (${JSON.stringify(hasImage)}) {
    const imgBtnState = await page.evaluate(() => {
      const wrap = document.querySelector(".btn-sendimg, [aria-label='发送图片']");
      const inp = wrap?.querySelector("input[type='file']")
        || [...document.querySelectorAll(".chat-conversation input[type='file'], .chat-im input[type='file']")].find((i) => /image\\/gif|image\\/png/i.test(i.accept || ""));
      if (!inp) return { found: false, reason: "当前聊天框未找到发图控件" };
      const cls = [wrap?.className || "", wrap?.parentElement?.className || ""].join(" ");
      const tip = (wrap?.innerText || wrap?.getAttribute("title") || "").trim();
      const disabled = Boolean(inp.disabled || /unable|disable/i.test(cls) && /回复后/.test(tip) || /回复后/.test(tip));
      if (disabled) return { found: true, enabled: false, reason: tip || "Boss 限制对方回复后才可发图" };
      inp.setAttribute("data-ego-reply-img", "1");
      return { found: true, enabled: true };
    });

    if (imgBtnState.found && imgBtnState.enabled) {
      await page.setInputFiles("input[data-ego-reply-img='1']", [${JSON.stringify(normalizedImagePath)}]);
      await page.waitForTimeout(1600);
      const afterSet = await page.evaluate(() => {
        const toastTxt = [...document.querySelectorAll(".toast, [class*='toast'], .boss-popup__content, .dialog-wrap")]
          .filter((el) => getComputedStyle(el).display !== "none" && el.offsetHeight > 5)
          .map((el) => (el.innerText || "").trim())
          .join(" ");
        if (/回复后.*发送|暂不支持|频繁/.test(toastTxt)) return { blocked: true, reason: toastTxt.slice(0, 80) };
        const wraps = [...document.querySelectorAll(".dialog-wrap, .boss-popup__wrapper")].filter((el) => {
          const s = getComputedStyle(el);
          return s.display !== "none" && s.visibility !== "hidden" && el.offsetHeight > 40;
        });
        for (const w of wraps) {
          const btn = [...w.querySelectorAll("button, .btn, span.btn, a.btn")].find((b) =>
            /^(?:发送|确定|确认发送|确认)$/.test((b.innerText || "").trim())
          );
          if (btn) {
            btn.setAttribute("data-ego-confirm-reply-img", "1");
            return { blocked: false, needConfirm: true };
          }
        }
        return { blocked: false, needConfirm: false };
      });
      if (afterSet.blocked) {
        imageBlockedReason = afterSet.reason;
      } else {
        if (afterSet.needConfirm) {
          await page.click("[data-ego-confirm-reply-img='1'] >> nth=0", { label: "confirm send reply image" }).catch(() => {});
        }
        await page.waitForTimeout(1600);
        imageSent = true;
      }
    } else {
      imageBlockedReason = imgBtnState.reason || "暂不可直接发图";
    }
  }

  await task.finish({ keep: [] });
  const msg = textSent && imageSent
    ? "✅ 已发送回复并顺带发出高清图片简历！"
    : textSent
      ? (\`\${imageBlockedReason ? "✅ 已发送回复（图片未发出：" + imageBlockedReason + "）" : "✅ 已成功发送跟进回复！"}\`)
      : imageSent
        ? "✅ 已发出高清图片简历！"
        : "⚠️ 未能找到输入框发送，请在 Ego 中查看会话。";
  console.log("RESULT_JSON:" + JSON.stringify({
    status: (textSent || imageSent) ? "SENT" : "FAILED",
    textSent,
    imageSent,
    imageBlockedReason,
    message: msg,
  }));
} finally {
  if (!handedOff) {
    await task.finish({ keep: [] }).catch(() => {});
  }
}
`;
    const { combined } = await runEgoScript("send-reply", code, 80_000);
    const res = parseMarkedJson(combined);
    onLog(`📨 ${res.message || "跟进回复完成"}`);
    return res;
  } finally {
    releaseLock();
  }
}

export async function renderResumeImageViaEgo({
  pdfRenderUrl = "",
  fallbackHtmlUrl = "",
  outputPath,
  profileId = "Profile 1",
  onLog = () => {},
}) {
  acquireLock("生成高清图片简历");
  try {
    onLog("正在生成超清图片简历（PNG）...");
    const code = `
const fs = await import("node:fs");
const path = await import("node:path");
const task = await taskSpace("boss-resume-img-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
const outFile = ${JSON.stringify(outputPath)};
let width = 0;
let height = 0;
try {
  const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
  let pngBuffer = null;

  if (${JSON.stringify(Boolean(pdfRenderUrl))}) {
    await page.goto(${JSON.stringify(pdfRenderUrl)}, { waitUntil: "load", timeout: 25000 }).catch(() => {});
    const ok = await page.waitForFunction(() => window.__PDF_PNG_READY === true || Boolean(window.__PDF_PNG_ERROR), undefined, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      const rendered = await page.evaluate(() => ({
        err: window.__PDF_PNG_ERROR || "",
        dataUrl: window.__PDF_PNG_DATA_URL || "",
        w: window.__PDF_PNG_WIDTH || 0,
        h: window.__PDF_PNG_HEIGHT || 0,
      }));
      if (rendered.dataUrl && rendered.dataUrl.startsWith("data:image/png;base64,")) {
        pngBuffer = Buffer.from(rendered.dataUrl.slice("data:image/png;base64,".length), "base64");
        width = rendered.w;
        height = rendered.h;
      }
    }
  }

  if (!pngBuffer && ${JSON.stringify(Boolean(fallbackHtmlUrl))}) {
    await page.cdp("Emulation.setDeviceMetricsOverride", {
      width: 960,
      height: 1400,
      deviceScaleFactor: 2,
      mobile: false,
    }).catch(() => {});
    await page.goto(${JSON.stringify(fallbackHtmlUrl)}, { waitUntil: "load", timeout: 18000 });
    await page.waitForFunction(() => window.__RESUME_READY === true, undefined, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    const rect = await page.evaluate(() => {
      const el = document.getElementById("sheet");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
    });
    const shot = await page.cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      ...(rect ? { clip: { ...rect, scale: 2 } } : {}),
    });
    pngBuffer = Buffer.from(shot.data, "base64");
    width = rect ? rect.width * 2 : 1640;
    height = rect ? rect.height * 2 : 2240;
  }

  if (!pngBuffer) {
    throw new Error("图片简历渲染失败，请直接上传 PNG/JPG 图片或检查 PDF 文件");
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, pngBuffer);
  console.log("RESULT_JSON:" + JSON.stringify({ ok: true, path: outFile, bytes: pngBuffer.length, width, height }));
} finally {
  await task.finish({ keep: [] }).catch(() => {});
}
`;
    const { combined } = await runEgoScript("render-resume-img", code, 60_000);
    const res = parseMarkedJson(combined);
    onLog(`✅ 已生成高清图片简历（${Math.round((res.bytes || 0) / 1024)} KB）`);
    return res;
  } finally {
    releaseLock();
  }
}

export async function generateResumePdfViaEgo({ renderUrl, outputPath, profileId = "Profile 1", onLog = () => {} }) {
  acquireLock("导出定制简历 PDF");
  try {
    onLog("正在生成高保真矢量定制简历 PDF...");
    const code = `
const fs = await import("node:fs");
const path = await import("node:path");
const task = await taskSpace("boss-pdf-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
await page.goto(${JSON.stringify(renderUrl)}, { waitUntil: "load", timeout: 15000 });
await page.waitForFunction(() => window.__RESUME_READY === true, undefined, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(300);
const pdfRes = await page.cdp("Page.printToPDF", {
  printBackground: true,
  preferCSSPageSize: true,
  marginTop: 0.35,
  marginBottom: 0.35,
  marginLeft: 0.35,
  marginRight: 0.35,
});
await task.finish({ keep: [] });
const outFile = ${JSON.stringify(outputPath)};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, Buffer.from(pdfRes.data, "base64"));
console.log("RESULT_JSON:" + JSON.stringify({ ok: true, path: outFile, bytes: Buffer.from(pdfRes.data, "base64").length }));
`;
    const { combined } = await runEgoScript("export-pdf", code, 45_000);
    const res = parseMarkedJson(combined);
    onLog(`✅ 已导出定制 PDF 简历（${Math.round((res.bytes || 0) / 1024)} KB）`);
    return res;
  } finally {
    releaseLock();
  }
}

const BAIDU_CITY_CODES = {
  广州: 257,
  深圳: 340,
  北京: 131,
  上海: 289,
  杭州: 179,
  成都: 75,
};

export async function enrichJobDetailsAndCommuteViaEgo({
  jobs = [],
  homeAddress = "",
  homeCity = "广州",
  profileId = "Profile 1",
  fetchMissingAddress = true,
  onLog = () => {},
}) {
  if (!homeAddress) {
    throw new Error("请先在「巡检计划与设置」填写你的居住地址");
  }
  if (!jobs.length) return { homeResolved: null, items: [] };

  acquireLock(`测算办公地点与单车+地铁通勤（${jobs.length} 个岗位）`);
  try {
    const cityCode = BAIDU_CITY_CODES[homeCity] || 257;
    const payloadJobs = jobs.map((j) => ({
      id: j.id,
      job_title: j.job_title || "",
      company_name: j.company_name || "",
      city: j.city || homeCity,
      work_address: j.work_address || "",
      area_district: j.area_district || "",
      job_url: j.job_url || "",
    }));

    onLog(`正在检查 ${jobs.length} 个岗位的准确办公地点并用百度地图测算单车+地铁通勤...`);
    const code = `
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const jobs = ${JSON.stringify(payloadJobs)};
const homeAddress = ${JSON.stringify(homeAddress)};
const homeCity = ${JSON.stringify(homeCity)};
const defaultCityCode = ${cityCode};
const fetchMissing = ${JSON.stringify(Boolean(fetchMissingAddress))};

const task = await taskSpace("boss-commute-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
let homePt = null;
const items = [];
try {
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));

// Step 1: 补充缺少 work_address 的 Boss 岗位详情地址
let bossBlocked = false;
if (fetchMissing) {
  for (const job of jobs) {
    if (job.work_address || !job.job_url || !job.job_url.includes("zhipin.com/job_detail") || bossBlocked) continue;
    await page.goto(job.job_url, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(randDelay(1400, 2100));
    const detail = await page.evaluate(() => {
      const body = (document.body?.innerText || "").slice(0, 500);
      if (/verify-slider|security-check|\\/security(?:\\/|$)/i.test(location.pathname) || /请完成安全验证|拖动滑块|访问异常/.test(body)) {
        return { blocked: true };
      }
      const addrEl = document.querySelector(".location-address, .job-address");
      const rawAddr = (addrEl?.innerText || "").replace(/^工作地址\\s*/g, "").replace(/点击查看地图/g, "").trim();
      const mapUrl = document.querySelector(".job-location-map img, img[src*='center=']")?.getAttribute("src") || "";
      const centerMatch = mapUrl.match(/center=([0-9.]+),([0-9.]+)/);
      return {
        blocked: false,
        work_address: rawAddr,
        longitude: centerMatch ? Number(centerMatch[1]) : null,
        latitude: centerMatch ? Number(centerMatch[2]) : null,
      };
    }).catch(() => ({ blocked: false }));
    if (detail.blocked) {
      bossBlocked = true;
      console.error("[COMMUTE] Boss detail hit verification, falling back to company name lookup on Baidu Map.");
      break;
    } else if (detail.work_address) {
      job.work_address = detail.work_address;
      if (detail.longitude) job.longitude = detail.longitude;
      if (detail.latitude) job.latitude = detail.latitude;
    }
  }
}

// Step 2: 在 map.baidu.com 会话内逐条编码与计算地铁+步行路段（每条独立 evaluate，彻底避免 15s 超时）
await page.goto("https://map.baidu.com/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
await page.waitForTimeout(900);

homePt = await page.evaluate(async ({ homeAddress, homeCity, defaultCityCode }) => {
  const geocode = async (wd, c) => {
    const res = await fetch(\`/?qt=s&wd=\${encodeURIComponent(wd)}&c=\${c}\`).then((r) => r.json()).catch(() => null);
    const pt = res?.content?.[0];
    if (!pt || !pt.x || !pt.y) return null;
    return { name: pt.name || wd, addr: pt.addr || "", x: pt.x / 100, y: pt.y / 100, cityCode: res?.current_city?.code || c };
  };
  const homeWd = homeAddress.includes(homeCity) ? homeAddress : \`\${homeCity}\${homeAddress}\`;
  return (await geocode(homeWd, defaultCityCode)) || (await geocode(homeAddress, defaultCityCode));
}, { homeAddress, homeCity, defaultCityCode });

for (const job of jobs) {
  const item = await page.evaluate(async ({ job, homePt, homeCity, defaultCityCode }) => {
    const cityCodes = { 广州: 257, 深圳: 340, 佛山: 138, 东莞: 119, 珠海: 140, 北京: 131, 上海: 289, 杭州: 179, 成都: 75, 芜湖: 129, 武汉: 218, 南京: 315 };
    const hintText = \`\${job.work_address || ""} \${job.job_title || ""}\`;
    let effCity = job.city || homeCity;
    for (const cname of Object.keys(cityCodes)) {
      if (hintText.includes(cname)) {
        effCity = cname;
        break;
      }
    }
    const cCode = cityCodes[effCity] || defaultCityCode;
    const fetchJson = async (url) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      try {
        return await fetch(url, { signal: ctrl.signal }).then((r) => r.json()).catch(() => null);
      } finally {
        clearTimeout(t);
      }
    };
    const geocode = async (wd, c) => {
      const res = await fetchJson(\`/?qt=s&wd=\${encodeURIComponent(wd)}&c=\${c}\`);
      const pt = res?.content?.[0];
      if (!pt || !pt.x || !pt.y) return null;
      return { name: pt.name || wd, addr: pt.addr || "", x: pt.x / 100, y: pt.y / 100, cityCode: res?.current_city?.code || c };
    };

    const destQuery = job.work_address
      ? (job.work_address.includes(effCity) ? job.work_address : \`\${effCity} \${job.work_address}\`)
      : \`\${effCity} \${job.area_district || ""} \${job.company_name}\`.replace(/\\s+/g, " ").trim();

    let destPt = await geocode(destQuery, cCode);
    if (!destPt) {
      destPt = await geocode(\`\${effCity} \${job.company_name}\`, cCode);
    }

    if (!homePt || !destPt) {
      return { id: job.id, work_address: job.work_address || "", destPt, route: null };
    }

    const straightLineM = Math.round(Math.hypot(destPt.x - homePt.x, destPt.y - homePt.y));
    let bt = null;
    if (straightLineM <= 95000 && effCity === homeCity) {
      const btUrl = \`/?qt=bt&c=\${cCode}&sn=1$$$$\${homePt.x},\${homePt.y}$$\${encodeURIComponent(homePt.name)}$$$$&en=1$$$$\${destPt.x},\${destPt.y}$$\${encodeURIComponent(destPt.name)}$$$$&sy=0\`;
      bt = await fetchJson(btUrl);
    }
    const c0 = bt?.content?.[0];
    const ext = c0?.exts?.[0] || null;
    const lines = (c0?.lines?.[0] || []).filter((l) => l && l.name).map((l) => l.name);

    return {
      id: job.id,
      work_address: job.work_address || destPt.addr || destPt.name || "",
      dest_name: destPt.name || "",
      dest_addr: destPt.addr || "",
      longitude: job.longitude ?? null,
      latitude: job.latitude ?? null,
      straightLineM,
      route: ext ? {
        distanceM: ext.distance || 0,
        totalSec: ext.time || 0,
        walkDistanceM: ext.walk_distance || 0,
        walkSec: ext.walk_time || 0,
        priceFen: ext.price || 0,
        lines,
      } : null,
    };
  }, { job, homePt, homeCity, defaultCityCode }).catch((err) => ({
    id: job.id,
    work_address: job.work_address || "",
    route: null,
    error: String(err?.message || err),
  }));
  items.push(item);
}
} finally {
  await task.finish({ keep: [] }).catch(() => {});
}
console.log("RESULT_JSON:" + JSON.stringify({ status: "OK", homePt, items }));
`;
    const { combined, stderr } = await runEgoScript("enrich-commute", code, Math.max(90_000, jobs.length * 12_000));
    if (stderr) {
      for (const line of stderr.split(/\r?\n/).filter((l) => l && !l.startsWith("RESULT_JSON:"))) onLog(line);
    }
    const raw = parseMarkedJson(combined);
    const enriched = (raw.items || []).map((it) => {
      const calc = it.route
        ? calculateBikePlusMetroMetrics({ ...it.route, straightLineM: it.straightLineM })
        : calculateBikePlusMetroMetrics({ straightLineM: it.straightLineM || 0 });
      return {
        ...it,
        commute: {
          ...calc,
          home_address: homeAddress,
          home_resolved: raw.homePt?.addr || raw.homePt?.name || homeAddress,
          dest_address: it.work_address || it.dest_addr || it.dest_name || "",
          computed_at: new Date().toISOString(),
        },
      };
    });
    onLog(`✅ 已完成 ${enriched.length} 个岗位的单车+地铁通勤测算`);
    return { homeResolved: raw.homePt, items: enriched };
  } finally {
    releaseLock();
  }
}
