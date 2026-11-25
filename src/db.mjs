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

export const PDF_DIR = path.join(DATA_DIR, "pdfs");
fs.mkdirSync(PDF_DIR, { recursive: true });

export const RESUME_ASSETS_DIR = path.join(DATA_DIR, "resume-assets");
fs.mkdirSync(RESUME_ASSETS_DIR, { recursive: true });

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
    breaker_date TEXT DEFAULT '',
    breaker_reason TEXT DEFAULT '',
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
    registered_name TEXT NOT NULL DEFAULT '',
    credit_json TEXT NOT NULL DEFAULT '{}',
    reputation_json TEXT NOT NULL DEFAULT '{}',
    summary TEXT NOT NULL DEFAULT '',
    searched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blacklist_companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    normalized_root TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL DEFAULT '手动拉黑',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE,
    job_title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    normalized_company TEXT NOT NULL DEFAULT '',
    scale TEXT NOT NULL DEFAULT '',
    financing TEXT NOT NULL DEFAULT '',
    industry TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    recruiter_title TEXT NOT NULL DEFAULT '',
    recruiter_name TEXT NOT NULL DEFAULT '',
    recruiter_active TEXT NOT NULL DEFAULT '',
    salary_range TEXT NOT NULL DEFAULT '',
    experience_req TEXT NOT NULL DEFAULT '',
    education_req TEXT NOT NULL DEFAULT '',
    jd_text TEXT NOT NULL DEFAULT '',
    company_intro TEXT NOT NULL DEFAULT '',
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
    matched_query TEXT NOT NULL DEFAULT '',
    apply_advice TEXT NOT NULL DEFAULT 'REVISE_FIRST',
    filter_status TEXT NOT NULL DEFAULT 'PASS',
    filter_reason TEXT NOT NULL DEFAULT '',
    work_address TEXT NOT NULL DEFAULT '',
    area_district TEXT NOT NULL DEFAULT '',
    longitude REAL,
    latitude REAL,
    customer_brand TEXT NOT NULL DEFAULT '',
    commute_json TEXT NOT NULL DEFAULT '{}',
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
    normalized_company TEXT NOT NULL DEFAULT '',
    track_key TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    action TEXT NOT NULL,
    greeting_text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS patrol_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'PATROL',
    profiles_json TEXT NOT NULL DEFAULT '[]',
    keywords_json TEXT NOT NULL DEFAULT '[]',
    planned_quota INTEGER NOT NULL DEFAULT 0,
    scanned_count INTEGER NOT NULL DEFAULT 0,
    new_count INTEGER NOT NULL DEFAULT 0,
    kept_count INTEGER NOT NULL DEFAULT 0,
    filtered_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OK',
    summary TEXT NOT NULL DEFAULT '',
    details_json TEXT NOT NULL DEFAULT '[]',
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL
  );
`);

// Schema migration for existing local router.db databases
function ensureColumn(table, col, defSql) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${defSql};`);
  }
}

ensureColumn("account_tracks", "breaker_date", "TEXT DEFAULT ''");
ensureColumn("account_tracks", "breaker_reason", "TEXT DEFAULT ''");
ensureColumn("jobs", "normalized_company", "TEXT NOT NULL DEFAULT ''");
ensureColumn("jobs", "recruiter_active", "TEXT NOT NULL DEFAULT ''");
ensureColumn("jobs", "company_intro", "TEXT NOT NULL DEFAULT ''");
ensureColumn("jobs", "matched_query", "TEXT NOT NULL DEFAULT ''");
ensureColumn("jobs", "apply_advice", "TEXT NOT NULL DEFAULT 'REVISE_FIRST'");
ensureColumn("company_intel", "registered_name", "TEXT NOT NULL DEFAULT ''");
ensureColumn("company_intel", "credit_json", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("company_intel", "reputation_json", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("jobs", "filter_status", "TEXT NOT NULL DEFAULT 'PASS'");
ensureColumn("jobs", "filter_reason", "TEXT NOT NULL DEFAULT ''");
ensureColumn("jobs", "work_address", "TEXT NOT NULL DEFAULT ''");
ensureColumn("jobs", "area_district", "TEXT NOT NULL DEFAULT ''");
ensureColumn("jobs", "longitude", "REAL");
ensureColumn("jobs", "latitude", "REAL");
ensureColumn("jobs", "customer_brand", "TEXT NOT NULL DEFAULT ''");
ensureColumn("jobs", "commute_json", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("jobs", "chat_messages_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("jobs", "boss_unread_count", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("jobs", "boss_stage", "TEXT NOT NULL DEFAULT ''");
ensureColumn("delivery_logs", "normalized_company", "TEXT NOT NULL DEFAULT ''");
ensureColumn("delivery_logs", "job_title", "TEXT NOT NULL DEFAULT ''");
ensureColumn("delivery_logs", "text_sent", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("delivery_logs", "image_sent", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("delivery_logs", "image_status", "TEXT NOT NULL DEFAULT 'NONE'");

const now = () => new Date().toISOString();
export const todayStr = () => new Date().toISOString().slice(0, 10);

export function normalizeCompanyRoot(name = "") {
  let s = String(name || "").trim();
  s = s.replace(/[（(][^）)]*[）)]/g, "");
  s = s.replace(/(?:北京|上海|广州|深圳|杭州|成都|南京|武汉|西安|苏州|长沙|厦门)?(?:分公司|分部|办事处)$/g, "");
  s = s.replace(/(?:股份有限公司|有限责任公司|科技有限公司|信息技术|有限公司|科技公司|科技|集团|子公司|控股|技术|信息|网络|软件|智能|电子|数字|数据)/g, "");
  s = s.replace(/(?:公司|北京|上海|广州|深圳|杭州|成都|南京|武汉|西安|苏州)$/g, "");
  s = s.replace(/[\s·.\-_]/g, "").toLowerCase();
  return s || String(name || "").trim().toLowerCase();
}

// Backfill normalized_company on existing rows cleanly
db.prepare("SELECT id, company_name FROM jobs WHERE normalized_company = ''").all().forEach((r) => {
  db.prepare("UPDATE jobs SET normalized_company = ? WHERE id = ?").run(normalizeCompanyRoot(r.company_name), r.id);
});
db.prepare("SELECT id, company_name FROM delivery_logs WHERE normalized_company = ''").all().forEach((r) => {
  db.prepare("UPDATE delivery_logs SET normalized_company = ? WHERE id = ?").run(normalizeCompanyRoot(r.company_name), r.id);
});
db.exec(`
  UPDATE delivery_logs
  SET job_title = COALESCE((SELECT j.job_title FROM jobs j WHERE j.id = delivery_logs.job_id), '')
  WHERE job_title = '';
  UPDATE delivery_logs
  SET text_sent = 1
  WHERE status = 'DELIVERED' AND text_sent = 0 AND action != 'SEND_IMAGE_ONLY';
`);

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

  const defaultFollowupPrompt = [
    "你正在帮求职者在 Boss 直聘上回复 HR 或技术面试官。请严格遵守以下原则：",
    "1. 说人话、像真人在微信/Boss上打字聊天：语气自然平和、口语化、每条 35～95 字；严禁书面总结腔和套话（不要写“独立负责…落地”“统筹…生态”“闭环赋能”“三言两语聊不细”等 AI 味表达），禁止使用 • 列表符号或省略号截断。",
    "2. 严格基于候选人【真实简历】回复，严禁硬往不相关的经历上靠：",
    "   - 对方问到的方向如果简历里有真实做过，挑最贴合的 1 件事/工具用大白话讲清楚具体做了啥、做了多久，不夸大年限或职责；",
    "   - 如果对方问的技术栈在简历里很少或没写（例如问 UI 自动化多久，但简历主做接口/AI 应用测试），必须坦诚说自己这块做得少、平时主要做哪块，再顺带提一句思路相通可快速补齐，并反问岗位日常工作占比，绝对不能硬吹“这块实战很多”。",
    "3. 看懂对话上下文：如果最后一条已经是求职者自己发出的回复或图片简历，不要再重复回答上一个问题，改为提醒先等对方看消息，仅提供 3 条轻量跟进或确认岗位细节的备选。",
    "4. 输出 3 套不同角度的回复：方案1 直奔主题对标真实经历；方案2 补充细节或反问确认岗位实际情况；方案3 简短口语版（30～55字）。",
  ].join("\n");

  const defaultSettings = {
    search_query: "AI测试",
    search_city: "101280100",
    search_city_name: "广州",
    scrape_max_jobs: "5",
    min_hr_active: "week",
    delay_min_ms: "4500",
    delay_max_ms: "8500",
    auto_web_search: "true",
    auto_check_update: "true",
    github_repo: "ShawnLi-code/boss-ai-router",
    llm_base_url: "https://api.commandcode.ai/provider/v1",
    llm_model: "deepseek/deepseek-v4.1-flash-fast",
    llm_api_key: "",
    followup_reply_prompt: defaultFollowupPrompt,
    primary_resume_track: "A",
    scan_mode: "both",
    filter_exclude_intern: "true",
    filter_exclude_non_qa: "true",
    filter_exclude_remote: "true",
    boss_native_filter: "true",
    boss_salary_filter: "",
    filter_min_salary_k: "7",
    target_salary_min_k: "9",
    target_salary_max_k: "12",
    filter_exp_mode: "prefer_1_3_allow_3_5",
    home_address: "",
    home_city: "广州",
    deliver_auto_send: "true",
    deliver_send_image: "true",
    daily_check_enabled: "true",
    daily_check_time: "09:30",
    last_daily_check_date: "",
    last_daily_check_summary: "",
    watchlist_keywords: JSON.stringify([
      "AI应用测试",
      "AI测试",
      "软件测试",
      "测试工程师",
      "AI评测",
      "大模型测试工程师",
      "模型评测工程师",
      "AI训练师",
      "提示词工程师",
    ]),
  };
  const upsertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)
  `);
  for (const [k, v] of Object.entries(defaultSettings)) {
    upsertSetting.run(k, v, now());
  }

  // 若旧库此前未配过模型接口（三项均为空），自动预填 Command Code GOAT + DeepSeek V4.1 Flash Fast
  const llmRows = db.prepare("SELECT key, value FROM settings WHERE key IN ('llm_base_url', 'llm_model', 'llm_api_key', 'followup_reply_prompt')").all();
  const llmMap = Object.fromEntries(llmRows.map((r) => [r.key, r.value]));
  if (!llmMap.llm_base_url && !llmMap.llm_model && !llmMap.llm_api_key) {
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'llm_base_url'").run(defaultSettings.llm_base_url, now());
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'llm_model'").run(defaultSettings.llm_model, now());
  }
  if (!llmMap.followup_reply_prompt) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('followup_reply_prompt', ?, ?)").run(defaultFollowupPrompt, now());
  }
}

export const DEFAULT_FOLLOWUP_PROMPT = [
  "你正在帮求职者在 Boss 直聘上回复 HR 或技术面试官。请严格遵守以下原则：",
  "1. 说人话、像真人在微信/Boss上打字聊天：语气自然平和、口语化、每条 35～95 字；严禁书面总结腔和套话（不要写“独立负责…落地”“统筹…生态”“闭环赋能”“三言两语聊不细”等 AI 味表达），禁止使用 • 列表符号或省略号截断。",
  "2. 严格基于候选人【真实简历】回复，严禁硬往不相关的经历上靠：",
  "   - 对方问到的方向如果简历里有真实做过，挑最贴合的 1 件事/工具用大白话讲清楚具体做了啥、做了多久，不夸大年限或职责；",
  "   - 如果对方问的技术栈在简历里很少或没写（例如问 UI 自动化多久，但简历主做接口/AI 应用测试），必须坦诚说自己这块做得少、平时主要做哪块，再顺带提一句思路相通可快速补齐，并反问岗位日常工作占比，绝对不能硬吹“这块实战很多”。",
  "3. 看懂对话上下文：如果最后一条已经是求职者自己发出的回复或图片简历，不要再重复回答上一个问题，改为提醒先等对方看消息，仅提供 3 条轻量跟进或确认岗位细节的备选。",
  "4. 输出 3 套不同角度的回复：方案1 直奔主题对标真实经历；方案2 补充细节或反问确认岗位实际情况；方案3 简短口语版（30～55字）。",
].join("\n");

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
  const today = todayStr();
  return db.prepare("SELECT * FROM account_tracks ORDER BY track_key ASC").all().map((t) => ({
    ...t,
    breaker_active: t.breaker_date === today,
  }));
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

export function tripProfileBreaker(profileId, reason = "触发安全验证") {
  db.prepare(`
    UPDATE account_tracks
    SET breaker_date = ?, breaker_reason = ?, updated_at = ?
    WHERE profile_id = ?
  `).run(todayStr(), reason, now(), profileId);
  return getAccountTracks();
}

export function clearTrackBreaker(trackKey) {
  db.prepare(`
    UPDATE account_tracks
    SET breaker_date = '', breaker_reason = '', updated_at = ?
    WHERE track_key = ?
  `).run(now(), trackKey);
  return getAccountTracks();
}

export function isProfileBreakerActive(profileId) {
  const row = db.prepare("SELECT breaker_date, breaker_reason FROM account_tracks WHERE profile_id = ?").get(profileId);
  if (!row) return null;
  if (row.breaker_date === todayStr()) {
    return { active: true, reason: row.breaker_reason || "今日曾触发安全验证" };
  }
  return null;
}

export function listBlacklist() {
  return db.prepare("SELECT * FROM blacklist_companies ORDER BY id DESC").all();
}

export function addBlacklistCompanies(names = [], reason = "手动拉黑") {
  const stmt = db.prepare(`
    INSERT INTO blacklist_companies (company_name, normalized_root, reason, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(normalized_root) DO UPDATE SET reason = excluded.reason
  `);
  const ts = now();
  let added = 0;
  for (const raw of names) {
    const clean = String(raw || "").trim();
    if (!clean) continue;
    const root = normalizeCompanyRoot(clean);
    if (!root) continue;
    stmt.run(clean, root, reason, ts);
    added++;
  }
  return { added, items: listBlacklist() };
}

export function removeBlacklistCompany(id) {
  db.prepare("DELETE FROM blacklist_companies WHERE id = ?").run(id);
  return listBlacklist();
}

export function checkBlacklisted(companyName) {
  const root = normalizeCompanyRoot(companyName);
  if (!root) return null;
  const rows = db.prepare("SELECT * FROM blacklist_companies").all();
  return rows.find((r) => r.normalized_root === root || root.includes(r.normalized_root) || r.normalized_root.includes(root)) || null;
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

export function getPrimaryResume(preferredTrack = null) {
  const settings = getSettings();
  const key = preferredTrack || settings.primary_resume_track || "A";
  const primary = getResumeByTrack(key);
  if (primary && ((primary.experiences?.length || 0) > 0 || (primary.summary || "").length > 30)) {
    return primary;
  }
  const all = getResumes();
  return all.find((r) => /2年/.test(r.years_label || "")) || primary || all[0] || null;
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

export function getResumeImageMeta() {
  const metaPath = path.join(RESUME_ASSETS_DIR, "meta.json");
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch {}
  }
  const imgName = meta.image_file || "resume-image.png";
  const imgPath = path.join(RESUME_ASSETS_DIR, path.basename(imgName));
  if (!fs.existsSync(imgPath)) {
    return { exists: false };
  }
  const stat = fs.statSync(imgPath);
  const pdfPath = path.join(RESUME_ASSETS_DIR, "resume-source.pdf");
  const hasPdf = fs.existsSync(pdfPath);
  return {
    exists: true,
    filename: meta.source_name || path.basename(imgPath),
    image_file: path.basename(imgPath),
    filePath: imgPath,
    bytes: stat.size,
    width: meta.width || null,
    height: meta.height || null,
    has_pdf: hasPdf,
    updated_at: meta.updated_at || stat.mtime.toISOString(),
    url: `/api/resume-image?t=${Math.floor(stat.mtimeMs)}`,
    pdf_url: hasPdf ? `/api/resume-assets/source-pdf?t=${Math.floor(stat.mtimeMs)}` : null,
  };
}

export function saveResumeImageMeta(meta = {}) {
  const metaPath = path.join(RESUME_ASSETS_DIR, "meta.json");
  const next = {
    ...meta,
    updated_at: meta.updated_at || now(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(next, null, 2), "utf8");
  return getResumeImageMeta();
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
    credit: safeJson(row.credit_json, {}),
    reputation: safeJson(row.reputation_json, {}),
  };
}

export function saveCompanyIntel(intel) {
  const ts = now();
  db.prepare(`
    INSERT INTO company_intel (company_name, query, search_status, hit_background_check, matched_vendors_json, matched_signals_json, snippets_json, registered_name, credit_json, reputation_json, summary, searched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_name) DO UPDATE SET
      query = excluded.query,
      search_status = excluded.search_status,
      hit_background_check = excluded.hit_background_check,
      matched_vendors_json = excluded.matched_vendors_json,
      matched_signals_json = excluded.matched_signals_json,
      snippets_json = excluded.snippets_json,
      registered_name = excluded.registered_name,
      credit_json = excluded.credit_json,
      reputation_json = excluded.reputation_json,
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
    intel.registered_name ?? "",
    JSON.stringify(intel.credit ?? {}),
    JSON.stringify(intel.reputation ?? {}),
    intel.summary ?? "",
    ts
  );
  return getCompanyIntel(intel.company_name);
}

export function listJobs() {
  const rows = db
    .prepare("SELECT * FROM jobs ORDER BY CASE WHEN filter_status = 'PASS' THEN 0 ELSE 1 END, match_score DESC, updated_at DESC, id DESC")
    .all();
  return rows.map(hydrateJob);
}

export function listKnownExternalIds() {
  return db
    .prepare("SELECT external_id FROM jobs WHERE external_id IS NOT NULL AND external_id != ''")
    .all()
    .map((r) => r.external_id);
}

export function purgeFilteredJobs() {
  const info = db.prepare("DELETE FROM jobs WHERE filter_status = 'FILTERED' AND status IN ('NEW', 'SKIP', 'FILTERED')").run();
  return Number(info.changes || 0);
}

export function getJob(id) {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  return row ? hydrateJob(row) : null;
}

export function upsertJob(job) {
  const ts = now();
  const externalId = job.external_id || `${job.company_name}::${job.job_title}::${job.salary_range || ""}`;
  const normalizedCompany = normalizeCompanyRoot(job.company_name);
  const existing = job.id
    ? db.prepare("SELECT id FROM jobs WHERE id = ?").get(job.id)
    : db.prepare("SELECT id FROM jobs WHERE external_id = ?").get(externalId);

  if (existing) {
    db.prepare(`
      UPDATE jobs SET
        normalized_company = ?, scale = ?, financing = ?, industry = ?, city = ?,
        recruiter_title = ?, recruiter_name = ?, recruiter_active = ?,
        salary_range = ?, experience_req = ?, education_req = ?, jd_text = ?, company_intro = ?, job_url = ?,
        parsed_json = ?, risk_score = ?, zone = ?, recommended_track = ?,
        assigned_profile_id = COALESCE(assigned_profile_id, ?),
        evidence_json = ?, intel_summary = ?, match_score = ?, match_json = ?,
        tailored_resume_json = ?, matched_query = CASE WHEN ? != '' THEN ? ELSE matched_query END,
        apply_advice = ?, filter_status = ?, filter_reason = ?,
        work_address = CASE WHEN ? != '' THEN ? ELSE work_address END,
        area_district = CASE WHEN ? != '' THEN ? ELSE area_district END,
        longitude = COALESCE(?, longitude),
        latitude = COALESCE(?, latitude),
        customer_brand = CASE WHEN ? != '' THEN ? ELSE customer_brand END,
        commute_json = CASE WHEN ? != '{}' THEN ? ELSE commute_json END,
        custom_greeting = ?,
        status = CASE WHEN status = 'NEW' AND ? = 'SKIP' THEN 'SKIP' ELSE status END,
        updated_at = ?
      WHERE id = ?
    `).run(
      normalizedCompany,
      job.scale ?? "",
      job.financing ?? "",
      job.industry ?? "",
      job.city ?? "",
      job.recruiter_title ?? "",
      job.recruiter_name ?? "",
      job.recruiter_active ?? "",
      job.salary_range ?? "",
      job.experience_req ?? "",
      job.education_req ?? "",
      job.jd_text ?? "",
      job.company_intro ?? "",
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
      job.matched_query ?? "",
      job.matched_query ?? "",
      job.apply_advice ?? "REVISE_FIRST",
      job.filter_status ?? "PASS",
      job.filter_reason ?? "",
      job.work_address ?? "",
      job.work_address ?? "",
      job.area_district ?? "",
      job.area_district ?? "",
      job.longitude ?? null,
      job.latitude ?? null,
      job.customer_brand ?? "",
      job.customer_brand ?? "",
      JSON.stringify(job.commute ?? {}),
      JSON.stringify(job.commute ?? {}),
      job.custom_greeting ?? "",
      job.zone ?? "GREEN",
      ts,
      existing.id
    );
    return getJob(existing.id);
  }

  const initialStatus = job.status ?? (job.zone === "SKIP" ? "SKIP" : "NEW");
  const info = db.prepare(`
    INSERT INTO jobs (
      external_id, job_title, company_name, normalized_company, scale, financing, industry, city,
      recruiter_title, recruiter_name, recruiter_active, salary_range, experience_req, education_req,
      jd_text, company_intro, job_url, source_profile_id, parsed_json, risk_score, zone,
      recommended_track, manual_track, assigned_profile_id, evidence_json,
      intel_summary, match_score, match_json, tailored_resume_json,
      matched_query, apply_advice, filter_status, filter_reason,
      work_address, area_district, longitude, latitude, customer_brand, commute_json,
      custom_greeting, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    externalId,
    job.job_title ?? "AI测试工程师",
    job.company_name ?? "",
    normalizedCompany,
    job.scale ?? "",
    job.financing ?? "",
    job.industry ?? "",
    job.city ?? "",
    job.recruiter_title ?? "",
    job.recruiter_name ?? "",
    job.recruiter_active ?? "",
    job.salary_range ?? "",
    job.experience_req ?? "",
    job.education_req ?? "",
    job.jd_text ?? "",
    job.company_intro ?? "",
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
    job.matched_query ?? "",
    job.apply_advice ?? "REVISE_FIRST",
    job.filter_status ?? "PASS",
    job.filter_reason ?? "",
    job.work_address ?? "",
    job.area_district ?? "",
    job.longitude ?? null,
    job.latitude ?? null,
    job.customer_brand ?? "",
    JSON.stringify(job.commute ?? {}),
    job.custom_greeting ?? "",
    initialStatus,
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
      job_title = COALESCE(NULLIF(?, ''), job_title),
      salary_range = COALESCE(NULLIF(?, ''), salary_range),
      city = COALESCE(NULLIF(?, ''), city),
      custom_greeting = COALESCE(?, custom_greeting),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      filter_status = COALESCE(?, filter_status),
      filter_reason = COALESCE(?, filter_reason),
      work_address = COALESCE(?, work_address),
      longitude = COALESCE(?, longitude),
      latitude = COALESCE(?, latitude),
      commute_json = COALESCE(?, commute_json),
      tailored_resume_json = COALESCE(?, tailored_resume_json),
      chat_messages_json = COALESCE(?, chat_messages_json),
      boss_unread_count = COALESCE(?, boss_unread_count),
      boss_stage = COALESCE(?, boss_stage),
      updated_at = ?
    WHERE id = ?
  `).run(
    patch.manual_track ?? null,
    patch.assigned_profile_id ?? null,
    patch.job_title ?? null,
    patch.salary_range ?? null,
    patch.city ?? null,
    patch.custom_greeting ?? null,
    patch.status ?? null,
    patch.notes ?? null,
    patch.filter_status ?? null,
    patch.filter_reason ?? null,
    patch.work_address ?? null,
    patch.longitude ?? null,
    patch.latitude ?? null,
    patch.commute ? JSON.stringify(patch.commute) : null,
    patch.tailored_resume ? JSON.stringify(patch.tailored_resume) : null,
    patch.chat_messages ? JSON.stringify(patch.chat_messages) : null,
    patch.boss_unread_count ?? null,
    patch.boss_stage ?? null,
    ts,
    id
  );
  return getJob(id);
}

export function getCompanyDeliveryHistory(companyName) {
  const root = normalizeCompanyRoot(companyName);
  const rows = db.prepare(`
    SELECT * FROM delivery_logs
    WHERE status IN ('DELIVERED', 'PREPARED')
    ORDER BY id DESC
  `).all();
  const matchedLogs = rows.filter((r) => {
    const rRoot = r.normalized_company || normalizeCompanyRoot(r.company_name);
    return r.company_name === companyName || (root && rRoot && (rRoot === root || rRoot.includes(root) || root.includes(rRoot)));
  });

  // 兜底检查 jobs 表中已标记沟通但可能尚未写入 delivery_logs 的历史记录
  const jobRows = db.prepare(`
    SELECT id AS job_id, job_title, company_name, normalized_company, assigned_profile_id, source_profile_id, status, updated_at AS created_at
    FROM jobs
    WHERE status IN ('DELIVERED', 'REPLIED', 'INTERVIEW')
  `).all();
  const seenJobIds = new Set(matchedLogs.map((r) => r.job_id));
  for (const j of jobRows) {
    if (seenJobIds.has(j.job_id)) continue;
    const jRoot = j.normalized_company || normalizeCompanyRoot(j.company_name);
    if (j.company_name === companyName || (root && jRoot && (jRoot === root || jRoot.includes(root) || root.includes(jRoot)))) {
      matchedLogs.push({
        id: 0,
        job_id: j.job_id,
        job_title: j.job_title,
        company_name: j.company_name,
        normalized_company: jRoot,
        profile_id: j.assigned_profile_id || j.source_profile_id || "Profile 1",
        status: "DELIVERED",
        action: "JOB_STATUS",
        created_at: j.created_at,
      });
    }
  }
  return matchedLogs;
}

export function listDeliveryLogs(limit = 300) {
  return db.prepare(`
    SELECT
      d.*,
      COALESCE(NULLIF(d.job_title, ''), j.job_title, '') AS job_title,
      COALESCE(j.status, '') AS current_job_status,
      COALESCE(j.job_url, '') AS job_url,
      COALESCE(j.salary_range, '') AS salary_range,
      COALESCE(j.tailored_resume_json, '{}') AS tailored_resume_json
    FROM delivery_logs d
    LEFT JOIN jobs j ON j.id = d.job_id
    ORDER BY d.id DESC
    LIMIT ?
  `).all(limit).map((r) => {
    let tailored = {};
    try { tailored = JSON.parse(r.tailored_resume_json || "{}"); } catch {}
    return {
      ...r,
      text_sent: Boolean(r.text_sent),
      image_sent: Boolean(r.image_sent),
      job_image_delivery: tailored.image_delivery || "NONE",
    };
  });
}

export function countTodayDeliveries(profileId) {
  const todayPrefix = todayStr();
  return db.prepare(`
    SELECT COUNT(*) AS cnt FROM delivery_logs
    WHERE profile_id = ? AND status = 'DELIVERED'
      AND action NOT IN ('SEND_IMAGE_ONLY', 'BOSS_HISTORY_SYNC', 'MANUAL_SYNC')
      AND created_at LIKE ?
  `).get(profileId, `${todayPrefix}%`).cnt;
}

export function addDeliveryLog(entry) {
  const ts = now();
  const info = db.prepare(`
    INSERT INTO delivery_logs (
      job_id, company_name, normalized_company, job_title, track_key, profile_id,
      action, greeting_text, text_sent, image_sent, image_status, status, detail, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.job_id,
    entry.company_name,
    normalizeCompanyRoot(entry.company_name),
    entry.job_title ?? "",
    entry.track_key ?? "A",
    entry.profile_id,
    entry.action,
    entry.greeting_text ?? "",
    entry.text_sent ? 1 : 0,
    entry.image_sent ? 1 : 0,
    entry.image_status ?? "NONE",
    entry.status,
    entry.detail ?? "",
    ts
  );
  return db.prepare("SELECT * FROM delivery_logs WHERE id = ?").get(info.lastInsertRowid);
}

export function updateDeliveryLogSnapshot(id, patch = {}) {
  db.prepare(`
    UPDATE delivery_logs
    SET greeting_text = COALESCE(?, greeting_text),
        detail = COALESCE(?, detail)
    WHERE id = ?
  `).run(patch.greeting_text ?? null, patch.detail ?? null, id);
  return db.prepare("SELECT * FROM delivery_logs WHERE id = ?").get(id);
}

/**
 * 为一条 Boss 聊天会话匹配唯一的本地岗位（避免同公司多岗位扇出产生多条重复沟通卡）。
 */
export function pickBestMatchedJobForChat(allJobs = [], existingLogs = [], chat = {}, profileId = "") {
  if (chat.external_id) {
    const exactExt = allJobs.find((j) => j.external_id && j.external_id === chat.external_id);
    if (exactExt) return exactExt;
  }
  const cRoot = normalizeCompanyRoot(chat.company_name);
  const chatTitle = String(chat.job_title || "").trim();

  let candidates = allJobs.filter((j) => {
    // 关键：若会话和本地岗位都有各自的 external_id 且不相等，绝不强行张冠李戴
    if (chat.external_id && j.external_id && j.external_id !== chat.external_id) {
      return false;
    }
    let sameCompany = false;
    if (chat.company_name) {
      if (j.company_name === chat.company_name) sameCompany = true;
      else if (cRoot && j.normalized_company && (j.normalized_company === cRoot || j.normalized_company.includes(cRoot) || cRoot.includes(j.normalized_company))) {
        sameCompany = true;
      }
    } else if (chat.raw_text && j.company_name && chat.raw_text.includes(j.company_name)) {
      sameCompany = true;
    }
    if (!sameCompany) return false;
    if (chatTitle && j.job_title) {
      const a = j.job_title.toLowerCase();
      const b = chatTitle.toLowerCase();
      if (!(a === b || a.includes(b) || b.includes(a))) {
        return false;
      }
    }
    return true;
  });
  if (candidates.length === 0) return null;

  const sameProfileCands = candidates.filter((j) => j.source_profile_id === profileId);
  if (sameProfileCands.length > 0) candidates = sameProfileCands;

  const candIds = new Set(candidates.map((j) => j.id));
  const loggedMatch = existingLogs.find((l) => l.status === "DELIVERED" && candIds.has(l.job_id) && l.profile_id === profileId)
    || existingLogs.find((l) => l.status === "DELIVERED" && candIds.has(l.job_id));
  if (loggedMatch) {
    const found = candidates.find((j) => j.id === loggedMatch.job_id);
    if (found) return found;
  }

  const scored = candidates.map((j) => {
    let score = (j.match_score || 0) * 0.1;
    if (j.source_profile_id === profileId) score += 15;
    if (chatTitle && j.job_title) {
      if (j.job_title === chatTitle) score += 25;
      else if (j.job_title.includes(chatTitle) || chatTitle.includes(j.job_title)) score += 12;
    }
    return { job: j, score };
  });
  scored.sort((a, b) => b.score - a.score || b.job.id - a.job.id);
  return scored[0]?.job || null;
}

export function hasJobExternalId(externalId) {
  if (!externalId) return false;
  return Boolean(db.prepare("SELECT 1 FROM jobs WHERE external_id = ?").get(externalId));
}

export function recordPatrolRun(entry) {
  const ts = now();
  const info = db.prepare(`
    INSERT INTO patrol_runs (
      run_date, mode, profiles_json, keywords_json,
      planned_quota, scanned_count, new_count, kept_count, filtered_count,
      status, summary, details_json, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.run_date || todayStr(),
    entry.mode || "PATROL",
    JSON.stringify(entry.profiles ?? []),
    JSON.stringify(entry.keywords ?? []),
    Number(entry.planned_quota ?? 0),
    Number(entry.scanned_count ?? 0),
    Number(entry.new_count ?? 0),
    Number(entry.kept_count ?? 0),
    Number(entry.filtered_count ?? 0),
    entry.status || "OK",
    entry.summary || "",
    JSON.stringify(entry.details ?? []),
    entry.started_at || ts,
    entry.finished_at || ts
  );
  return db.prepare("SELECT * FROM patrol_runs WHERE id = ?").get(info.lastInsertRowid);
}

function seedInitialPatrolRunIfEmpty() {
  const cnt = db.prepare("SELECT COUNT(*) as c FROM patrol_runs").get()?.c || 0;
  if (cnt > 0) return;
  const settings = getSettings();
  const lastDate = settings.last_daily_check_date || "";
  const summary = settings.last_daily_check_summary || "";
  if (!lastDate || !summary) return;
  const scannedMatch = summary.match(/保存\/更新\s*(\d+)\s*条/);
  const scannedCount = scannedMatch ? Number(scannedMatch[1]) : 0;
  const kws = safeJson(settings.watchlist_keywords, []);
  const maxPerKw = Number(settings.scrape_max_jobs || 10);
  const profiles = settings.scan_mode === "both" ? ["Profile 2", "Profile 1"] : ["Profile 1"];
  const planned = kws.length * maxPerKw * profiles.length;
  const dayStats = db.prepare(`
    SELECT COUNT(*) as new_cnt,
      SUM(CASE WHEN filter_status = 'PASS' THEN 1 ELSE 0 END) as kept_cnt,
      SUM(CASE WHEN filter_status = 'FILTERED' THEN 1 ELSE 0 END) as filt_cnt
    FROM jobs WHERE date(created_at, 'localtime') = ?
  `).get(lastDate) || { new_cnt: 0, kept_cnt: 0, filt_cnt: 0 };
  const kwDetails = db.prepare(`
    SELECT matched_query as keyword,
      COUNT(*) as total,
      SUM(CASE WHEN filter_status = 'PASS' THEN 1 ELSE 0 END) as kept
    FROM jobs WHERE date(created_at, 'localtime') = ?
    GROUP BY matched_query ORDER BY total DESC
  `).all(lastDate);
  const timeMatch = summary.match(/(\d{2}:\d{2}:\d{2})/);
  const hhmmss = timeMatch ? timeMatch[1] : "10:28:22";
  recordPatrolRun({
    run_date: lastDate,
    mode: "PATROL",
    profiles,
    keywords: kws,
    planned_quota: planned || scannedCount,
    scanned_count: scannedCount,
    new_count: Number(dayStats.new_cnt || 0),
    kept_count: Number(dayStats.kept_cnt || 0),
    filtered_count: Number(dayStats.filt_cnt || 0),
    status: summary.includes("中断") ? "VERIFICATION_REQUIRED" : "OK",
    summary,
    details: kwDetails,
    started_at: `${lastDate}T09:30:00+08:00`,
    finished_at: `${lastDate}T${hhmmss}+08:00`,
  });
}

export function listPatrolRuns(limit = 30) {
  seedInitialPatrolRunIfEmpty();
  return db
    .prepare("SELECT * FROM patrol_runs ORDER BY id DESC LIMIT ?")
    .all(limit)
    .map((r) => ({
      ...r,
      profiles: safeJson(r.profiles_json, []),
      keywords: safeJson(r.keywords_json, []),
      details: safeJson(r.details_json, []),
    }));
}

export function getScrapeTelemetry() {
  seedInitialPatrolRunIfEmpty();
  const settings = getSettings();
  const tracks = getAccountTracks();
  const kws = safeJson(settings.watchlist_keywords, []);
  const maxPerKw = Math.max(1, Math.min(25, Number(settings.scrape_max_jobs || 5)));
  const profilesCount = settings.scan_mode === "both" ? Math.max(1, tracks.length || 2) : 1;
  const plannedQuota = kws.length * maxPerKw * profilesCount;
  const todayLocal = new Date().toLocaleDateString("sv-SE");

  const todayRuns = listPatrolRuns(50).filter((r) => r.run_date === todayLocal);
  const todayScanned = todayRuns.reduce((sum, r) => sum + (Number(r.scanned_count) || 0), 0);
  const todayPatrolRuns = todayRuns.filter((r) => r.mode === "PATROL");
  const todayPatrolScanned = todayPatrolRuns.reduce((sum, r) => sum + (Number(r.scanned_count) || 0), 0);

  const byDay = db.prepare(`
    SELECT date(created_at, 'localtime') as run_date,
      COUNT(*) as new_count,
      SUM(CASE WHEN filter_status = 'PASS' THEN 1 ELSE 0 END) as kept_count,
      SUM(CASE WHEN filter_status = 'FILTERED' THEN 1 ELSE 0 END) as filtered_count
    FROM jobs
    WHERE filter_status IN ('PASS', 'FILTERED')
    GROUP BY date(created_at, 'localtime')
    ORDER BY run_date DESC
  `).all();

  const todayRow = byDay.find((d) => d.run_date === todayLocal) || { new_count: 0, kept_count: 0, filtered_count: 0 };
  const byKeyword = db.prepare(`
    SELECT COALESCE(NULLIF(matched_query, ''), '未知来源') as keyword,
      COUNT(*) as total,
      SUM(CASE WHEN filter_status = 'PASS' THEN 1 ELSE 0 END) as kept,
      SUM(CASE WHEN filter_status = 'FILTERED' THEN 1 ELSE 0 END) as filtered
    FROM jobs
    WHERE filter_status IN ('PASS', 'FILTERED')
    GROUP BY keyword
    ORDER BY kept DESC, total DESC
  `).all();

  const jobs = listJobs().filter((j) => j.filter_status !== "CHAT_ONLY");
  const eligible = jobs.filter((j) => (j.filter_status || "PASS") === "PASS");
  const todayRan = settings.last_daily_check_date === todayLocal || todayPatrolRuns.length > 0;
  const quotaFilled = Boolean(todayRan && plannedQuota > 0 && todayPatrolScanned >= plannedQuota);

  return {
    today_date: todayLocal,
    planned_quota: plannedQuota,
    max_per_keyword: maxPerKw,
    keyword_count: kws.length,
    profiles_count: profilesCount,
    today_ran: todayRan,
    today_scanned: todayScanned,
    today_patrol_scanned: todayPatrolScanned,
    today_quota_filled: quotaFilled,
    today_new_count: Number(todayRow.new_count || 0),
    today_new_kept: Number(todayRow.kept_count || 0),
    today_new_filtered: Number(todayRow.filtered_count || 0),
    total_jobs: jobs.length,
    total_kept: eligible.length,
    total_filtered: jobs.length - eligible.length,
    salary_ideal_count: eligible.filter((j) => j.match?.salary_fit?.highlighted).length,
    by_day: byDay,
    by_keyword: byKeyword,
  };
}

export function getFunnelStats() {
  const jobs = listJobs();
  const summarize = (trackKey) => {
    const sub = jobs.filter((j) => {
      const eff = j.manual_track || (j.recommended_track === "A轨_真实日期版" ? "A" : j.recommended_track === "B轨_绿区池" ? "B" : null);
      return eff === trackKey;
    });
    const preparedOrSent = sub.filter((j) => ["PREPARED", "DELIVERED", "REPLIED", "INTERVIEW", "REJECTED"].includes(j.status)).length;
    const delivered = sub.filter((j) => ["DELIVERED", "REPLIED", "INTERVIEW", "REJECTED"].includes(j.status)).length;
    const replied = sub.filter((j) => ["REPLIED", "INTERVIEW"].includes(j.status)).length;
    const interviews = sub.filter((j) => j.status === "INTERVIEW").length;
    return {
      total: sub.length,
      prepared_or_sent: preparedOrSent,
      delivered,
      replied,
      interviews,
      reply_rate: delivered > 0 ? Math.round((replied / delivered) * 100) : 0,
      interview_rate: delivered > 0 ? Math.round((interviews / delivered) * 100) : 0,
    };
  };
  const eligibleJobs = jobs.filter((j) => (j.filter_status || "PASS") === "PASS");
  return {
    A: summarize("A"),
    B: summarize("B"),
    eligible_jobs: eligibleJobs.length,
    filtered_out: jobs.length - eligibleJobs.length,
    direct_apply: eligibleJobs.filter((j) => j.apply_advice === "DIRECT_APPLY").length,
    revise_first: eligibleJobs.filter((j) => j.apply_advice === "REVISE_FIRST").length,
    low_fit: eligibleJobs.filter((j) => j.apply_advice === "LOW_FIT").length,
    delivered: eligibleJobs.filter((j) => ["DELIVERED", "REPLIED", "INTERVIEW", "REJECTED"].includes(j.status)).length,
    replied: eligibleJobs.filter((j) => ["REPLIED", "INTERVIEW"].includes(j.status)).length,
    interviews: eligibleJobs.filter((j) => j.status === "INTERVIEW").length,
    skipped: eligibleJobs.filter((j) => j.zone === "SKIP" || j.status === "SKIP").length,
    total_jobs: jobs.length,
  };
}

function hydrateJob(row) {
  return {
    ...row,
    parsed: safeJson(row.parsed_json, {}),
    evidence: safeJson(row.evidence_json, []),
    match: safeJson(row.match_json, {}),
    tailored_resume: safeJson(row.tailored_resume_json, {}),
    commute: safeJson(row.commute_json, {}),
    chat_messages: safeJson(row.chat_messages_json, []),
  };
}

function safeJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}
