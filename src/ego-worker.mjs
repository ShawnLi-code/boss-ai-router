import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DATA_DIR } from "./db.mjs";

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

function runEgoScript(scriptName, code, timeoutMs = 180_000) {
  const filePath = path.join(RUNS_DIR, `${Date.now()}-${scriptName}.mjs`);
  fs.writeFileSync(filePath, code, "utf8");
  const entry = `await import('${pathToFileURL(filePath).href}')`;

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

  acquireLock(`联网背调补查（${uniqueNames.length} 家公司）`);
  try {
    onLog(`正在通过 Ego 百度检索 ${uniqueNames.length} 家公司的背调/个税/流水舆情...`);
    const code = `
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const companies = ${JSON.stringify(uniqueNames)};
const task = await taskSpace("boss-intel-search-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
const results = {};

for (let i = 0; i < companies.length; i++) {
  const name = companies[i];
  const query = \`"\${name}" (背调 OR 个税 OR 流水 OR 离职证明)\`;
  const url = "https://www.baidu.com/s?wd=" + encodeURIComponent(query);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 22000 }).catch(() => {});
  await page.waitForTimeout(randDelay(1800, 2800));

  const needVerify = await page.evaluate(() => /wappass\\.baidu\\.com|安全验证/.test(location.href + (document.title || "")));
  if (needVerify) {
    results[name] = { query, blocked: true, items: [] };
    continue;
  }

  const items = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("#content_left .c-container, #content_left .result").forEach((el) => {
      const title = (el.querySelector("h3")?.innerText || "").trim();
      const href = el.querySelector("h3 a")?.href || "";
      const snippet = (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 360);
      if (title && snippet) {
        out.push({ title, url: href, snippet });
      }
    });
    return out.slice(0, 8);
  });

  results[name] = { query, blocked: false, items };
  if (i < companies.length - 1) {
    await page.waitForTimeout(randDelay(1500, 2600));
  }
}

await task.finish({ keep: [] });
console.log("RESULT_JSON:" + JSON.stringify({ status: "OK", results }));
`;
    const { combined } = await runEgoScript("baidu-intel", code, Math.max(60_000, uniqueNames.length * 15_000));
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

export async function scrapeBossJobs({
  profileId,
  query = "AI测试",
  city = "101280100",
  maxJobs = 8,
  minHrActive = "week",
  minDelayMs = 4500,
  maxDelayMs = 8500,
  onLog = () => {},
}) {
  const safeMax = Math.max(1, Math.min(20, Number(maxJobs) || 8));
  const safeMinDelay = Math.max(3000, Number(minDelayMs) || 4500);
  const safeMaxDelay = Math.max(safeMinDelay + 1000, Number(maxDelayMs) || 8500);

  acquireLock(`抓取 Boss 岗位「${query}」(${profileId})`);
  try {
    onLog(`启动低频真人模拟抓取：配置 ${profileId}，关键词「${query}」，活跃度门槛「${minHrActive}」，上限 ${safeMax} 条，间隔 ${safeMinDelay}-${safeMaxDelay}ms`);
    const searchUrl = `https://www.zhipin.com/web/geek/jobs?query=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}`;
    const code = `
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const task = await taskSpace("boss-scrape-jobs-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));
await page.goto(${JSON.stringify(searchUrl)}, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(randDelay(2500, 4200));

async function checkVerify() {
  return await page.evaluate(() => {
    const body = (document.body?.innerText || "").slice(0, 700);
    return /verify-slider|security|web\\/user/i.test(location.href)
      || /请完成安全验证|拖动滑块|点击按钮进行验证|访问异常|账号异常|扫码登录/.test(body);
  });
}

if (await checkVerify()) {
  await task.handOff();
  console.log("RESULT_JSON:" + JSON.stringify({
    status: "VERIFICATION_REQUIRED",
    taskSpaceId: task.spaceId,
    url: await page.url(),
    jobs: [],
  }));
  process.exit(0);
}

const collected = [];
const seenIds = new Set();
const totalTarget = ${safeMax};

for (let idx = 0; idx < totalTarget + 6 && collected.length < totalTarget; idx++) {
  const cardCount = await page.evaluate(() => document.querySelectorAll(".job-card-wrap").length);
  if (idx >= cardCount) {
    // 温和滚动加载更多
    await page.mouse.wheel(0, 560, { label: "scroll job list slowly" });
    await page.waitForTimeout(randDelay(2000, 3200));
    const afterCount = await page.evaluate(() => document.querySelectorAll(".job-card-wrap").length);
    if (idx >= afterCount) break;
  }

  // 计算卡片非链接区域的坐标并真人点击，确保右侧详情同步切换
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
  await page.waitForTimeout(randDelay(1800, 3000));

  if (await checkVerify()) {
    await task.handOff();
    console.log("RESULT_JSON:" + JSON.stringify({
      status: "VERIFICATION_REQUIRED",
      taskSpaceId: task.spaceId,
      url: await page.url(),
      jobs: collected,
    }));
    process.exit(0);
  }

  // 等待右侧详情切换至当前点击的岗位
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

  // 模拟阅读右侧 JD 滚动
  await page.mouse.move(780, 420, { steps: 5, label: "move to job detail" }).catch(() => {});
  await page.mouse.wheel(0, 240, { label: "read jd details" }).catch(() => {});
  await page.waitForTimeout(randDelay(${safeMinDelay}, ${safeMaxDelay}));

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

    return {
      external_id: externalId,
      job_title: jobTitle,
      company_name: companyName,
      scale,
      financing,
      industry,
      city: jobInfo.locationName || cardVue.cityName || "",
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
    console.error(\`[SCRAPED \${collected.length}/\${totalTarget}] \${item.company_name} | \${item.job_title} | \${item.scale} | \${item.financing}\`);
  }
}

await task.finish({ keep: [] });
console.log("RESULT_JSON:" + JSON.stringify({
  status: "OK",
  taskSpaceId: task.spaceId,
  jobs: collected,
}));
`;
    const { combined, stderr } = await runEgoScript("scrape-jobs", code, 300_000);
    if (stderr) {
      for (const line of stderr.split(/\r?\n/).filter((l) => l && !l.startsWith("RESULT_JSON:"))) onLog(line);
    }
    const res = parseMarkedJson(combined);
    if (res.status === "VERIFICATION_REQUIRED") {
      onLog(`⚠️ 抓取过程中遇到安全验证（TaskSpace #${res.taskSpaceId}），已停止抓取并交出控制权！已保留之前抓到的 ${res.jobs.length} 条岗位。`);
    } else {
      onLog(`✅ 抓取完成，共安全获取 ${res.jobs.length} 条岗位数据。`);
    }
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
  acquireLock(`准备投递「${companyName} · ${jobTitle}」(${profileId})`);
  try {
    onLog(`正在切换至 ${profileId} 打开岗位页（${companyName} · ${jobTitle}）...`);
    const code = `
const randDelay = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const task = await taskSpace("boss-deliver-" + Date.now(), { profileId: ${JSON.stringify(profileId)} });
const page = (await task.pages())[0] ?? (await task.adopt((await task.tabs())[0].page));

await page.goto(${JSON.stringify(jobUrl)}, { waitUntil: "domcontentloaded", timeout: 25000 });
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
const inputSelector = "div.chat-input[contenteditable='true'], textarea.input-area, .edit-area [contenteditable='true']";
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
