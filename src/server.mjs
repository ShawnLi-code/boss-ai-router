import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PDF_DIR,
  PROJECT_ROOT,
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
  getResumeByTrack,
  getResumes,
  getSettings,
  isProfileBreakerActive,
  listBlacklist,
  listDeliveryLogs,
  listJobs,
  removeBlacklistCompany,
  saveResume,
  saveSettings,
  tripProfileBreaker,
  updateAccountTrack,
  updateJobRouting,
  upsertJob,
} from "./db.mjs";
import { evaluateJobRisk, shouldTriggerWebSearch } from "./scoring.mjs";
import { matchResumeToJob } from "./matcher.mjs";
import { searchCompaniesBatchIntel, searchCompanyBackgroundIntel } from "./websearch.mjs";
import { isLlmConfigured, refineMatchWithLlm } from "./llm.mjs";
import {
  checkGithubUpdate,
  downloadAndPrepareUpdate,
  getCurrentVersion,
  launchUpdateInstaller,
} from "./updater.mjs";
import {
  finishEgoSpace,
  generateResumePdfViaEgo,
  getActiveLock,
  listEgoProfiles,
  prepareBossDelivery,
  scrapeBossJobs,
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
  const effectiveKey = risk.recommended_track === "A轨_真实日期版" ? "A" : "B";
  const assignedProfile =
    risk.zone === "SKIP" || risk.recommended_track === "先探底后定轨"
      ? null
      : trackMap[effectiveKey]?.profile_id || null;

  const resume = getResumeByTrack(effectiveKey);
  let match = matchResumeToJob({ ...rawJob, ...risk }, resume);
  if (useLlm && risk.zone !== "SKIP" && isLlmConfigured(settings)) {
    match = await refineMatchWithLlm({ ...rawJob, ...risk }, resume, match);
  }

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
    match: {
      matched_keywords: match.matched_keywords,
      missing_keywords: match.missing_keywords,
      used_llm: Boolean(match.used_llm),
    },
    tailored_resume: match.tailored_resume,
    custom_greeting: match.custom_greeting,
  });
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
    jobs,
    blacklist: listBlacklist(),
    funnel: getFunnelStats(),
    logs: listDeliveryLogs(80),
    recentEvents: recentLogs,
    activeLock: getActiveLock(),
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) {
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
      const track = getAccountTracks().find((t) => t.track_key === key);
      if (!track) return sendJson(res, 404, { error: "轨道不存在" });
      const result = await syncResumeFromBoss(key, track.profile_id, (m) => logEvent(m));
      if (result.status === "VERIFICATION_REQUIRED") {
        tripProfileBreaker(track.profile_id, "同步简历时触发安全验证");
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
      logEvent(`已保存 ${key} 轨简历母版`);
      return sendJson(res, 200, { ok: true, resume: saved, state: buildStatePayload() });
    }

    if (req.method === "POST" && pathname === "/api/jobs/import") {
      const body = await readBody(req);
      const list = Array.isArray(body) ? body : Array.isArray(body.jobs) ? body.jobs : [body];
      if (body.runWebSearch !== false) {
        const needSearch = list
          .filter((j) => j?.company_name && !checkBlacklisted(j.company_name) && shouldTriggerWebSearch(j).required)
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

      const scrapeRes = await scrapeBossJobs({
        profileId,
        query: body.query || settings.search_query || "AI测试",
        city: body.city || settings.search_city || "101280100",
        maxJobs: body.maxJobs ?? settings.scrape_max_jobs ?? 8,
        minHrActive: body.minHrActive || settings.min_hr_active || "week",
        minDelayMs: body.minDelayMs ?? settings.delay_min_ms ?? 4500,
        maxDelayMs: body.maxDelayMs ?? settings.delay_max_ms ?? 8500,
        onLog: (m) => logEvent(m),
      });

      const scrapedJobs = scrapeRes.jobs || [];
      if (settings.auto_web_search !== "false" && scrapedJobs.length > 0) {
        const needSearch = scrapedJobs
          .filter((j) => j?.company_name && !checkBlacklisted(j.company_name) && shouldTriggerWebSearch(j).required)
          .map((j) => j.company_name);
        if (needSearch.length > 0) {
          await searchCompaniesBatchIntel(needSearch, { profileId, onLog: (m) => logEvent(m) });
        }
      }

      const savedJobs = [];
      for (const raw of scrapedJobs) {
        savedJobs.push(await scoreAndStoreJob({ ...raw, source_profile_id: profileId }, { runWebSearch: false }));
      }

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
      const body = await readBody(req);
      const trackKey = body.trackKey || resolveEffectiveTrackKey(job);
      const resume = getResumeByTrack(trackKey);
      const intel = getCompanyIntel(job.company_name);
      const blacklisted = checkBlacklisted(job.company_name);
      const risk = evaluateJobRisk(job, intel, { blacklisted });
      let match = matchResumeToJob({ ...job, ...risk }, resume);
      if (body.useLlm !== false && isLlmConfigured()) {
        match = await refineMatchWithLlm({ ...job, ...risk }, resume, match);
      }
      const trackObj = getAccountTracks().find((t) => t.track_key === trackKey);
      const refreshed = upsertJob({
        ...job,
        manual_track: body.trackKey || job.manual_track,
        assigned_profile_id: trackObj?.profile_id || job.assigned_profile_id,
        risk_score: risk.risk_score,
        zone: risk.zone,
        recommended_track: risk.recommended_track,
        evidence: risk.evidence,
        match_score: match.match_score,
        match: {
          matched_keywords: match.matched_keywords,
          missing_keywords: match.missing_keywords,
          used_llm: Boolean(match.used_llm),
        },
        tailored_resume: match.tailored_resume,
        custom_greeting: match.custom_greeting,
      });
      return sendJson(res, 200, { ok: true, job: refreshed, state: buildStatePayload() });
    }

    const pdfMatch = pathname.match(/^\/api\/jobs\/(\d+)\/pdf$/);
    if (req.method === "POST" && pdfMatch) {
      const job = getJob(Number(pdfMatch[1]));
      if (!job) return sendJson(res, 404, { error: "岗位不存在" });
      const body = await readBody(req);
      const trackKey = body.trackKey || resolveEffectiveTrackKey(job);
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
      return sendJson(res, 200, { ok: true, job: updated, state: buildStatePayload() });
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

      const trackKey = body.trackKey || job.manual_track || (job.recommended_track === "A轨_真实日期版" ? "A" : job.recommended_track === "B轨_绿区池" ? "B" : null);
      if (!trackKey) {
        return sendJson(res, 400, {
          error: "该岗位处于 YELLOW（先探底后定轨），请先在操作台手动指定使用 A轨 或 B轨 账号后再投递。",
        });
      }

      const trackObj = getAccountTracks().find((t) => t.track_key === trackKey);
      if (!trackObj) return sendJson(res, 400, { error: "未找到对应轨道账号配置" });

      const breaker = isProfileBreakerActive(trackObj.profile_id);
      if (breaker && !body.overrideBreaker) {
        return sendJson(res, 429, {
          error: `🛡️ 当日防封熔断生效中：${trackObj.profile_name} (${trackObj.profile_id}) 今日曾触发验证（${breaker.reason}），今日暂停投递！`,
        });
      }

      const history = getCompanyDeliveryHistory(job.company_name);
      const conflict = history.find((h) => h.track_key !== trackKey);
      if (conflict && !body.forceCrossTrack) {
        return sendJson(res, 409, {
          error: `防撞车拦截：公司「${job.company_name}」关联主体已于 ${conflict.created_at.slice(0, 10)} 使用 ${conflict.track_key}轨(${conflict.profile_id}) 投递过，严禁再用 ${trackKey}轨 重复投递！`,
          conflict,
        });
      }

      const todayCount = countTodayDeliveries(trackObj.profile_id);
      if (todayCount >= trackObj.daily_limit && !body.ignoreLimit) {
        return sendJson(res, 429, {
          error: `防封号保护：${trackObj.profile_name} (${trackObj.profile_id}) 今日已投递 ${todayCount}/${trackObj.daily_limit} 次，已达安全上限。`,
        });
      }

      const greetingText = String(body.greetingText || job.custom_greeting || "").trim();
      const deliveryRes = await prepareBossDelivery({
        profileId: trackObj.profile_id,
        jobUrl: job.job_url,
        companyName: job.company_name,
        jobTitle: job.job_title,
        greetingText,
        autoSend: Boolean(body.autoSend),
        onLog: (m) => logEvent(m),
      });

      const logStatus =
        deliveryRes.status === "SENT"
          ? "DELIVERED"
          : deliveryRes.status === "PREPARED_HANDOFF"
            ? "PREPARED"
            : "VERIFICATION";

      addDeliveryLog({
        job_id: job.id,
        company_name: job.company_name,
        track_key: trackKey,
        profile_id: trackObj.profile_id,
        action: body.autoSend ? "AUTO_SEND" : "PREFILL_HANDOFF",
        greeting_text: greetingText,
        status: logStatus,
        detail: deliveryRes.message || "",
      });

      if (deliveryRes.status === "VERIFICATION_REQUIRED") {
        tripProfileBreaker(trackObj.profile_id, "投递沟通时触发安全验证");
        broadcast("verification", deliveryRes);
        return sendJson(res, 202, { ...deliveryRes, state: buildStatePayload() });
      }

      updateJobRouting(job.id, {
        manual_track: trackKey,
        assigned_profile_id: trackObj.profile_id,
        custom_greeting: greetingText,
        status: deliveryRes.status === "SENT" ? "DELIVERED" : "PREPARED",
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Boss AI Router v${getCurrentVersion()} running at http://127.0.0.1:${PORT}`);
});
