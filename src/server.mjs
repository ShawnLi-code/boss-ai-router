import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PDF_DIR,
  PROJECT_ROOT,
  RESUME_ASSETS_DIR,
  addBlacklistCompanies,
  addDeliveryLog,
  checkBlacklisted,
  clearTrackBreaker,
  countTodayDeliveries,
  getAccountTracks,
  getCompanyDeliveryHistory,
  getCompanyIntel,
  getFunnelStats,
  getJob,
  getPrimaryResume,
  getResumeByTrack,
  getResumeImageMeta,
  getResumes,
  getScrapeTelemetry,
  getSettings,
  hasJobExternalId,
  isProfileBreakerActive,
  listBlacklist,
  listDeliveryLogs,
  listJobs,
  listKnownExternalIds,
  listPatrolRuns,
  normalizeCompanyRoot,
  purgeFilteredJobs,
  recordPatrolRun,
  removeBlacklistCompany,
  saveResume,
  saveResumeImageMeta,
  saveSettings,
  todayStr,
  tripProfileBreaker,
  updateAccountTrack,
  updateDeliveryLogSnapshot,
  updateJobRouting,
  upsertJob,
} from "./db.mjs";
import { evaluateJobRisk, shouldTriggerWebSearch } from "./scoring.mjs";
import { DEFAULT_TARGET_ROLES, evaluateJobEligibility, matchResumeToJob } from "./matcher.mjs";
import { searchCompaniesBatchIntel, searchCompanyBackgroundIntel } from "./websearch.mjs";
import { isLlmConfigured, refineMatchWithLlm } from "./llm.mjs";
import {
  checkGithubUpdate,
  downloadAndPrepareUpdate,
  getCurrentVersion,
  launchUpdateInstaller,
} from "./updater.mjs";
import { analyzeConversationAndSuggestReplies, generateContextualReplies } from "./reply-advisor.mjs";
import {
  enrichJobDetailsAndCommuteViaEgo,
  fetchBossConversationMessages,
  finishEgoSpace,
  generateResumePdfViaEgo,
  getActiveLock,
  listEgoProfiles,
  openBossJobPage,
  prepareBossDelivery,
  renderResumeImageViaEgo,
  scrapeBossJobs,
  sendBossReplyMessage,
  syncBossContactedChats,
  syncResumeFromBoss,
} from "./ego-worker.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const PORT = Number(process.env.BOSS_ROUTER_PORT || process.env.PORT || 3789);

const sseClients = new Set();
const recentLogs = [];

function broadcast(event, data) {
  const payload = { ts: new Date().toISOString(), ...data };
  if (event === "log") {
    recentLogs.push(payload);
    if (recentLogs.length > 80) recentLogs.shift();
  }
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    res.write(msg);
  }
}

function logEvent(message, level = "info", extra = {}) {
  broadcast("log", { message, level, ...extra });
}

function resolveEffectiveTrackKey(job) {
  if (job.manual_track === "A" || job.manual_track === "B") return job.manual_track;
  if (job.recommended_track === "A轨_真实日期版") return "A";
  if (job.recommended_track === "B轨_绿区池") return "B";
  return "B";
}

function pickMatchPayload(match) {
  return {
    matched_keywords: match.matched_keywords,
    missing_keywords: match.missing_keywords,
    missing_must_haves: match.missing_must_haves,
    matched_clusters: match.matched_clusters,
    dimensions: match.dimensions,
    eligibility: match.eligibility,
    salary_fit: match.salary_fit,
    apply_advice: match.apply_advice,
    advice_label: match.advice_label,
    advice_summary: match.advice_summary,
    revise_suggestions: match.revise_suggestions,
    greeting_templates: match.greeting_templates,
    used_llm: Boolean(match.used_llm),
  };
}

async function scoreAndStoreJob(rawJob, { runWebSearch = true, useLlm = false } = {}) {
  const settings = getSettings();
  const tracks = getAccountTracks();
  const trackMap = Object.fromEntries(tracks.map((t) => [t.track_key, t]));

  const blacklisted = checkBlacklisted(rawJob.company_name);
  const trigger = shouldTriggerWebSearch(rawJob);
  let intel = getCompanyIntel(rawJob.company_name);

  if (!blacklisted && runWebSearch && settings.auto_web_search !== "false" && trigger.required && (!intel || intel.search_status !== "DONE")) {
    logEvent(`触发联网背调补查（${trigger.reason}）：${rawJob.company_name}`);
    intel = await searchCompanyBackgroundIntel(rawJob.company_name);
    await new Promise((r) => setTimeout(r, 900));
  }

  const risk = evaluateJobRisk(rawJob, intel, { blacklisted });
  const assignedProfile =
    rawJob.assigned_profile_id ||
    rawJob.source_profile_id ||
    tracks.find((t) => t.track_key === "A")?.profile_id ||
    tracks[0]?.profile_id ||
    "Profile 1";

  const resume = getPrimaryResume();
  let match = matchResumeToJob({ ...rawJob, ...risk }, resume, settings);
  if (useLlm && risk.zone !== "SKIP" && match.eligibility?.eligible && isLlmConfigured(settings)) {
    match = await refineMatchWithLlm({ ...rawJob, ...risk }, resume, match);
  }
  const manualRestored = rawJob.filter_reason === "人工放行";
  const finalFilterStatus = manualRestored ? "PASS" : (match.eligibility?.filter_status || "PASS");
  const finalFilterReason = manualRestored ? "人工放行" : (match.eligibility?.filter_reason || "");

  return upsertJob({
    ...rawJob,
    parsed: { ...risk.parsed, search_trigger: trigger },
    risk_score: risk.risk_score,
    zone: risk.zone,
    recommended_track: risk.recommended_track,
    assigned_profile_id: assignedProfile,
    evidence: risk.evidence,
    intel_summary: intel?.summary || (trigger.required ? "待联网补查" : "无需强制补查"),
    match_score: match.match_score,
    apply_advice: manualRestored && match.apply_advice === "LOW_FIT" ? "REVISE_FIRST" : match.apply_advice,
    filter_status: finalFilterStatus,
    filter_reason: finalFilterReason,
    matched_query: rawJob.matched_query || "",
    match: pickMatchPayload(match),
    tailored_resume: match.tailored_resume,
    custom_greeting: match.custom_greeting,
  });
}

async function autoComputeCommuteForJobs(jobs = [], onLog = () => {}) {
  const settings = getSettings();
  const homeAddress = String(settings.home_address || "").trim();
  if (!homeAddress) return;
  const homeCity = String(settings.home_city || "广州").trim();
  const targets = jobs.filter(
    (j) => (j.filter_status || "PASS") === "PASS" && (j.commute?.status !== "DONE" || j.commute?.home_address !== homeAddress)
  );
  if (targets.length === 0) return;
  try {
    const resEnrich = await enrichJobDetailsAndCommuteViaEgo({
      jobs: targets,
      homeAddress,
      homeCity,
      fetchMissingAddress: false,
      onLog,
    });
    for (const item of resEnrich.items) {
      updateJobRouting(item.id, {
        work_address: item.work_address || undefined,
        longitude: item.longitude ?? undefined,
        latitude: item.latitude ?? undefined,
        commute: item.commute,
      });
    }
  } catch (err) {
    onLog(`通勤自动测算跳过：${err.message}`, "warn");
  }
}

let patrolRunning = false;

function resolveBossFilterParams(settings = {}) {
  if (settings.boss_native_filter === "false") {
    return { bossJobType: "", bossExperience: "", bossSalary: "" };
  }
  const bossJobType = settings.filter_exclude_intern !== "false" ? "1901" : "";
  const bossExperience =
    settings.filter_exp_mode === "1_3_only"
      ? "101,103,104"
      : settings.filter_exp_mode === "all"
        ? ""
        : "101,103,104,105";
  return {
    bossJobType,
    bossExperience,
    bossSalary: String(settings.boss_salary_filter || "").trim(),
  };
}

function parseWatchlistKeywords(settings) {
  try {
    const arr = JSON.parse(settings.watchlist_keywords || "[]");
    if (Array.isArray(arr) && arr.length > 0) return arr.map((s) => String(s).trim()).filter(Boolean);
  } catch {}
  return [...DEFAULT_TARGET_ROLES];
}

async function storeScrapedBatch(scrapedJobs = [], { profileId, query }) {
  const saved = [];
  let newCount = 0;
  let keptCount = 0;
  let filteredCount = 0;
  for (const raw of scrapedJobs) {
    const extId = raw.external_id || `${raw.company_name}::${raw.job_title}::${raw.salary_range || ""}`;
    const existed = hasJobExternalId(extId);
    const stored = await scoreAndStoreJob({ ...raw, source_profile_id: profileId, matched_query: query }, { runWebSearch: false });
    saved.push(stored);
    if (!existed) newCount++;
    if ((stored.filter_status || "PASS") === "PASS") keptCount++;
    else filteredCount++;
  }
  return { saved, newCount, keptCount, filteredCount };
}

async function runDailyPatrol({
  keywords = null,
  city = null,
  maxPerKeyword = null,
  minHrActive = null,
  scanMode = null,
  profileId = null,
} = {}) {
  if (patrolRunning) {
    throw new Error("每日巡检任务已在执行中，请等待当前队列完成");
  }
  patrolRunning = true;
  const startedAt = new Date().toISOString();
  try {
    const settings = getSettings();
    const tracks = getAccountTracks();
    const targetKeywords = Array.isArray(keywords) && keywords.length > 0
      ? keywords.map((k) => String(k).trim()).filter(Boolean)
      : parseWatchlistKeywords(settings);
    const targetCity = city || settings.search_city || "101280100";
    const targetMax = Math.max(1, Math.min(25, Number(maxPerKeyword || settings.scrape_max_jobs || 10)));
    const targetHr = minHrActive || settings.min_hr_active || "week";
    const mode = scanMode || settings.scan_mode || "both";
    const filterMinSalaryK = settings.filter_min_salary_k === "" || settings.filter_min_salary_k == null ? 7 : Number(settings.filter_min_salary_k);
    const excludeIntern = settings.filter_exclude_intern !== "false";
    const excludeNonQa = settings.filter_exclude_non_qa !== "false";
    const targetCityName = settings.search_city_name || "广州";
    const bossFilters = resolveBossFilterParams(settings);
    const MAX_PROFILE_CLICKS_PER_RUN = 80;

    const allKnownProfiles = [...new Set(tracks.map((t) => t.profile_id).filter(Boolean))];
    let targetProfiles = mode === "both"
      ? (allKnownProfiles.length > 0 ? allKnownProfiles : ["Profile 1", "Profile 2"])
      : [profileId || allKnownProfiles[0] || "Profile 1"];

    targetProfiles = targetProfiles.filter((pid) => {
      const br = isProfileBreakerActive(pid);
      if (br) {
        logEvent(`跳过今日已熔断账号 ${pid}（${br.reason}）`, "warn");
        return false;
      }
      return true;
    });

    if (targetProfiles.length === 0) {
      throw new Error("所选 Ego 账号今日均已触发防封熔断，请先在设置页确认安全后解除熔断");
    }

    const totalSteps = targetProfiles.length * targetKeywords.length;
    const plannedQuota = totalSteps * targetMax;
    let stepIndex = 0;
    let totalSaved = 0;
    let totalNew = 0;
    let totalKept = 0;
    let totalFiltered = 0;
    const touchedProfiles = [];
    const stepDetails = [];

    for (const pid of targetProfiles) {
      touchedProfiles.push(pid);
      let profileClicks = 0;
      for (const kw of targetKeywords) {
        stepIndex++;
        if (profileClicks >= MAX_PROFILE_CLICKS_PER_RUN) {
          logEvent(`🛡️ ${pid} 本轮详情点击已达 ${MAX_PROFILE_CLICKS_PER_RUN} 次风控上限，跳过「${kw}」保护账号`, "warn");
          continue;
        }
        broadcast("patrol-progress", {
          step: stepIndex,
          total: totalSteps,
          profileId: pid,
          keyword: kw,
          savedCount: totalSaved,
        });
        logEvent(`巡检进度 [${stepIndex}/${totalSteps}]：使用 ${pid} 增量扫描「${kw}」...`);

        const knownIds = listKnownExternalIds();
        const scrapeRes = await scrapeBossJobs({
          profileId: pid,
          query: kw,
          city: targetCity,
          maxJobs: targetMax,
          minHrActive: targetHr,
          minDelayMs: settings.delay_min_ms ?? 4500,
          maxDelayMs: settings.delay_max_ms ?? 8500,
          existingIds: knownIds,
          skipExisting: true,
          filterMinSalaryK,
          excludeIntern,
          excludeNonQa,
          targetCityName,
          ...bossFilters,
          maxClicksPerStep: Math.min(28, MAX_PROFILE_CLICKS_PER_RUN - profileClicks + 2),
          onLog: (m) => logEvent(m),
        });
        const stepClicks = Number(scrapeRes.stats?.detailClicks || 0);
        profileClicks += stepClicks;

        const scrapedJobs = scrapeRes.jobs || [];
        if (settings.auto_web_search !== "false" && scrapedJobs.length > 0) {
          const needSearch = scrapedJobs
            .filter(
              (j) =>
                j?.company_name &&
                !checkBlacklisted(j.company_name) &&
                evaluateJobEligibility(j, settings).eligible &&
                shouldTriggerWebSearch(j).required
            )
            .map((j) => j.company_name);
          if (needSearch.length > 0) {
            await searchCompaniesBatchIntel(needSearch, { profileId: pid, onLog: (m) => logEvent(m) });
          }
        }

        const batch = await storeScrapedBatch(scrapedJobs, { profileId: pid, query: kw });
        totalSaved += batch.saved.length;
        totalNew += batch.newCount;
        totalKept += batch.keptCount;
        totalFiltered += batch.filteredCount;
        stepDetails.push({
          profile_id: pid,
          keyword: kw,
          scanned: batch.saved.length,
          new_count: batch.newCount,
          kept: batch.keptCount,
          skipped_existing: scrapeRes.stats?.skippedExisting || 0,
          skipped_prefilter: scrapeRes.stats?.skippedPreFilter || 0,
          detail_clicks: stepClicks,
        });

        if (scrapeRes.status === "VERIFICATION_REQUIRED") {
          tripProfileBreaker(pid, `巡检「${kw}」时触发安全验证`);
          broadcast("verification", scrapeRes);
          const verifySummary = `${new Date().toLocaleString("zh-CN", { hour12: false })} · ${pid} 在「${kw}」触发验证中断，已累计增量入库 ${totalNew} 条`;
          saveSettings({
            last_daily_check_date: todayStr(),
            last_daily_check_summary: verifySummary,
          });
          recordPatrolRun({
            run_date: new Date().toLocaleDateString("sv-SE"),
            mode: "PATROL",
            profiles: touchedProfiles,
            keywords: targetKeywords,
            planned_quota: plannedQuota,
            scanned_count: totalSaved,
            new_count: totalNew,
            kept_count: totalKept,
            filtered_count: totalFiltered,
            status: "VERIFICATION_REQUIRED",
            summary: verifySummary,
            details: stepDetails,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
          });
          return {
            status: "VERIFICATION_REQUIRED",
            taskSpaceId: scrapeRes.taskSpaceId,
            url: scrapeRes.url,
            savedCount: totalSaved,
            stoppedAt: { profileId: pid, keyword: kw },
          };
        }

        if (stepIndex < totalSteps) {
          const pauseMs = stepClicks > 0
            ? (3600 + Math.floor(Math.random() * 2600))
            : (1300 + Math.floor(Math.random() * 900));
          await new Promise((r) => setTimeout(r, pauseMs));
        }
      }
    }

    const summary = `${new Date().toLocaleString("zh-CN", { hour12: false })} · 完成 ${targetKeywords.length} 类岗位 × ${touchedProfiles.join("+")} 巡检，保存/更新 ${totalSaved} 条岗位`;
    await autoComputeCommuteForJobs(listJobs().filter((j) => (j.filter_status || "PASS") === "PASS" && j.commute?.status !== "DONE"), (m, lvl) => logEvent(m, lvl));
    saveSettings({
      last_daily_check_date: todayStr(),
      last_daily_check_summary: summary,
    });
    recordPatrolRun({
      run_date: new Date().toLocaleDateString("sv-SE"),
      mode: "PATROL",
      profiles: touchedProfiles,
      keywords: targetKeywords,
      planned_quota: plannedQuota,
      scanned_count: totalSaved,
      new_count: totalNew,
      kept_count: totalKept,
      filtered_count: totalFiltered,
      status: "OK",
      summary,
      details: stepDetails,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
    logEvent(`✅ ${summary}`);
    return { status: "OK", savedCount: totalSaved, newCount: totalNew, keptCount: totalKept, summary };
  } finally {
    patrolRunning = false;
    broadcast("patrol-progress", { done: true });
  }
}

function buildStatePayload() {
  const settings = getSettings();
  const tracks = getAccountTracks().map((t) => ({
    ...t,
    today_delivered: countTodayDeliveries(t.profile_id),
  }));
  const maskedSettings = {
    ...settings,
    llm_api_key: settings.llm_api_key ? "******" : "",
    has_llm_key: Boolean(settings.llm_api_key),
  };
  const jobs = listJobs().map((j) => ({
    ...j,
    company_history: getCompanyDeliveryHistory(j.company_name),
    blacklisted: checkBlacklisted(j.company_name),
  }));
  return {
    version: getCurrentVersion(),
    settings: maskedSettings,
    llmConfigured: isLlmConfigured(settings),
    tracks,
    resumes: getResumes(),
    resume_image: getResumeImageMeta(),
    jobs,
    blacklist: listBlacklist(),
    funnel: getFunnelStats(),
    patrol_runs: listPatrolRuns(25),
    scrape_telemetry: getScrapeTelemetry(),
    logs: listDeliveryLogs(300),
    recentEvents: recentLogs,
    activeLock: getActiveLock(),
    patrolRunning,
    defaultWatchlist: DEFAULT_TARGET_ROLES,
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req, maxBytes = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, activeLock: getActiveLock() })}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (req.method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, app: "boss-ai-router", version: getCurrentVersion() });
    }

    if (req.method === "GET" && pathname === "/api/state") {
      return sendJson(res, 200, buildStatePayload());
    }

    if (req.method === "GET" && pathname === "/api/export") {
      const data = {
        exported_at: new Date().toISOString(),
        version: getCurrentVersion(),
        funnel: getFunnelStats(),
        jobs: listJobs(),
        delivery_logs: listDeliveryLogs(500),
      };
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="boss-ai-router-export-${new Date().toISOString().slice(0, 10)}.json"`,
      });
      res.end(JSON.stringify(data, null, 2));
      return;
    }

    if (req.method === "GET" && pathname === "/api/ego/profiles") {
      const profiles = await listEgoProfiles();
      return sendJson(res, 200, { profiles });
    }

    // GitHub 自动更新检查与下载安装
    if (req.method === "GET" && pathname === "/api/update/check") {
      const settings = getSettings();
      const info = await checkGithubUpdate(settings.github_repo);
      return sendJson(res, 200, info);
    }

    if (req.method === "POST" && pathname === "/api/update/apply") {
      const body = await readBody(req);
      const settings = getSettings();
      const check = body.download_url ? null : await checkGithubUpdate(settings.github_repo);
      const downloadUrl = body.download_url || check?.asset?.download_url;
      const fileName = body.file_name || check?.asset?.name || "boss-ai-router-update.exe";
      if (!downloadUrl) {
        return sendJson(res, 400, { error: "当前 GitHub Release 未提供可下载的 Windows 更新包" });
      }
      logEvent(`开始下载更新包：${fileName}...`);
      const downloaded = await downloadAndPrepareUpdate(downloadUrl, fileName, (prog) => {
        broadcast("update-progress", prog);
      });
      logEvent(`下载完成（${Math.round(downloaded.size / 1024 / 1024)} MB），即将启动安装并重启应用...`);
      const launchRes = launchUpdateInstaller(downloaded.path, process.env.BOSS_ROUTER_EXE_PATH || "");
      sendJson(res, 200, { ok: true, ...launchRes });
      setTimeout(() => process.exit(42), 600);
      return;
    }

    // 黑名单管理
    if (req.method === "GET" && pathname === "/api/blacklist") {
      return sendJson(res, 200, { items: listBlacklist() });
    }

    if (req.method === "POST" && pathname === "/api/blacklist") {
      const body = await readBody(req);
      const names = Array.isArray(body.companies)
        ? body.companies
        : String(body.text || body.company_name || "")
            .split(/[\r\n,，]+/)
            .map((s) => s.trim())
            .filter(Boolean);
      const result = addBlacklistCompanies(names, body.reason || "手动拉黑");
      // 重新标记库内命中黑名单的待处理岗位
      for (const job of listJobs()) {
        const hit = checkBlacklisted(job.company_name);
        if (hit && job.zone !== "SKIP") {
          await scoreAndStoreJob(job, { runWebSearch: false });
        }
      }
      logEvent(`已更新黑名单（新增/更新 ${result.added} 家公司）`);
      return sendJson(res, 200, { ok: true, ...result, state: buildStatePayload() });
    }

    const delBlacklistMatch = pathname.match(/^\/api\/blacklist\/(\d+)$/);
    if (req.method === "DELETE" && delBlacklistMatch) {
      const items = removeBlacklistCompany(Number(delBlacklistMatch[1]));
      return sendJson(res, 200, { ok: true, items, state: buildStatePayload() });
    }

    const jobDetailMatch = pathname.match(/^\/api\/jobs\/(\d+)$/);
    if (req.method === "GET" && jobDetailMatch) {
      const job = getJob(Number(jobDetailMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      return sendJson(res, 200, {
        ...job,
        intel: getCompanyIntel(job.company_name),
        company_history: getCompanyDeliveryHistory(job.company_name),
        blacklisted: checkBlacklisted(job.company_name),
      });
    }

    if (req.method === "POST" && pathname === "/api/settings") {
      const body = await readBody(req);
      const patch = { ...body };
      if (patch.llm_api_key === "******") delete patch.llm_api_key;
      saveSettings(patch);
      const filterKeys = [
        "filter_min_salary_k",
        "target_salary_min_k",
        "target_salary_max_k",
        "filter_exclude_remote",
        "filter_exp_mode",
        "filter_exclude_intern",
        "filter_exclude_non_qa",
        "search_city_name",
      ];
      if (filterKeys.some((k) => k in patch)) {
        for (const j of listJobs()) {
          await scoreAndStoreJob(j, { runWebSearch: false });
        }
      }
      return sendJson(res, 200, { ok: true, state: buildStatePayload() });
    }

    if (req.method === "POST" && pathname === "/api/tracks/swap") {
      const tracks = getAccountTracks();
      const a = tracks.find((t) => t.track_key === "A");
      const b = tracks.find((t) => t.track_key === "B");
      if (a && b) {
        updateAccountTrack("A", { profile_id: b.profile_id, profile_name: b.profile_name });
        updateAccountTrack("B", { profile_id: a.profile_id, profile_name: a.profile_name });
      }
      logEvent("已对调 A轨 与 B轨 绑定的 Ego 账号配置");
      return sendJson(res, 200, { ok: true, state: buildStatePayload() });
    }

    const clearBreakerMatch = pathname.match(/^\/api\/tracks\/([AB])\/clear-breaker$/);
    if (req.method === "POST" && clearBreakerMatch) {
      clearTrackBreaker(clearBreakerMatch[1]);
      logEvent(`已手动解除 ${clearBreakerMatch[1]}轨 今日防封熔断`);
      return sendJson(res, 200, { ok: true, state: buildStatePayload() });
    }

    const trackMatch = pathname.match(/^\/api\/tracks\/([AB])$/);
    if (req.method === "POST" && trackMatch) {
      const body = await readBody(req);
      updateAccountTrack(trackMatch[1], body);
      return sendJson(res, 200, { ok: true, state: buildStatePayload() });
    }

    const resumeSyncMatch = pathname.match(/^\/api\/resumes\/([AB])\/sync$/);
    if (req.method === "POST" && resumeSyncMatch) {
      const key = resumeSyncMatch[1];
      const body = await readBody(req).catch(() => ({}));
      const track = getAccountTracks().find((t) => t.track_key === key);
      const profileId = body.profileId || track?.profile_id || "Profile 2";
      const result = await syncResumeFromBoss(key, profileId, (m) => logEvent(m));
      if (result.status === "VERIFICATION_REQUIRED") {
        tripProfileBreaker(profileId, "同步简历时触发安全验证");
        broadcast("verification", result);
        return sendJson(res, 202, { ...result, state: buildStatePayload() });
      }
      saveResume(key, result.resume);
      return sendJson(res, 200, { ok: true, resume: result.resume, state: buildStatePayload() });
    }

    const resumeSaveMatch = pathname.match(/^\/api\/resumes\/([AB])$/);
    if (req.method === "POST" && resumeSaveMatch) {
      const key = resumeSaveMatch[1];
      const body = await readBody(req);
      const saved = saveResume(key, { ...body, source: "manual_edit" });
      logEvent(`已更新简历内容`);
      return sendJson(res, 200, { ok: true, resume: saved, state: buildStatePayload() });
    }

    if (req.method === "GET" && pathname === "/api/resume-image") {
      const meta = getResumeImageMeta();
      if (!meta.exists || !fs.existsSync(meta.filePath)) {
        return sendJson(res, 404, { error: "尚未配置图片简历" });
      }
      const ext = path.extname(meta.filePath).toLowerCase();
      const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
      res.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(meta.filePath).pipe(res);
      return;
    }

    if (req.method === "GET" && pathname === "/api/resume-assets/source-pdf") {
      const pdfFile = path.join(RESUME_ASSETS_DIR, "resume-source.pdf");
      if (!fs.existsSync(pdfFile)) {
        return sendJson(res, 404, { error: "尚未保存源 PDF 简历" });
      }
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(pdfFile).pipe(res);
      return;
    }

    if (req.method === "GET" && pathname === "/api/resume-assets/pdf-renderer") {
      const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;}</style></head><body>
<script type="module">
const SOURCES = [
  ["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs", "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs"],
  ["https://unpkg.com/pdfjs-dist@4.2.67/build/pdf.min.mjs", "https://unpkg.com/pdfjs-dist@4.2.67/build/pdf.worker.min.mjs"]
];
async function run() {
  let pdfjs = null;
  for (const [libUrl, workerUrl] of SOURCES) {
    try {
      pdfjs = await import(libUrl);
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      break;
    } catch {}
  }
  if (!pdfjs) throw new Error("PDF.js CDN unreachable");
  const resp = await fetch("/api/resume-assets/source-pdf?t=" + Date.now());
  if (!resp.ok) throw new Error("Source PDF missing");
  const buf = await resp.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const scale = 2.4;
  const pageCanvases = [];
  let totalH = 0;
  let maxW = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.ceil(vp.width);
    c.height = Math.ceil(vp.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    pageCanvases.push(c);
    maxW = Math.max(maxW, c.width);
    totalH += c.height + (p > 1 ? 16 : 0);
  }
  const out = document.createElement("canvas");
  out.width = maxW;
  out.height = totalH;
  const octx = out.getContext("2d");
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (let i = 0; i < pageCanvases.length; i++) {
    if (i > 0) y += 16;
    octx.drawImage(pageCanvases[i], Math.floor((maxW - pageCanvases[i].width) / 2), y);
    y += pageCanvases[i].height;
  }
  window.__PDF_PNG_WIDTH = out.width;
  window.__PDF_PNG_HEIGHT = out.height;
  window.__PDF_PNG_DATA_URL = out.toDataURL("image/png");
  window.__PDF_PNG_READY = true;
}
run().catch((e) => { window.__PDF_PNG_ERROR = String(e?.message || e); });
</script></body></html>`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "POST" && pathname === "/api/resume-assets/upload") {
      const body = await readBody(req, 25 * 1024 * 1024);
      const rawName = String(body.filename || "resume.pdf").trim();
      const b64 = String(body.dataBase64 || "").replace(/^data:[^;]+;base64,/, "");
      if (!b64) return sendJson(res, 400, { error: "未收到文件内容" });
      const buf = Buffer.from(b64, "base64");
      const ext = path.extname(rawName).toLowerCase();

      if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
        const targetImgName = ext === ".jpg" || ext === ".jpeg" ? "resume-image.jpg" : "resume-image.png";
        const outImg = path.join(RESUME_ASSETS_DIR, targetImgName);
        fs.writeFileSync(outImg, buf);
        const meta = saveResumeImageMeta({
          source_name: rawName,
          image_file: targetImgName,
          bytes: buf.length,
        });
        logEvent(`已上传图片简历：${rawName}`);
        return sendJson(res, 200, { ok: true, resume_image: meta, state: buildStatePayload() });
      }

      if (ext === ".pdf") {
        const srcPdf = path.join(RESUME_ASSETS_DIR, "resume-source.pdf");
        const outPng = path.join(RESUME_ASSETS_DIR, "resume-image.png");
        fs.writeFileSync(srcPdf, buf);
        const rendered = await renderResumeImageViaEgo({
          pdfRenderUrl: `http://127.0.0.1:${PORT}/api/resume-assets/pdf-renderer`,
          fallbackHtmlUrl: `http://127.0.0.1:${PORT}/resume-print.html`,
          outputPath: outPng,
          onLog: (m) => logEvent(m),
        });
        const meta = saveResumeImageMeta({
          source_name: rawName,
          image_file: "resume-image.png",
          bytes: rendered.bytes,
          width: rendered.width,
          height: rendered.height,
        });
        return sendJson(res, 200, { ok: true, resume_image: meta, state: buildStatePayload() });
      }

      return sendJson(res, 400, { error: "仅支持 PDF、PNG、JPG 格式文件" });
    }

    if (req.method === "POST" && pathname === "/api/resume-assets/generate-from-online") {
      const outPng = path.join(RESUME_ASSETS_DIR, "resume-image.png");
      const srcPdf = path.join(RESUME_ASSETS_DIR, "resume-source.pdf");
      const hasPdf = fs.existsSync(srcPdf);
      const rendered = await renderResumeImageViaEgo({
        pdfRenderUrl: hasPdf ? `http://127.0.0.1:${PORT}/api/resume-assets/pdf-renderer` : "",
        fallbackHtmlUrl: `http://127.0.0.1:${PORT}/resume-print.html`,
        outputPath: outPng,
        onLog: (m) => logEvent(m),
      });
      const meta = saveResumeImageMeta({
        source_name: hasPdf ? "简历附件转高清长图.png" : "在线简历生成长图.png",
        image_file: "resume-image.png",
        bytes: rendered.bytes,
        width: rendered.width,
        height: rendered.height,
      });
      return sendJson(res, 200, { ok: true, resume_image: meta, state: buildStatePayload() });
    }

    if (req.method === "POST" && pathname === "/api/jobs/import") {
      const body = await readBody(req);
      const list = Array.isArray(body) ? body : Array.isArray(body.jobs) ? body.jobs : [body];
      if (body.runWebSearch !== false) {
        const settings = getSettings();
        const needSearch = list
          .filter(
            (j) =>
              j?.company_name &&
              !checkBlacklisted(j.company_name) &&
              evaluateJobEligibility(j, settings).eligible &&
              shouldTriggerWebSearch(j).required
          )
          .map((j) => j.company_name);
        if (needSearch.length > 0) {
          await searchCompaniesBatchIntel(needSearch, { onLog: (m) => logEvent(m) });
        }
      }
      const stored = [];
      for (const item of list) {
        if (!item?.company_name) continue;
        stored.push(await scoreAndStoreJob(item, { runWebSearch: false, useLlm: Boolean(body.useLlm) }));
      }
      logEvent(`已评估并入库 ${stored.length} 条岗位`);
      return sendJson(res, 200, { ok: true, jobs: stored, state: buildStatePayload() });
    }

    if (req.method === "POST" && pathname === "/api/jobs/scrape") {
      const body = await readBody(req);
      const settings = getSettings();
      const tracks = getAccountTracks();
      const profileId = body.profileId || tracks.find((t) => t.track_key === "B")?.profile_id || "Profile 1";

      const breaker = isProfileBreakerActive(profileId);
      if (breaker && !body.overrideBreaker) {
        return sendJson(res, 429, {
          error: `🛡️ 当日防封熔断生效中：账号 ${profileId} 今日曾触发验证（${breaker.reason}），为防封号已暂停采集；若确认安全请先在“防封设置”手动解除熔断。`,
        });
      }

      const knownIds = body.skipExisting === false ? [] : listKnownExternalIds();
      const singleTargetMax = Math.max(1, Math.min(50, Number(body.maxJobs ?? settings.scrape_max_jobs ?? 10)));
      const bossFilters = resolveBossFilterParams(settings);
      const scrapeRes = await scrapeBossJobs({
        profileId,
        query: body.query || settings.search_query || "AI测试",
        city: body.city || settings.search_city || "101280100",
        maxJobs: singleTargetMax,
        minHrActive: body.minHrActive || settings.min_hr_active || "week",
        minDelayMs: body.minDelayMs ?? settings.delay_min_ms ?? 4500,
        maxDelayMs: body.maxDelayMs ?? settings.delay_max_ms ?? 8500,
        existingIds: knownIds,
        skipExisting: body.skipExisting !== false,
        filterMinSalaryK: settings.filter_min_salary_k === "" || settings.filter_min_salary_k == null ? 7 : Number(settings.filter_min_salary_k),
        excludeIntern: settings.filter_exclude_intern !== "false",
        excludeNonQa: settings.filter_exclude_non_qa !== "false",
        targetCityName: settings.search_city_name || "广州",
        ...bossFilters,
        maxClicksPerStep: Math.min(55, singleTargetMax + 5),
        onLog: (m) => logEvent(m),
      });

      const scrapedJobs = scrapeRes.jobs || [];
      if (settings.auto_web_search !== "false" && scrapedJobs.length > 0) {
        const needSearch = scrapedJobs
          .filter(
            (j) =>
              j?.company_name &&
              !checkBlacklisted(j.company_name) &&
              evaluateJobEligibility(j, settings).eligible &&
              shouldTriggerWebSearch(j).required
          )
          .map((j) => j.company_name);
        if (needSearch.length > 0) {
          await searchCompaniesBatchIntel(needSearch, { profileId, onLog: (m) => logEvent(m) });
        }
      }

      const singleKw = body.query || settings.search_query || "AI测试";
      const singleMax = Number(body.maxJobs ?? settings.scrape_max_jobs ?? 8);
      const startedSingle = new Date().toISOString();
      const batch = await storeScrapedBatch(scrapedJobs, { profileId, query: singleKw });
      const savedJobs = batch.saved;
      await autoComputeCommuteForJobs(savedJobs, (m, lvl) => logEvent(m, lvl));
      recordPatrolRun({
        run_date: new Date().toLocaleDateString("sv-SE"),
        mode: "SINGLE",
        profiles: [profileId],
        keywords: [singleKw],
        planned_quota: singleMax,
        scanned_count: batch.saved.length,
        new_count: batch.newCount,
        kept_count: batch.keptCount,
        filtered_count: batch.filteredCount,
        status: scrapeRes.status === "VERIFICATION_REQUIRED" ? "VERIFICATION_REQUIRED" : "OK",
        summary: `${new Date().toLocaleString("zh-CN", { hour12: false })} · 单词采集「${singleKw}」(${profileId}) 扫描 ${batch.saved.length} 条 · 新增 ${batch.newCount} · 留下 ${batch.keptCount}`,
        details: [{ profile_id: profileId, keyword: singleKw, scanned: batch.saved.length, new_count: batch.newCount, kept: batch.keptCount }],
        started_at: startedSingle,
        finished_at: new Date().toISOString(),
      });

      if (scrapeRes.status === "VERIFICATION_REQUIRED") {
        tripProfileBreaker(profileId, "采集岗位过程中触发安全验证");
        broadcast("verification", scrapeRes);
        return sendJson(res, 202, {
          status: "VERIFICATION_REQUIRED",
          taskSpaceId: scrapeRes.taskSpaceId,
          url: scrapeRes.url,
          savedCount: savedJobs.length,
          state: buildStatePayload(),
        });
      }
      return sendJson(res, 200, { ok: true, savedCount: savedJobs.length, state: buildStatePayload() });
    }

    if (req.method === "POST" && pathname === "/api/jobs/patrol") {
      const body = await readBody(req).catch(() => ({}));
      const resPatrol = await runDailyPatrol({
        keywords: body.keywords,
        city: body.city,
        maxPerKeyword: body.maxPerKeyword,
        minHrActive: body.minHrActive,
        scanMode: body.scanMode,
        profileId: body.profileId,
      });
      if (resPatrol.status === "VERIFICATION_REQUIRED") {
        return sendJson(res, 202, { ...resPatrol, state: buildStatePayload() });
      }
      return sendJson(res, 200, { ok: true, ...resPatrol, state: buildStatePayload() });
    }

    if (req.method === "POST" && pathname === "/api/jobs/re-evaluate-all") {
      const jobs = listJobs();
      let passCount = 0;
      for (const j of jobs) {
        const updated = await scoreAndStoreJob(j, { runWebSearch: false });
        if ((updated.filter_status || "PASS") === "PASS") passCount++;
      }
      logEvent(`已按精筛规则与 2年主简历重算全部 ${jobs.length} 条岗位（保留精选 ${passCount} 条，过滤杂岗 ${jobs.length - passCount} 条）`);
      return sendJson(res, 200, { ok: true, count: jobs.length, passCount, state: buildStatePayload() });
    }

    if (req.method === "POST" && pathname === "/api/jobs/purge-filtered") {
      const removed = purgeFilteredJobs();
      logEvent(`已从本地库清理 ${removed} 条已过滤杂岗`);
      return sendJson(res, 200, { ok: true, removed, state: buildStatePayload() });
    }

    if (req.method === "POST" && pathname === "/api/jobs/enrich-commute") {
      const body = await readBody(req).catch(() => ({}));
      const settings = getSettings();
      const homeAddress = (body.home_address || settings.home_address || "").trim();
      const homeCity = (body.home_city || settings.home_city || "广州").trim();
      if (!homeAddress) {
        return sendJson(res, 400, { error: "请先在「巡检计划与设置」填写你的居住地址后再测算通勤" });
      }
      const all = listJobs();
      const candidates = Array.isArray(body.jobIds) && body.jobIds.length
        ? all.filter((j) => body.jobIds.includes(j.id))
        : all.filter(
            (j) =>
              (j.filter_status || "PASS") === "PASS" &&
              (body.force || j.commute?.status !== "DONE" || j.commute?.home_address !== homeAddress)
          );
      if (candidates.length === 0) {
        return sendJson(res, 200, { ok: true, updated: 0, state: buildStatePayload() });
      }
      const resEnrich = await enrichJobDetailsAndCommuteViaEgo({
        jobs: candidates,
        homeAddress,
        homeCity,
        fetchMissingAddress: body.fetchMissingAddress !== false,
        onLog: (m) => logEvent(m),
      });
      for (const item of resEnrich.items) {
        updateJobRouting(item.id, {
          work_address: item.work_address || undefined,
          longitude: item.longitude ?? undefined,
          latitude: item.latitude ?? undefined,
          commute: item.commute,
        });
      }
      return sendJson(res, 200, {
        ok: true,
        updated: resEnrich.items.length,
        homeResolved: resEnrich.homeResolved,
        state: buildStatePayload(),
      });
    }

    const commuteOneMatch = pathname.match(/^\/api\/jobs\/(\d+)\/commute$/);
    if (req.method === "POST" && commuteOneMatch) {
      const job = getJob(Number(commuteOneMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req).catch(() => ({}));
      const settings = getSettings();
      const homeAddress = (body.home_address || settings.home_address || "").trim();
      const homeCity = (body.home_city || settings.home_city || "广州").trim();
      if (!homeAddress) {
        return sendJson(res, 400, { error: "请先在「巡检计划与设置」填写居住地址" });
      }
      const resEnrich = await enrichJobDetailsAndCommuteViaEgo({
        jobs: [job],
        homeAddress,
        homeCity,
        fetchMissingAddress: !job.work_address || Boolean(body.forceAddress),
        onLog: (m) => logEvent(m),
      });
      const item = resEnrich.items[0];
      if (item) {
        updateJobRouting(job.id, {
          work_address: item.work_address || undefined,
          longitude: item.longitude ?? undefined,
          latitude: item.latitude ?? undefined,
          commute: item.commute,
        });
      }
      return sendJson(res, 200, { ok: true, job: getJob(job.id), state: buildStatePayload() });
    }

    const overrideMatch = pathname.match(/^\/api\/jobs\/(\d+)\/override-filter$/);
    if (req.method === "POST" && overrideMatch) {
      const job = getJob(Number(overrideMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req).catch(() => ({}));
      const nextStatus = body.filter_status === "FILTERED" ? "FILTERED" : "PASS";
      const nextReason = nextStatus === "PASS" ? "人工放行" : (body.filter_reason || "手动标记为杂岗过滤");
      const updated = updateJobRouting(job.id, {
        filter_status: nextStatus,
        filter_reason: nextReason,
      });
      if (nextStatus === "PASS") {
        await scoreAndStoreJob(updated, { runWebSearch: false });
      }
      logEvent(nextStatus === "PASS" ? `已放行「${job.job_title} · ${job.company_name}」回到精选池` : `已手动过滤「${job.job_title}」`);
      return sendJson(res, 200, { ok: true, job: getJob(job.id), state: buildStatePayload() });
    }

    const intelMatch = pathname.match(/^\/api\/jobs\/(\d+)\/intel$/);
    if (req.method === "POST" && intelMatch) {
      const job = getJob(Number(intelMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      logEvent(`正在联网补查「${job.company_name}」背调与个税舆情...`);
      await searchCompanyBackgroundIntel(job.company_name, { force: true });
      const updated = await scoreAndStoreJob(job, { runWebSearch: false });
      return sendJson(res, 200, { ok: true, job: updated, state: buildStatePayload() });
    }

    const evalMatch = pathname.match(/^\/api\/jobs\/(\d+)\/evaluate$/);
    if (req.method === "POST" && evalMatch) {
      const job = getJob(Number(evalMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req).catch(() => ({}));
      const settings = getSettings();
      const resume = getPrimaryResume(body.trackKey || null);
      const intel = getCompanyIntel(job.company_name);
      const blacklisted = checkBlacklisted(job.company_name);
      const risk = evaluateJobRisk(job, intel, { blacklisted });
      let match = matchResumeToJob({ ...job, ...risk }, resume, settings);
      if (body.useLlm !== false && match.eligibility?.eligible && isLlmConfigured()) {
        match = await refineMatchWithLlm({ ...job, ...risk }, resume, match);
      }
      const tracks = getAccountTracks();
      const targetProfile =
        body.profileId ||
        job.assigned_profile_id ||
        tracks.find((t) => t.track_key === (body.trackKey || "A"))?.profile_id ||
        tracks[0]?.profile_id ||
        "Profile 1";
      const manualRestored = job.filter_reason === "人工放行";
      const refreshed = upsertJob({
        ...job,
        manual_track: body.trackKey || job.manual_track,
        assigned_profile_id: targetProfile,
        risk_score: risk.risk_score,
        zone: risk.zone,
        recommended_track: risk.recommended_track,
        evidence: risk.evidence,
        match_score: match.match_score,
        apply_advice: manualRestored && match.apply_advice === "LOW_FIT" ? "REVISE_FIRST" : match.apply_advice,
        filter_status: manualRestored ? "PASS" : (match.eligibility?.filter_status || "PASS"),
        filter_reason: manualRestored ? "人工放行" : (match.eligibility?.filter_reason || ""),
        matched_query: job.matched_query || "",
        match: pickMatchPayload(match),
        tailored_resume: match.tailored_resume,
        custom_greeting: match.custom_greeting,
      });
      return sendJson(res, 200, { ok: true, job: refreshed, state: buildStatePayload() });
    }

    const openMatch = pathname.match(/^\/api\/jobs\/(\d+)\/open$/);
    if (req.method === "POST" && openMatch) {
      const job = getJob(Number(openMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req).catch(() => ({}));
      const tracks = getAccountTracks();
      const profileId = body.profileId || job.assigned_profile_id || job.source_profile_id || tracks[0]?.profile_id || "Profile 1";
      const resOpen = await openBossJobPage({
        profileId,
        jobUrl: job.job_url,
        companyName: job.company_name,
        jobTitle: job.job_title,
        onLog: (m) => logEvent(m),
      });
      return sendJson(res, 200, { ok: true, open: resOpen, state: buildStatePayload() });
    }

    const pdfMatch = pathname.match(/^\/api\/jobs\/(\d+)\/pdf$/);
    if (req.method === "POST" && pdfMatch) {
      const job = getJob(Number(pdfMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req).catch(() => ({}));
      const primary = getPrimaryResume(body.trackKey || null);
      const trackKey = primary?.track_key || "A";
      const safeCompany = job.company_name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 32);
      const filename = `resume-${job.id}-${trackKey}-${safeCompany}.pdf`;
      const outputPath = path.join(PDF_DIR, filename);
      const renderUrl = `http://127.0.0.1:${PORT}/resume-print.html?jobId=${job.id}&track=${encodeURIComponent(trackKey)}`;
      const resPdf = await generateResumePdfViaEgo({ renderUrl, outputPath, onLog: (m) => logEvent(m) });
      return sendJson(res, 200, {
        ok: true,
        filename,
        download_url: `/api/pdfs/${encodeURIComponent(filename)}`,
        bytes: resPdf.bytes,
      });
    }

    const pdfGetMatch = pathname.match(/^\/api\/pdfs\/([^/]+)$/);
    if (req.method === "GET" && pdfGetMatch) {
      const file = path.basename(decodeURIComponent(pdfGetMatch[1]));
      const target = path.join(PDF_DIR, file);
      if (!target.startsWith(PDF_DIR) || !fs.existsSync(target)) {
        return sendJson(res, 404, { error: "PDF 文件不存在" });
      }
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tailored-resume.pdf"; filename*=UTF-8''${encodeURIComponent(file)}`,
      });
      fs.createReadStream(target).pipe(res);
      return;
    }

    if (req.method === "PATCH" && jobDetailMatch) {
      const job = getJob(Number(jobDetailMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req);
      let assignedProfile = body.assigned_profile_id;
      if (body.manual_track === "A" || body.manual_track === "B") {
        const trackObj = getAccountTracks().find((t) => t.track_key === body.manual_track);
        assignedProfile = trackObj?.profile_id || null;
      }
      const updated = updateJobRouting(job.id, {
        manual_track: body.manual_track,
        assigned_profile_id: assignedProfile,
        custom_greeting: body.custom_greeting,
        status: body.status,
        notes: body.notes,
        tailored_resume: body.tailored_resume,
      });
      if (body.status && ["DELIVERED", "REPLIED", "INTERVIEW"].includes(body.status)) {
        const hasLog = listDeliveryLogs(300).some((l) => l.job_id === job.id && l.status === "DELIVERED");
        if (!hasLog) {
          const tTrack = getAccountTracks().find((t) => t.profile_id === (updated.assigned_profile_id || job.assigned_profile_id)) || getAccountTracks()[0];
          const imgStatus = updated.tailored_resume?.image_delivery || "NONE";
          addDeliveryLog({
            job_id: job.id,
            company_name: job.company_name,
            job_title: job.job_title,
            track_key: tTrack?.track_key || "A",
            profile_id: updated.assigned_profile_id || tTrack?.profile_id || "Profile 1",
            action: "MANUAL_SYNC",
            greeting_text: updated.custom_greeting || job.custom_greeting || "",
            text_sent: true,
            image_sent: imgStatus === "SENT",
            image_status: imgStatus,
            status: "DELIVERED",
            detail: `手动确认已沟通（状态：${body.status}）`,
          });
        }
      }
      return sendJson(res, 200, { ok: true, job: updated, state: buildStatePayload() });
    }

    if (req.method === "POST" && pathname === "/api/deliveries/sync-boss") {
      const body = await readBody(req).catch(() => ({}));
      const tracks = getAccountTracks();
      const targetProfiles = body.profileId
        ? [body.profileId]
        : [...new Set(tracks.map((t) => t.profile_id).filter(Boolean))];
      const allJobs = listJobs();
      const existingLogs = listDeliveryLogs(400);
      let syncedCount = 0;
      let updatedCount = 0;
      const matchedCompanies = [];

      for (const pid of targetProfiles) {
        const resSync = await syncBossContactedChats({
          profileId: pid,
          maxItems: 60,
          onLog: (m) => logEvent(m),
        });
        if (resSync.status === "VERIFICATION_REQUIRED") {
          return sendJson(res, resSync.taskSpaceId ? 202 : 200, { ...resSync, syncedCount, updatedCount, state: buildStatePayload() });
        }
        const tTrack = tracks.find((t) => t.profile_id === pid) || tracks[0];
        for (const ch of resSync.chats || []) {
          const cRoot = normalizeCompanyRoot(ch.company_name);
          let matchedJobs = ch.external_id
            ? allJobs.filter((j) => j.external_id && j.external_id === ch.external_id)
            : [];
          if (matchedJobs.length === 0) {
            matchedJobs = allJobs.filter((j) => {
              const sameCompany = ch.company_name && (j.company_name === ch.company_name || (cRoot && j.normalized_company && (j.normalized_company === cRoot || j.normalized_company.includes(cRoot) || cRoot.includes(j.normalized_company))));
              if (sameCompany) {
                if (j.source_profile_id && j.source_profile_id !== pid && allJobs.some((x) => x.company_name === j.company_name && x.source_profile_id === pid)) {
                  return false;
                }
                if (!ch.job_title) return true;
                return j.job_title === ch.job_title || j.job_title.includes(ch.job_title) || ch.job_title.includes(j.job_title);
              }
              return ch.raw_text && j.company_name && ch.raw_text.includes(j.company_name);
            });
          }
          for (const mj of matchedJobs) {
            const existingRow = existingLogs.find((l) => l.job_id === mj.id && l.status === "DELIVERED");
            const nextStatus = ch.hr_replied ? "REPLIED" : "DELIVERED";
            const prevMsgs = Array.isArray(mj.chat_messages) ? [...mj.chat_messages] : [];
            const lastText = String(ch.last_msg || "").trim();
            const hasLastInThread = lastText && prevMsgs.some((m) => m.text === lastText);
            const nextMsgs = lastText && !hasLastInThread
              ? [...prevMsgs, { sender: ch.hr_replied ? "HR" : "ME", time: "最新", text: lastText }]
              : prevMsgs;

            const statusChanged = mj.status === "NEW" || mj.status === "PREPARED" || (ch.hr_replied && mj.status === "DELIVERED");
            if (statusChanged || nextMsgs.length !== prevMsgs.length) {
              updateJobRouting(mj.id, {
                assigned_profile_id: pid,
                status: statusChanged ? nextStatus : undefined,
                chat_messages: nextMsgs.length !== prevMsgs.length ? nextMsgs : undefined,
              });
            }
            const detailText = `从 Boss 历史聊天同步：${ch.recruiter_name || "HR"}${ch.hr_replied ? "（HR已回复）" : ""}${lastText ? ` · 最近消息「${lastText.slice(0, 40)}」` : ""}`;
            if (!existingRow) {
              const logRow = addDeliveryLog({
                job_id: mj.id,
                company_name: mj.company_name,
                job_title: mj.job_title,
                track_key: tTrack?.track_key || "A",
                profile_id: pid,
                action: "BOSS_HISTORY_SYNC",
                greeting_text: lastText,
                text_sent: true,
                image_sent: false,
                image_status: mj.tailored_resume?.image_delivery || "NONE",
                status: "DELIVERED",
                detail: detailText,
              });
              existingLogs.unshift(logRow);
              syncedCount++;
              matchedCompanies.push(`${mj.company_name}·${mj.job_title}`);
            } else if (existingRow.greeting_text !== lastText || existingRow.detail !== detailText || statusChanged) {
              updateDeliveryLogSnapshot(existingRow.id, {
                greeting_text: lastText || existingRow.greeting_text,
                detail: detailText,
              });
              updatedCount++;
              matchedCompanies.push(`${mj.company_name}·${mj.job_title}`);
            }
          }
        }
      }
      logEvent(`🔄 同步完成：新增 ${syncedCount} 家、更新 ${updatedCount} 条最新对话/回复状态`);
      return sendJson(res, 200, { ok: true, syncedCount, updatedCount, matchedCompanies: [...new Set(matchedCompanies)], state: buildStatePayload() });
    }

    const chatSyncMatch = pathname.match(/^\/api\/jobs\/(\d+)\/chat\/sync$/);
    if (req.method === "POST" && chatSyncMatch) {
      const job = getJob(Number(chatSyncMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req).catch(() => ({}));
      const tracks = getAccountTracks();
      const settings = getSettings();
      const profileId = body.profileId || job.assigned_profile_id || job.source_profile_id || tracks[0]?.profile_id || "Profile 1";
      const trackKey = tracks.find((t) => t.profile_id === profileId)?.track_key || job.manual_track || settings.primary_resume_track || "A";
      const resume = getResumeByTrack(trackKey) || getPrimaryResume();

      const chatRes = await fetchBossConversationMessages({
        profileId,
        companyName: job.company_name,
        jobTitle: job.job_title,
        externalId: job.external_id,
        onLog: (m) => logEvent(m),
      });
      if (chatRes.status === "VERIFICATION_REQUIRED") {
        return sendJson(res, 202, { ...chatRes, state: buildStatePayload() });
      }
      const messages = chatRes.status === "OK" && chatRes.messages?.length ? chatRes.messages : (job.chat_messages || []);
      const hasHrReply = messages.some((m) => m.sender === "HR");
      const nextStatus = hasHrReply && ["NEW", "PREPARED", "DELIVERED"].includes(job.status) ? "REPLIED" : undefined;
      const updatedJob = updateJobRouting(job.id, {
        assigned_profile_id: profileId,
        status: nextStatus,
        chat_messages: messages,
      });
      const advice = await generateContextualReplies({
        job: updatedJob,
        resume,
        messages,
        customHint: body.customHint || "",
        settings,
      });
      return sendJson(res, 200, {
        ok: true,
        chatStatus: chatRes.status,
        message: chatRes.message || "",
        messages,
        canSendImage: Boolean(chatRes.canSendImage),
        advice,
        state: buildStatePayload(),
      });
    }

    const chatSuggestMatch = pathname.match(/^\/api\/jobs\/(\d+)\/chat\/suggest$/);
    if (req.method === "POST" && chatSuggestMatch) {
      const job = getJob(Number(chatSuggestMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req).catch(() => ({}));
      const tracks = getAccountTracks();
      const settings = getSettings();
      const profileId = body.profileId || job.assigned_profile_id || job.source_profile_id || tracks[0]?.profile_id || "Profile 1";
      const trackKey = tracks.find((t) => t.profile_id === profileId)?.track_key || job.manual_track || settings.primary_resume_track || "A";
      const resume = getResumeByTrack(trackKey) || getPrimaryResume();
      const messages = Array.isArray(body.messages) ? body.messages : (job.chat_messages || []);
      const advice = await generateContextualReplies({
        job,
        resume,
        messages,
        customHint: body.customHint || "",
        settings,
      });
      return sendJson(res, 200, { ok: true, advice });
    }

    const chatSendMatch = pathname.match(/^\/api\/jobs\/(\d+)\/chat\/send$/);
    if (req.method === "POST" && chatSendMatch) {
      const job = getJob(Number(chatSendMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req);
      const replyText = String(body.replyText || "").trim();
      const sendImageResume = Boolean(body.sendImageResume);
      if (!replyText && !sendImageResume) {
        return sendJson(res, 400, { error: "请先输入回复内容或勾选发送图片简历" });
      }
      const tracks = getAccountTracks();
      const settings = getSettings();
      const profileId = body.profileId || job.assigned_profile_id || job.source_profile_id || tracks[0]?.profile_id || "Profile 1";
      const trackKey = tracks.find((t) => t.profile_id === profileId)?.track_key || job.manual_track || settings.primary_resume_track || "A";
      const resumeMeta = getResumeImageMeta();

      const sendRes = await sendBossReplyMessage({
        profileId,
        companyName: job.company_name,
        jobTitle: job.job_title,
        externalId: job.external_id,
        replyText,
        sendImageResume,
        imagePath: resumeMeta.exists ? resumeMeta.filePath : "",
        onLog: (m) => logEvent(m),
      });
      if (sendRes.status === "VERIFICATION_REQUIRED") {
        return sendJson(res, 202, { ...sendRes, state: buildStatePayload() });
      }

      const prevMsgs = Array.isArray(job.chat_messages) ? [...job.chat_messages] : [];
      if (sendRes.textSent && replyText) {
        prevMsgs.push({
          sender: "ME",
          time: new Date().toTimeString().slice(0, 5),
          text: replyText,
        });
      }
      const prevTailored = job.tailored_resume || {};
      const nextImgState = sendRes.imageSent ? "SENT" : (prevTailored.image_delivery || "NONE");
      const updatedJob = updateJobRouting(job.id, {
        assigned_profile_id: profileId,
        status: job.status === "NEW" || job.status === "PREPARED" ? "DELIVERED" : job.status,
        chat_messages: prevMsgs,
        tailored_resume: {
          ...prevTailored,
          image_delivery: nextImgState,
        },
      });

      addDeliveryLog({
        job_id: job.id,
        company_name: job.company_name,
        job_title: job.job_title,
        track_key: trackKey,
        profile_id: profileId,
        action: "FOLLOWUP_REPLY",
        greeting_text: replyText,
        text_sent: Boolean(sendRes.textSent),
        image_sent: Boolean(sendRes.imageSent),
        image_status: nextImgState,
        status: (sendRes.textSent || sendRes.imageSent) ? "DELIVERED" : "PREPARED",
        detail: sendRes.message || "已发送连续跟进回复",
      });

      const resume = getResumeByTrack(trackKey) || getPrimaryResume();
      const advice = analyzeConversationAndSuggestReplies({ job: updatedJob, resume, messages: prevMsgs, settings });
      return sendJson(res, 200, { ok: true, delivery: sendRes, messages: prevMsgs, advice, state: buildStatePayload() });
    }

    const deliverMatch = pathname.match(/^\/api\/jobs\/(\d+)\/deliver$/);
    if (req.method === "POST" && deliverMatch) {
      const job = getJob(Number(deliverMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req);

      const blacklisted = checkBlacklisted(job.company_name);
      if (blacklisted && !body.ignoreBlacklist) {
        return sendJson(res, 403, {
          error: `黑名单拦截：公司「${job.company_name}」在你的避坑黑名单中（${blacklisted.reason}），已阻止投递。`,
        });
      }

      const tracks = getAccountTracks();
      const settings = getSettings();
      const requestedProfile = body.profileId || job.assigned_profile_id || job.source_profile_id;
      const trackObj =
        tracks.find((t) => t.profile_id === requestedProfile) ||
        tracks.find((t) => t.track_key === (body.trackKey || job.manual_track || settings.primary_resume_track || "A")) ||
        tracks[0];
      const profileId = requestedProfile || trackObj?.profile_id || "Profile 1";
      const trackKey = trackObj?.track_key || "A";
      const dailyLimit = trackObj?.daily_limit || 25;
      const profileLabel = trackObj?.profile_name || profileId;

      const breaker = isProfileBreakerActive(profileId);
      if (breaker && !body.overrideBreaker) {
        return sendJson(res, 429, {
          error: `🛡️ 当日防封熔断生效中：${profileLabel} (${profileId}) 今日曾触发验证（${breaker.reason}），今日暂停跳转发送！`,
        });
      }

      const onlySendImage = Boolean(body.onlySendImage);
      const history = getCompanyDeliveryHistory(job.company_name);
      const alreadyThisJob = ["DELIVERED", "REPLIED", "INTERVIEW"].includes(job.status);
      const sameAccountMatch = history.find((h) => h.profile_id === profileId);
      const conflict = history.find((h) => h.profile_id !== profileId);

      if (!onlySendImage && !body.forceRepeat && (alreadyThisJob || sameAccountMatch)) {
        const when = (sameAccountMatch?.created_at || job.updated_at || "").slice(0, 10);
        return sendJson(res, 409, {
          code: "DUPLICATE_GREETING",
          error: `防重复拦截：该岗位/公司「${job.company_name}」此前已由 ${sameAccountMatch?.profile_id || job.assigned_profile_id || profileId} 沟通过（${when || "近期"}），已阻止重复发送！如需补发图片简历请点「补发图片简历」。`,
          duplicate: sameAccountMatch || { job_id: job.id, profile_id: profileId, created_at: job.updated_at },
        });
      }
      if (conflict && !body.forceCrossTrack) {
        return sendJson(res, 409, {
          code: "CROSS_ACCOUNT_CONFLICT",
          error: `防撞车提醒：公司「${job.company_name}」关联主体已于 ${conflict.created_at.slice(0, 10)} 使用 ${conflict.profile_id} 沟通过，请谨慎避免多号重复投递。`,
          conflict,
        });
      }

      const todayCount = countTodayDeliveries(profileId);
      if (!onlySendImage && todayCount >= dailyLimit && !body.ignoreLimit) {
        return sendJson(res, 429, {
          error: `防封号保护：${profileLabel} (${profileId}) 今日已投递 ${todayCount}/${dailyLimit} 次，已达安全上限。`,
        });
      }

      const greetingText = String(body.greetingText ?? job.custom_greeting ?? "").trim();
      const autoSend = body.autoSend !== undefined ? Boolean(body.autoSend) : (settings.deliver_auto_send !== "false");
      const sendImageResume = onlySendImage
        ? true
        : (body.sendImageResume !== undefined ? Boolean(body.sendImageResume) : (settings.deliver_send_image !== "false"));
      const resumeMeta = getResumeImageMeta();

      const deliveryRes = await prepareBossDelivery({
        profileId,
        jobUrl: job.job_url,
        companyName: job.company_name,
        jobTitle: job.job_title,
        greetingText,
        autoSend,
        sendImageResume,
        imagePath: resumeMeta.exists ? resumeMeta.filePath : "",
        onlySendImage,
        allowAlreadyContacted: Boolean(body.forceRepeat),
        onLog: (m) => logEvent(m),
      });

      const isSent = deliveryRes.status === "SENT"
        || deliveryRes.status === "SENT_WITH_IMAGE"
        || deliveryRes.status === "SENT_TEXT_PENDING_IMAGE"
        || deliveryRes.status === "ALREADY_CONTACTED_ON_BOSS";

      const logStatus = isSent
        ? "DELIVERED"
        : deliveryRes.status === "PREPARED_HANDOFF"
          ? "PREPARED"
          : "VERIFICATION";

      const prevTailored = job.tailored_resume || {};
      const nextImageDelivery = deliveryRes.imageSent
        ? "SENT"
        : (deliveryRes.status === "SENT_TEXT_PENDING_IMAGE" || (deliveryRes.status === "ALREADY_CONTACTED_ON_BOSS" && sendImageResume))
          ? "PENDING_REPLY"
          : (prevTailored.image_delivery || "NONE");

      addDeliveryLog({
        job_id: job.id,
        company_name: job.company_name,
        job_title: job.job_title,
        track_key: trackKey,
        profile_id: profileId,
        action: onlySendImage
          ? "SEND_IMAGE_ONLY"
          : deliveryRes.status === "ALREADY_CONTACTED_ON_BOSS"
            ? "BOSS_ALREADY_CONTACTED"
            : autoSend
              ? "AUTO_SEND"
              : "PREFILL_HANDOFF",
        greeting_text: onlySendImage ? "" : greetingText,
        text_sent: Boolean(deliveryRes.textSent),
        image_sent: Boolean(deliveryRes.imageSent),
        image_status: nextImageDelivery,
        status: logStatus,
        detail: deliveryRes.message || "",
      });

      if (deliveryRes.status === "VERIFICATION_REQUIRED") {
        tripProfileBreaker(profileId, "投递沟通时触发安全验证");
        broadcast("verification", deliveryRes);
        return sendJson(res, 202, { ...deliveryRes, state: buildStatePayload() });
      }

      updateJobRouting(job.id, {
        manual_track: trackKey,
        assigned_profile_id: profileId,
        custom_greeting: greetingText || job.custom_greeting,
        status: isSent ? (job.status === "REPLIED" || job.status === "INTERVIEW" ? job.status : "DELIVERED") : "PREPARED",
        tailored_resume: {
          ...prevTailored,
          image_delivery: nextImageDelivery,
          image_blocked_reason: deliveryRes.imageBlockedReason || "",
        },
      });

      return sendJson(res, 200, { ok: true, delivery: deliveryRes, state: buildStatePayload() });
    }

    const spaceFinishMatch = pathname.match(/^\/api\/ego\/spaces\/(\d+)\/finish$/);
    if (req.method === "POST" && spaceFinishMatch) {
      const result = await finishEgoSpace(Number(spaceFinishMatch[1]));
      logEvent(`已关闭 Ego 任务空间 #${result.spaceId}`);
      return sendJson(res, 200, { ok: true, result });
    }

    // 静态资源
    const safePath = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.resolve(PUBLIC_DIR, `.${safePath}`);
    if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return sendJson(res, 404, { error: "Not found" });
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    const code = err.message?.includes("仅允许单任务串行执行") ? 409 : 500;
    logEvent(`错误：${err.message}`, "error");
    sendJson(res, code, { error: err.message || "Internal server error" });
  }
});

// 应用内每日定时自动巡检调度器（每 60 秒检测一次）
setInterval(() => {
  try {
    const settings = getSettings();
    if (settings.daily_check_enabled !== "true") return;
    const today = todayStr();
    if (settings.last_daily_check_date === today) return;
    if (patrolRunning || getActiveLock()) return;
    const targetHHMM = settings.daily_check_time || "09:30";
    const nowLocal = new Date();
    const hhmm = `${String(nowLocal.getHours()).padStart(2, "0")}:${String(nowLocal.getMinutes()).padStart(2, "0")}`;
    if (hhmm >= targetHHMM) {
      logEvent(`触发今日定时巡检（计划时间 ${targetHHMM}）...`);
      runDailyPatrol().catch((err) => logEvent(`自动巡检暂停：${err.message}`, "warn"));
    }
  } catch {}
}, 60_000).unref();

server.requestTimeout = 0;
server.headersTimeout = 0;

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Boss AI Router v${getCurrentVersion()} running at http://127.0.0.1:${PORT}`);
});
