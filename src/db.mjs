import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = process.env.BOSS_ROUTER_DATA_DIR
  ? path.resolve(process.env.BOSS_ROUTER_DATA_DIR)
  : path.join(PROJECT_ROOT, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "router.db");
export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS account_tracks (
    track_key TEXT PRIMARY KEY,
    track_label TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    resume_strategy TEXT NOT NULL,
    daily_limit INTEGER NOT NULL DEFAULT 25,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resumes (
    track_key TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'manual',
    candidate_name TEXT NOT NULL DEFAULT '',
    years_label TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    skills_json TEXT NOT NULL DEFAULT '[]',
    experiences_json TEXT NOT NULL DEFAULT '[]',
    projects_json TEXT NOT NULL DEFAULT '[]',
    education_json TEXT NOT NULL DEFAULT '[]',
    raw_text TEXT NOT NULL DEFAULT '',
    synced_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_intel (
    company_name TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    search_status TEXT NOT NULL,
    hit_background_check INTEGER NOT NULL DEFAULT 0,
    matched_vendors_json TEXT NOT NULL DEFAULT '[]',
    matched_signals_json TEXT NOT NULL DEFAULT '[]',
    snippets_json TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL DEFAULT '',
    searched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE,
    job_title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    scale TEXT NOT NULL DEFAULT '',
    financing TEXT NOT NULL DEFAULT '',
    industry TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    recruiter_title TEXT NOT NULL DEFAULT '',
    recruiter_name TEXT NOT NULL DEFAULT '',
    salary_range TEXT NOT NULL DEFAULT '',
    experience_req TEXT NOT NULL DEFAULT '',
    education_req TEXT NOT NULL DEFAULT '',
    jd_text TEXT NOT NULL DEFAULT '',
    job_url TEXT NOT NULL DEFAULT '',
    source_profile_id TEXT NOT NULL DEFAULT '',
    parsed_json TEXT NOT NULL DEFAULT '{}',
    risk_score INTEGER NOT NULL DEFAULT 10,
    zone TEXT NOT NULL DEFAULT 'GREEN',
    recommended_track TEXT NOT NULL DEFAULT 'B轨_绿区池',
    manual_track TEXT,
    assigned_profile_id TEXT,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    intel_summary TEXT NOT NULL DEFAULT '',
    match_score INTEGER NOT NULL DEFAULT 0,
    match_json TEXT NOT NULL DEFAULT '{}',
    tailored_resume_json TEXT NOT NULL DEFAULT '{}',
    custom_greeting TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'NEW',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS delivery_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    track_key TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    action TEXT NOT NULL,
    greeting_text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`);

const now = () => new Date().toISOString();

function seedDefaults() {
  const existingTracks = db.prepare("SELECT COUNT(*) AS cnt FROM account_tracks").get().cnt;
  if (existingTracks === 0) {
    const insertTrack = db.prepare(`
      INSERT INTO account_tracks (track_key, track_label, profile_id, profile_name, resume_strategy, daily_limit, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertTrack.run("A", "A轨_真实日期版", "Profile 2", "账号A (真实版)", "真实时间线与经历，用于高风控/大厂/国企/金融/严背调岗位", 25, now());
    insertTrack.run("B", "B轨_绿区池", "Profile 1", "账号B (绿区池)", "精简/调整经历版本，用于低背调风险的民企/中小厂/技术直招绿区池", 25, now());
  }

  const existingResumes = db.prepare("SELECT COUNT(*) AS cnt FROM resumes").get().cnt;
  if (existingResumes === 0) {
    const insertResume = db.prepare(`
      INSERT INTO resumes (track_key, source, candidate_name, years_label, summary, skills_json, experiences_json, projects_json, education_json, raw_text, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertResume.run(
      "A",
      "template",
      "A轨候选人",
      "真实日期版",
      "请点击“从 Ego 同步 Boss 简历”读取 A 轨账号线上简历，或在此手动补充你的真实项目与技能素材。",
      JSON.stringify(["Python", "Pytest", "Playwright", "LLM评测", "RAG测试", "Agent自动化", "接口自动化", "CI/CD"]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      "",
      now()
    );
    insertResume.run(
      "B",
      "template",
      "B轨候选人",
      "绿区池版本",
      "请点击“从 Ego 同步 Boss 简历”读取 B 轨账号线上简历，或在此手动补充对应版本的项目与技能素材。",
      JSON.stringify(["Python", "Pytest", "Playwright", "大模型评测", "Prompt测试", "RAG效果评估", "接口测试", "JMeter"]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      "",
      now()
    );
  }

  const defaultSettings = {
    search_query: "AI测试",
    search_city: "101280100",
    search_city_name: "广州",
    scrape_max_jobs: "10",
    delay_min_ms: "4500",
    delay_max_ms: "8500",
    auto_web_search: "true",
    llm_base_url: "",
    llm_model: "",
    llm_api_key: "",
  };
  const upsertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)
  `);
  for (const [k, v] of Object.entries(defaultSettings)) {
    upsertSetting.run(k, v, now());
  }
}

seedDefaults();

export function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export function saveSettings(partial) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const ts = now();
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined && v !== null) {
      stmt.run(k, String(v), ts);
    }
  }
  return getSettings();
}

export function getAccountTracks() {
  return db.prepare("SELECT * FROM account_tracks ORDER BY track_key ASC").all();
}

export function updateAccountTrack(trackKey, data) {
  db.prepare(`
    UPDATE account_tracks
    SET profile_id = COALESCE(?, profile_id),
        profile_name = COALESCE(?, profile_name),
        daily_limit = COALESCE(?, daily_limit),
        resume_strategy = COALESCE(?, resume_strategy),
        updated_at = ?
    WHERE track_key = ?
  `).run(
    data.profile_id ?? null,
    data.profile_name ?? null,
    data.daily_limit ?? null,
    data.resume_strategy ?? null,
    now(),
    trackKey
  );
  return getAccountTracks();
}

export function getResumes() {
  const rows = db.prepare("SELECT * FROM resumes ORDER BY track_key ASC").all();
  return rows.map((r) => ({
    ...r,
    skills: safeJson(r.skills_json, []),
    experiences: safeJson(r.experiences_json, []),
    projects: safeJson(r.projects_json, []),
    education: safeJson(r.education_json, []),
  }));
}

export function getResumeByTrack(trackKey) {
  const r = db.prepare("SELECT * FROM resumes WHERE track_key = ?").get(trackKey);
  if (!r) return null;
  return {
    ...r,
    skills: safeJson(r.skills_json, []),
    experiences: safeJson(r.experiences_json, []),
    projects: safeJson(r.projects_json, []),
    education: safeJson(r.education_json, []),
  };
}

export function saveResume(trackKey, payload) {
  const ts = now();
  db.prepare(`
    INSERT INTO resumes (track_key, source, candidate_name, years_label, summary, skills_json, experiences_json, projects_json, education_json, raw_text, synced_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(track_key) DO UPDATE SET
      source = excluded.source,
      candidate_name = excluded.candidate_name,
      years_label = excluded.years_label,
      summary = excluded.summary,
      skills_json = excluded.skills_json,
      experiences_json = excluded.experiences_json,
      projects_json = excluded.projects_json,
      education_json = excluded.education_json,
      raw_text = excluded.raw_text,
      synced_at = COALESCE(excluded.synced_at, resumes.synced_at),
      updated_at = excluded.updated_at
  `).run(
    trackKey,
    payload.source ?? "manual",
    payload.candidate_name ?? "",
    payload.years_label ?? "",
    payload.summary ?? "",
    JSON.stringify(payload.skills ?? []),
    JSON.stringify(payload.experiences ?? []),
    JSON.stringify(payload.projects ?? []),
    JSON.stringify(payload.education ?? []),
    payload.raw_text ?? "",
    payload.synced_at ?? null,
    ts
  );
  return getResumeByTrack(trackKey);
}

export function getCompanyIntel(companyName) {
  const row = db.prepare("SELECT * FROM company_intel WHERE company_name = ?").get(companyName);
  if (!row) return null;
  return {
    ...row,
    hit_background_check: Boolean(row.hit_background_check),
    matched_vendors: safeJson(row.matched_vendors_json, []),
    matched_signals: safeJson(row.matched_signals_json, []),
    snippets: safeJson(row.snippets_json, []),
  };
}

export function saveCompanyIntel(intel) {
  const ts = now();
  db.prepare(`
    INSERT INTO company_intel (company_name, query, search_status, hit_background_check, matched_vendors_json, matched_signals_json, snippets_json, summary, searched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_name) DO UPDATE SET
      query = excluded.query,
      search_status = excluded.search_status,
      hit_background_check = excluded.hit_background_check,
      matched_vendors_json = excluded.matched_vendors_json,
      matched_signals_json = excluded.matched_signals_json,
      snippets_json = excluded.snippets_json,
      summary = excluded.summary,
      searched_at = excluded.searched_at
  `).run(
    intel.company_name,
    intel.query,
    intel.search_status,
    intel.hit_background_check ? 1 : 0,
    JSON.stringify(intel.matched_vendors ?? []),
    JSON.stringify(intel.matched_signals ?? []),
    JSON.stringify(intel.snippets ?? []),
    intel.summary ?? "",
    ts
  );
  return getCompanyIntel(intel.company_name);
}

export function listJobs() {
  const rows = db.prepare("SELECT * FROM jobs ORDER BY id DESC").all();
  return rows.map(hydrateJob);
}

export function getJob(id) {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  return row ? hydrateJob(row) : null;
}

export function upsertJob(job) {
  const ts = now();
  const externalId = job.external_id || `${job.company_name}::${job.job_title}::${job.salary_range || ""}`;
  const existing = job.id
    ? db.prepare("SELECT id FROM jobs WHERE id = ?").get(job.id)
    : db.prepare("SELECT id FROM jobs WHERE external_id = ?").get(externalId);
  if (existing) {
    db.prepare(`
      UPDATE jobs SET
        scale = ?, financing = ?, industry = ?, city = ?, recruiter_title = ?, recruiter_name = ?,
        salary_range = ?, experience_req = ?, education_req = ?, jd_text = ?, job_url = ?,
        parsed_json = ?, risk_score = ?, zone = ?, recommended_track = ?,
        assigned_profile_id = COALESCE(assigned_profile_id, ?),
        evidence_json = ?, intel_summary = ?, match_score = ?, match_json = ?,
        tailored_resume_json = ?, custom_greeting = ?, updated_at = ?
      WHERE id = ?
    `).run(
      job.scale ?? "",
      job.financing ?? "",
      job.industry ?? "",
      job.city ?? "",
      job.recruiter_title ?? "",
      job.recruiter_name ?? "",
      job.salary_range ?? "",
      job.experience_req ?? "",
      job.education_req ?? "",
      job.jd_text ?? "",
      job.job_url ?? "",
      JSON.stringify(job.parsed ?? {}),
      job.risk_score ?? 10,
      job.zone ?? "GREEN",
      job.recommended_track ?? "B轨_绿区池",
      job.assigned_profile_id ?? null,
      JSON.stringify(job.evidence ?? []),
      job.intel_summary ?? "",
      job.match_score ?? 0,
      JSON.stringify(job.match ?? {}),
      JSON.stringify(job.tailored_resume ?? {}),
      job.custom_greeting ?? "",
      ts,
      existing.id
    );
    return getJob(existing.id);
  }

  const info = db.prepare(`
    INSERT INTO jobs (
      external_id, job_title, company_name, scale, financing, industry, city,
      recruiter_title, recruiter_name, salary_range, experience_req, education_req,
      jd_text, job_url, source_profile_id, parsed_json, risk_score, zone,
      recommended_track, manual_track, assigned_profile_id, evidence_json,
      intel_summary, match_score, match_json, tailored_resume_json,
      custom_greeting, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    externalId,
    job.job_title ?? "AI测试工程师",
    job.company_name ?? "",
    job.scale ?? "",
    job.financing ?? "",
    job.industry ?? "",
    job.city ?? "",
    job.recruiter_title ?? "",
    job.recruiter_name ?? "",
    job.salary_range ?? "",
    job.experience_req ?? "",
    job.education_req ?? "",
    job.jd_text ?? "",
    job.job_url ?? "",
    job.source_profile_id ?? "",
    JSON.stringify(job.parsed ?? {}),
    job.risk_score ?? 10,
    job.zone ?? "GREEN",
    job.recommended_track ?? "B轨_绿区池",
    job.manual_track ?? null,
    job.assigned_profile_id ?? null,
    JSON.stringify(job.evidence ?? []),
    job.intel_summary ?? "",
    job.match_score ?? 0,
    JSON.stringify(job.match ?? {}),
    JSON.stringify(job.tailored_resume ?? {}),
    job.custom_greeting ?? "",
    job.status ?? "NEW",
    job.notes ?? "",
    ts,
    ts
  );
  return getJob(info.lastInsertRowid);
}

export function updateJobRouting(id, patch) {
  const ts = now();
  db.prepare(`
    UPDATE jobs SET
      manual_track = COALESCE(?, manual_track),
      assigned_profile_id = COALESCE(?, assigned_profile_id),
      custom_greeting = COALESCE(?, custom_greeting),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      tailored_resume_json = COALESCE(?, tailored_resume_json),
      updated_at = ?
    WHERE id = ?
  `).run(
    patch.manual_track ?? null,
    patch.assigned_profile_id ?? null,
    patch.custom_greeting ?? null,
    patch.status ?? null,
    patch.notes ?? null,
    patch.tailored_resume ? JSON.stringify(patch.tailored_resume) : null,
    ts,
    id
  );
  return getJob(id);
}

export function getCompanyDeliveryHistory(companyName) {
  return db.prepare(`
    SELECT * FROM delivery_logs
    WHERE company_name = ? AND status IN ('DELIVERED', 'PREPARED')
    ORDER BY id DESC
  `).all(companyName);
}

export function listDeliveryLogs(limit = 100) {
  return db.prepare("SELECT * FROM delivery_logs ORDER BY id DESC LIMIT ?").all(limit);
}

export function countTodayDeliveries(profileId) {
  const todayPrefix = new Date().toISOString().slice(0, 10);
  return db.prepare(`
    SELECT COUNT(*) AS cnt FROM delivery_logs
    WHERE profile_id = ? AND status = 'DELIVERED' AND created_at LIKE ?
  `).get(profileId, `${todayPrefix}%`).cnt;
}

export function addDeliveryLog(entry) {
  const ts = now();
  const info = db.prepare(`
    INSERT INTO delivery_logs (job_id, company_name, track_key, profile_id, action, greeting_text, status, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.job_id,
    entry.company_name,
    entry.track_key,
    entry.profile_id,
    entry.action,
    entry.greeting_text ?? "",
    entry.status,
    entry.detail ?? "",
    ts
  );
  return db.prepare("SELECT * FROM delivery_logs WHERE id = ?").get(info.lastInsertRowid);
}

function hydrateJob(row) {
  return {
    ...row,
    parsed: safeJson(row.parsed_json, {}),
    evidence: safeJson(row.evidence_json, []),
    match: safeJson(row.match_json, {}),
    tailored_resume: safeJson(row.tailored_resume_json, {}),
  };
}

function safeJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}
