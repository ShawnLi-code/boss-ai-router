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
  const needVerify = /verify-slider|security|web\\/user/i.test(location.href)
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
    // Strip trailing embedded sections like 专业技能 / 个人总结 inside workExpList
    let text = cleanSection(rawSection, isWork ? "工作经历" : "项目经历");
    text = text.replace(/\n(?:专业技能|个人总结)\n[\s\S]*$/m, "").trim();
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
  const education = eduLines.length
    ? [{
        school: eduLines[0] || "",
        period: eduLines.find((l) => /20\d{2}/.test(l)) || "",
        major: eduLines[2] || "",
        degree: eduLines.find((l) => /本科|硕士|大专|博士/.test(l)) || "",
      }]
    : [];

  const skillText = cleanSection(p.skillText, "专业技能");
  const knownSkillTokens = [
    "Python", "Pytest", "Playwright", "Selenium", "Requests", "Allure",
    "Postman", "JMeter", "Docker", "Linux", "SQL", "MySQL", "Java",
    "RAG", "LLM", "Prompt", "LangChain", "ChromaDB", "React", "GitLab", "Jenkins", "AI辅助测试",
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
    years_label: p.yearsLabel || (trackKey === "B" ? "两年经历版" : "真实日期版"),
    summary: cleanSection(p.summaryText, "个人优势"),
    skills: [...new Set(skills)],
    experiences,
    projects,
    education,
    raw_text: p.fullRawText || "",
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
    return /verify-slider|security|web\\/user/i.test(location.href)
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
  autoSend = false,
  onLog = () => {},
}) {
  const targetUrl =
    jobUrl && /^https?:\/\//i.test(jobUrl)
      ? jobUrl
      : `https://www.zhipin.com/web/geek/jobs?query=${encodeURIComponent(`${companyName} ${jobTitle}`.trim())}`;
  acquireLock(`准备沟通「${companyName} · ${jobTitle}」(${profileId})`);
  try {
    onLog(`正在切换至 ${profileId} 打开岗位/沟通页（${companyName} · ${jobTitle}）...`);
    const code = `
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const task = await taskSpace("boss-deliver-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));

await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: "domcontentloaded", timeout: 25000 });
await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
await page.waitForTimeout(randDelay(2500, 4200));

const verifyState = await page.evaluate(() => {
  const body = (document.body?.innerText || "").slice(0, 700);
  const needVerify = /verify-slider|security|web\\/user/i.test(location.href)
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

// 温和滚动一下再点沟通
await page.mouse.wheel(0, 220, { label: "review job before chat" }).catch(() => {});
await page.waitForTimeout(randDelay(1200, 2200));

if (verifyState.chatBtnText.includes("立即沟通")) {
  await page.click(".btn-startchat, .op-btn-chat", { label: "click start chat" });
  await page.waitForTimeout(randDelay(2000, 3500));
} else if (verifyState.chatBtnText.includes("继续沟通")) {
  await page.click(".btn-startchat, .op-btn-chat", { label: "open existing chat" });
  await page.waitForTimeout(randDelay(2000, 3200));
}

if (await page.evaluate(() => /verify-slider|security/i.test(location.href) || /请完成安全验证|拖动滑块/.test(document.body?.innerText || ""))) {
  await task.handOff();
  console.log("RESULT_JSON:" + JSON.stringify({
    status: "VERIFICATION_REQUIRED",
    taskSpaceId: task.spaceId,
    url: await page.url(),
    message: "点击沟通后触发安全验证，已移交给你在 Ego 浏览器处理",
  }));
  process.exit(0);
}

// 检查聊天输入框并填入专属话术
const inputSelector = "div.chat-input[contenteditable='true'], textarea.input-area, .edit-area [contenteditable='true'], .greet-boss-dialog textarea, .chat-conversation [contenteditable='true']";
const hasInput = await page.waitForSelector(inputSelector, { state: "visible", timeout: 8000 }).then(() => true).catch(() => false);

if (hasInput) {
  await page.click(inputSelector, { label: "focus chat input" });
  await page.waitForTimeout(500);
  await page.fill(inputSelector, ${JSON.stringify(greetingText)}).catch(async () => {
    await page.keyboard.paste(${JSON.stringify(greetingText)});
  });
  await page.waitForTimeout(randDelay(800, 1400));
  if (${JSON.stringify(Boolean(autoSend))}) {
    await page.click("button.btn-send, .btn-send", { label: "send greeting message" }).catch(async () => {
      await page.press(inputSelector, "Enter");
    });
    await page.waitForTimeout(1500);
    await task.finish({ keep: [] });
    console.log("RESULT_JSON:" + JSON.stringify({
      status: "SENT",
      taskSpaceId: task.spaceId,
      url: await page.url(),
      message: "已用指定账号发送专属打招呼话术",
    }));
    process.exit(0);
  }
}

// 默认半自动安全模式：移交已填好话术的标签页由你扫一眼确认发送
await task.handOff();
console.log("RESULT_JSON:" + JSON.stringify({
  status: "PREPARED_HANDOFF",
  taskSpaceId: task.spaceId,
  url: await page.url(),
  hasInput,
  chatBtnText: verifyState.chatBtnText,
  message: hasInput
    ? "已在对应账号窗口填入专属打招呼话术，请你在 Ego 确认无误后按发送（或附上定制PDF简历）"
    : "已用对应账号打开岗位/沟通页，请在 Ego 页面中确认后沟通",
}));
`;
    const { combined } = await runEgoScript("prepare-delivery", code, 90_000);
    const res = parseMarkedJson(combined);
    onLog(`📨 ${res.message} (TaskSpace #${res.taskSpaceId})`);
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
      if (/verify-slider|security/i.test(location.href) || /请完成安全验证|拖动滑块|访问异常/.test(body)) {
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
