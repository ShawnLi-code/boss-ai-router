const DEFAULT_ROLES = [
  "AI应用测试",
  "AI测试",
  "软件测试",
  "测试工程师",
  "AI评测",
  "大模型测试工程师",
  "模型评测工程师",
  "AI训练师",
  "提示词工程师",
];

const state = {
  data: null,
  egoProfiles: [],
  activeView: "jobs",
  activeFilter: "ALL",
  commuteMaxMin: "all",
  searchText: "",
  sortBy: "match",
  selectedJobId: null,
  inspectorTab: "match",
  pendingVerifySpaceId: null,
  latestUpdate: null,
  watchlist: [...DEFAULT_ROLES],
  selectedWatchlist: new Set(DEFAULT_ROLES),
};

const els = {
  versionTag: document.getElementById("app-version-tag"),
  navJobsCount: document.getElementById("nav-jobs-count"),
  sideALabel: document.getElementById("side-a-label"),
  sideAQuota: document.getElementById("side-a-quota"),
  sideBLabel: document.getElementById("side-b-label"),
  sideBQuota: document.getElementById("side-b-quota"),
  sidePatrolStatus: document.getElementById("side-patrol-status"),
  sideScrapeRetention: document.getElementById("side-scrape-retention"),
  btnCheckUpdate: document.getElementById("btn-check-update"),
  updateBanner: document.getElementById("update-banner"),
  updateBannerTitle: document.getElementById("update-banner-title"),
  updateBannerDesc: document.getElementById("update-banner-desc"),
  btnOpenUpdateModal: document.getElementById("btn-open-update-modal"),
  btnDismissUpdateBanner: document.getElementById("btn-dismiss-update-banner"),
  updateModal: document.getElementById("update-modal"),
  updateStatusText: document.getElementById("update-status-text"),
  updateNotesBox: document.getElementById("update-notes-box"),
  updateProgressWrap: document.getElementById("update-progress-wrap"),
  updateProgressLabel: document.getElementById("update-progress-label"),
  updateProgress: document.getElementById("update-progress"),
  updateReleaseLink: document.getElementById("update-release-link"),
  btnApplyUpdate: document.getElementById("btn-apply-update"),
  workerPill: document.getElementById("worker-pill"),
  workerStatusText: document.getElementById("worker-status-text"),
  verifyBanner: document.getElementById("verify-banner"),
  verifyTitle: document.getElementById("verify-title"),
  verifyDesc: document.getElementById("verify-desc"),
  verifyDoneBtn: document.getElementById("verify-done-btn"),
  verifyDismissBtn: document.getElementById("verify-dismiss-btn"),
  btnToggleWatchlist: document.getElementById("btn-toggle-watchlist"),
  watchlistCountLabel: document.getElementById("watchlist-count-label"),
  watchlistDrawer: document.getElementById("watchlist-drawer"),
  watchlistChips: document.getElementById("watchlist-chips"),
  newWatchlistKw: document.getElementById("new-watchlist-kw"),
  btnAddWatchlist: document.getElementById("btn-add-watchlist"),
  btnSaveWatchlist: document.getElementById("btn-save-watchlist"),
  scrapeQuery: document.getElementById("scrape-query"),
  scrapeCity: document.getElementById("scrape-city"),
  scrapeHrActive: document.getElementById("scrape-hr-active"),
  scrapeMax: document.getElementById("scrape-max"),
  scrapeMode: document.getElementById("scrape-mode"),
  btnPatrol: document.getElementById("btn-patrol"),
  btnScrape: document.getElementById("btn-scrape"),
  btnRecalcAll: document.getElementById("btn-recalc-all"),
  btnOpenImport: document.getElementById("btn-open-import"),
  cntAll: document.getElementById("cnt-all"),
  cntSalaryIdeal: document.getElementById("cnt-salary-ideal"),
  cntDirect: document.getElementById("cnt-direct"),
  cntRevise: document.getElementById("cnt-revise"),
  cntIdeal: document.getElementById("cnt-ideal"),
  cntFiltered: document.getElementById("cnt-filtered"),
  btnPurgeFiltered: document.getElementById("btn-purge-filtered"),
  btnCalcCommute: document.getElementById("btn-calc-commute"),
  jobSearchInput: document.getElementById("job-search-input"),
  jobCommuteFilter: document.getElementById("job-commute-filter"),
  jobSortSelect: document.getElementById("job-sort-select"),
  jobListPane: document.getElementById("job-list-pane"),
  jobInspectorPane: document.getElementById("job-inspector-pane"),
  liveLogLatest: document.getElementById("live-log-latest"),
  resumesContainer: document.getElementById("resumes-container"),
  btnRecalcFromResumes: document.getElementById("btn-recalc-from-resumes"),
  funnelCards: document.getElementById("funnel-cards"),
  patrolKpiStrip: document.getElementById("patrol-kpi-strip"),
  patrolRunsTableBody: document.querySelector("#patrol-runs-table tbody"),
  dailyBreakdownTableBody: document.querySelector("#daily-breakdown-table tbody"),
  keywordStatsTableBody: document.querySelector("#keyword-stats-table tbody"),
  tracksConfigList: document.getElementById("tracks-config-list"),
  settingsForm: document.getElementById("settings-form"),
  blacklistForm: document.getElementById("blacklist-form"),
  blacklistInput: document.getElementById("blacklist-input"),
  blacklistItems: document.getElementById("blacklist-items"),
  deliveryLogsList: document.getElementById("delivery-logs-list"),
  importModal: document.getElementById("import-modal"),
  importForm: document.getElementById("import-form"),
  importJsonInput: document.getElementById("import-json-input"),
  btnFillSampleJobs: document.getElementById("btn-fill-sample-jobs"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
};

const STATUS_LABELS = {
  NEW: "待处理",
  SKIP: "已拦截",
  PREPARED: "已打开沟通",
  DELIVERED: "已投递",
  REPLIED: "HR已回复",
  INTERVIEW: "已约面试",
  REJECTED: "已婉拒/结束",
};

const ADVICE_LABELS = {
  DIRECT_APPLY: "可直接投",
  REVISE_FIRST: "改后投",
  LOW_FIT: "匹配偏低",
};

function esc(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return String(iso).slice(0, 19).replace("T", " ");
  }
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function setWorkerBusy(busy, label = "") {
  els.workerPill.classList.toggle("status-busy", busy);
  els.workerStatusText.textContent = busy ? (label || "Ego 执行中...") : "Ego 引擎空闲";
  els.btnScrape.disabled = busy;
  els.btnPatrol.disabled = busy;
}

function showVerifyBanner(payload) {
  state.pendingVerifySpaceId = payload.taskSpaceId || null;
  els.verifyTitle.textContent = `需要人工安全验证（TaskSpace #${payload.taskSpaceId ?? "-"} · 已触发当日防封熔断）`;
  els.verifyDesc.textContent = payload.message || "请在 Ego 完成验证；为防连封，今日已自动熔断该账号。";
  els.verifyBanner.hidden = false;
}

// Sidebar navigation
const navItems = [...document.querySelectorAll(".nav-item[data-view]")];
const viewPanes = {
  jobs: document.getElementById("view-jobs"),
  resumes: document.getElementById("view-resumes"),
  funnel: document.getElementById("view-funnel"),
  settings: document.getElementById("view-settings"),
};

function switchView(view) {
  state.activeView = view;
  for (const btn of navItems) {
    btn.setAttribute("aria-current", btn.dataset.view === view ? "page" : "false");
  }
  for (const [key, el] of Object.entries(viewPanes)) {
    el.hidden = key !== view;
  }
}

for (const btn of navItems) {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
}

// Dialog light-dismiss fallback
if (!("closedBy" in HTMLDialogElement.prototype)) {
  const outside = (e, dialog) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
    let pressedOutside = false;
    dialog.addEventListener("pointerdown", (e) => { pressedOutside = outside(e, dialog); });
    dialog.addEventListener("pointerup", (e) => { if (pressedOutside && outside(e, dialog)) dialog.close(); });
  }
}
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("close", () => { dialog.returnValue = ""; });
}

els.themeToggleBtn.addEventListener("click", () => {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme");
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const next = current ? (current === "dark" ? "light" : "dark") : (prefersDark ? "light" : "dark");
  root.setAttribute("data-theme", next);
});

els.sideScrapeRetention?.addEventListener("click", () => switchView("funnel"));

els.btnToggleWatchlist.addEventListener("click", () => {
  els.watchlistDrawer.hidden = !els.watchlistDrawer.hidden;
});

document.querySelectorAll(".seg-btn[data-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg-btn[data-filter]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeFilter = btn.dataset.filter;
    renderJobList();
    renderInspector(true);
  });
});

els.jobSearchInput.addEventListener("input", () => {
  state.searchText = els.jobSearchInput.value.trim().toLowerCase();
  renderJobList();
  renderInspector();
});

els.jobCommuteFilter.addEventListener("change", () => {
  state.commuteMaxMin = els.jobCommuteFilter.value;
  renderJobList();
  renderInspector();
});

els.jobSortSelect.addEventListener("change", () => {
  state.sortBy = els.jobSortSelect.value;
  renderJobList();
});

function syncWatchlistFromSettings(settings = {}) {
  try {
    const arr = JSON.parse(settings.watchlist_keywords || "[]");
    if (Array.isArray(arr) && arr.length > 0) {
      const cleaned = [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))];
      state.watchlist = cleaned;
      state.selectedWatchlist = new Set(cleaned);
    }
  } catch {}
}

async function refreshState() {
  const data = await api("/api/state");
  state.data = data;
  if (data.version) els.versionTag.textContent = `v${data.version}`;
  syncWatchlistFromSettings(data.settings);
  setWorkerBusy(Boolean(data.activeLock || data.patrolRunning), data.activeLock?.label || (data.patrolRunning ? "每日巡检中..." : ""));
  if (!state.selectedJobId && data.jobs?.length > 0) {
    state.selectedJobId = data.jobs[0].id;
  }
  renderAll();
}

async function loadEgoProfiles() {
  try {
    const res = await api("/api/ego/profiles");
    state.egoProfiles = res.profiles || [];
  } catch {
    state.egoProfiles = [
      { id: "Profile 1", name: "Profile 1", isDefault: true },
      { id: "Profile 2", name: "Profile 2", isDefault: false },
    ];
  }
  renderProfileSelectors();
}

function renderAll() {
  if (!state.data) return;
  renderSidebarSummary();
  renderWatchlistChips();
  renderProfileSelectors();
  renderJobList();
  renderInspector();
  renderResumes();
  renderFunnel();
  renderBlacklist();
  renderSettings();
  renderDeliveryLogs();
}

function renderSidebarSummary() {
  const { jobs, tracks, settings } = state.data;
  const eligible = jobs.filter((j) => (j.filter_status || "PASS") === "PASS");
  const filtered = jobs.filter((j) => j.filter_status === "FILTERED");
  els.navJobsCount.textContent = eligible.length;
  els.cntAll.textContent = eligible.length;
  if (els.cntSalaryIdeal) {
    els.cntSalaryIdeal.textContent = eligible.filter((j) => j.match?.salary_fit?.highlighted).length;
  }
  els.cntDirect.textContent = eligible.filter((j) => (j.apply_advice || j.match?.apply_advice) === "DIRECT_APPLY").length;
  els.cntRevise.textContent = eligible.filter((j) => (j.apply_advice || j.match?.apply_advice) === "REVISE_FIRST").length;
  els.cntIdeal.textContent = eligible.filter((j) => (j.match?.eligibility?.exp_tier || "IDEAL_1_3") === "IDEAL_1_3").length;
  els.cntFiltered.textContent = filtered.length;
  els.btnPurgeFiltered.hidden = filtered.length === 0;

  const t1 = tracks[0];
  const t2 = tracks[1];
  if (t1) {
    els.sideALabel.textContent = `${t1.profile_name} (${t1.profile_id})`;
    els.sideAQuota.textContent = `${t1.today_delivered}/${t1.daily_limit}${t1.breaker_active ? " 熔断" : ""}`;
  }
  if (t2) {
    els.sideBLabel.textContent = `${t2.profile_name} (${t2.profile_id})`;
    els.sideBQuota.textContent = `${t2.today_delivered}/${t2.daily_limit}${t2.breaker_active ? " 熔断" : ""}`;
  }

  const st = state.data?.scrape_telemetry;
  const today = new Date().toLocaleDateString("sv-SE");
  if (st && st.today_ran) {
    const quotaText = st.today_quota_filled
      ? `今日已抓满 (${st.today_patrol_scanned}/${st.planned_quota})`
      : `今日已抓 ${st.today_patrol_scanned}/${st.planned_quota} (未满)`;
    els.sidePatrolStatus.textContent = `今日巡检：${quotaText}`;
  } else if (settings?.last_daily_check_date === today) {
    els.sidePatrolStatus.textContent = "今日巡检：已完成";
  } else {
    els.sidePatrolStatus.textContent = settings?.daily_check_enabled === "true"
      ? `今日巡检：待运行 (${settings.daily_check_time || "09:30"})`
      : "今日巡检：手动模式";
  }
  if (els.sideScrapeRetention && st) {
    els.sideScrapeRetention.textContent = `今日新 ${st.today_new_count} 留 ${st.today_new_kept} · 累计 ${st.total_jobs} 留 ${st.total_kept} →`;
  }
}

function renderWatchlistChips() {
  els.watchlistCountLabel.textContent = String(state.selectedWatchlist.size);
  els.watchlistChips.innerHTML = state.watchlist
    .map((kw) => {
      const active = state.selectedWatchlist.has(kw);
      return `
        <span class="watch-chip ${active ? "active" : ""}" data-toggle-kw="${esc(kw)}">
          <span>${active ? "✓" : "+"} ${esc(kw)}</span>
          <button type="button" class="chip-del" data-remove-kw="${esc(kw)}" aria-label="移除关键词">×</button>
        </span>
      `;
    })
    .join("");

  els.watchlistChips.querySelectorAll("[data-toggle-kw]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-remove-kw]")) return;
      const kw = el.dataset.toggleKw;
      if (state.selectedWatchlist.has(kw)) {
        if (state.selectedWatchlist.size > 1) state.selectedWatchlist.delete(kw);
      } else {
        state.selectedWatchlist.add(kw);
      }
      renderWatchlistChips();
    });
  });

  els.watchlistChips.querySelectorAll("[data-remove-kw]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kw = btn.dataset.removeKw;
      if (state.watchlist.length <= 1) return;
      state.watchlist = state.watchlist.filter((k) => k !== kw);
      state.selectedWatchlist.delete(kw);
      renderWatchlistChips();
    });
  });
}

function renderProfileSelectors() {
  const list = state.egoProfiles.length
    ? state.egoProfiles
    : (state.data?.tracks || []).map((t) => ({ id: t.profile_id, name: t.profile_name }));
  const current = els.scrapeMode.value || (state.data?.settings?.scan_mode === "single" ? `single:${list[0]?.id || "Profile 1"}` : "both");
  const options = [
    `<option value="both" ${current === "both" ? "selected" : ""}>双号分别刷一遍（去重）</option>`,
    ...list.map((p) => {
      const v = `single:${p.id}`;
      return `<option value="${esc(v)}" ${current === v ? "selected" : ""}>仅用 ${esc(p.name)} (${esc(p.id)})</option>`;
    }),
  ];
  els.scrapeMode.innerHTML = options.join("");
}

function adviceTagHtml(advice, score) {
  const key = advice || "REVISE_FIRST";
  const label = ADVICE_LABELS[key] || "待评估";
  return `<span class="zone-tag advice-${esc(key)}">匹配 ${esc(score)} · ${esc(label)}</span>`;
}

function zoneTagHtml(zone, score) {
  const text = zone === "SKIP" ? "背调拦截 SKIP" : `背调 ${zone} ${score}`;
  return `<span class="zone-tag zone-${esc(zone)}"><span class="zone-dot" aria-hidden="true"></span>${esc(text)}</span>`;
}

function salaryTagHtml(job) {
  const sf = job.match?.salary_fit;
  if (!sf || !sf.highlighted) return "";
  return `<span class="zone-tag salary-${esc(sf.tier || "TARGET_COVER")}">${esc(sf.label)}</span>`;
}

function commuteTagHtml(job) {
  const c = job.commute;
  if (!c || c.status !== "DONE" || c.effective_min == null) return "";
  if (c.effective_min >= 900 || c.tier_label === "异地/超远") {
    const distTxt = c.distance_km ? `·${c.distance_km}km` : "";
    return `<span class="zone-tag commute-EXTREME">异地${esc(distTxt)}</span>`;
  }
  const modeTxt = c.prefer_direct_bike ? `骑行${c.effective_min}分` : `单车+地铁${c.effective_min}分`;
  const distTxt = c.distance_km ? `·${c.distance_km}km` : "";
  return `<span class="zone-tag commute-${esc(c.tier || "MODERATE")}">${esc(modeTxt + distTxt)}</span>`;
}

function getFilteredSortedJobs() {
  const all = state.data?.jobs || [];
  let list = all.filter((j) => {
    const isFiltered = j.filter_status === "FILTERED";
    if (state.activeFilter === "FILTERED") {
      if (!isFiltered) return false;
    } else {
      if (isFiltered) return false;
      const adv = j.apply_advice || j.match?.apply_advice || "REVISE_FIRST";
      if (state.activeFilter === "SALARY_IDEAL" && !j.match?.salary_fit?.highlighted) return false;
      if (state.activeFilter === "DIRECT_APPLY" && adv !== "DIRECT_APPLY") return false;
      if (state.activeFilter === "REVISE_FIRST" && adv !== "REVISE_FIRST") return false;
      if (state.activeFilter === "IDEAL_1_3" && (j.match?.eligibility?.exp_tier || "IDEAL_1_3") !== "IDEAL_1_3") return false;
    }
    if (state.commuteMaxMin !== "all") {
      const cap = Number(state.commuteMaxMin);
      const mins = j.commute?.status === "DONE" ? j.commute?.effective_min : null;
      if (mins == null || mins > cap) return false;
    }
    if (state.searchText) {
      const hay = `${j.job_title} ${j.company_name} ${j.matched_query || ""} ${j.jd_text || ""} ${j.industry || ""} ${j.filter_reason || ""}`.toLowerCase();
      if (!hay.includes(state.searchText)) return false;
    }
    return true;
  });

  if (state.sortBy === "match") {
    list = [...list].sort((a, b) =>
      (b.match_score || 0) - (a.match_score || 0) ||
      (b.match?.salary_fit?.rank || 0) - (a.match?.salary_fit?.rank || 0) ||
      b.id - a.id
    );
  } else if (state.sortBy === "commute") {
    list = [...list].sort((a, b) => {
      const am = a.commute?.status === "DONE" && a.commute.effective_min != null ? a.commute.effective_min : 9999;
      const bm = b.commute?.status === "DONE" && b.commute.effective_min != null ? b.commute.effective_min : 9999;
      return am - bm || (b.match_score || 0) - (a.match_score || 0);
    });
  } else if (state.sortBy === "recent") {
    list = [...list].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")) || b.id - a.id);
  } else if (state.sortBy === "risk") {
    list = [...list].sort((a, b) => (a.risk_score || 0) - (b.risk_score || 0) || (b.match_score || 0) - (a.match_score || 0));
  }
  return list;
}

function renderJobList() {
  const jobs = getFilteredSortedJobs();
  if (jobs.length === 0) {
    els.jobListPane.innerHTML = `<div class="empty-state">当前筛选下暂无岗位。</div>`;
    return;
  }

  els.jobListPane.innerHTML = jobs
    .map((j) => {
      const selected = j.id === state.selectedJobId;
      const adv = j.apply_advice || j.match?.apply_advice || "REVISE_FIRST";
      const salaryIdeal = j.filter_status !== "FILTERED" && Boolean(j.match?.salary_fit?.highlighted);
      const expBadge = j.filter_status === "FILTERED"
        ? (j.filter_reason || "已过滤杂岗")
        : (j.match?.eligibility?.exp_badge || j.experience_req || "");
      const srcTag = j.matched_query ? `${j.matched_query}` : "";
      const locSub = j.area_district || (j.work_address ? j.work_address.slice(0, 14) : "");
      return `
        <button type="button" class="job-row ${salaryIdeal ? "job-row-salary-ideal" : ""}" role="option" aria-selected="${selected}" data-select-job="${j.id}">
          <div class="job-row-top">
            <span class="job-row-title">${esc(j.job_title)}</span>
            <span class="job-row-salary ${salaryIdeal ? "is-ideal" : ""}">${esc(j.salary_range || "面议")}</span>
          </div>
          <div class="job-row-sub">${esc(j.company_name)}${locSub ? ` · ${esc(locSub)}` : ""} · ${esc(j.experience_req || "经验不限")} · ${esc(j.recruiter_active || j.recruiter_title || "未知")}</div>
          <div class="job-row-meta">
            ${j.filter_status === "FILTERED" ? `<span class="meta-pill">${esc(expBadge)}</span>` : adviceTagHtml(adv, j.match_score || 0)}
            ${j.filter_status !== "FILTERED" ? salaryTagHtml(j) : ""}
            ${commuteTagHtml(j)}
            ${j.filter_status !== "FILTERED" && expBadge ? `<span class="meta-pill">${esc(expBadge)}</span>` : ""}
            ${zoneTagHtml(j.zone, j.risk_score)}
            ${srcTag ? `<span class="meta-pill">${esc(srcTag)}</span>` : ""}
            <span class="muted" style="margin-left:auto;">${esc(STATUS_LABELS[j.status] || j.status)}</span>
          </div>
        </button>
      `;
    })
    .join("");

  els.jobListPane.querySelectorAll("[data-select-job]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedJobId = Number(btn.dataset.selectJob);
      renderJobList();
      renderInspector(true);
    });
  });
}

async function renderInspector(fetchFresh = false) {
  if (!state.selectedJobId) {
    els.jobInspectorPane.innerHTML = `<div class="empty-state">在左侧选择一个已保存岗位，查看 5 维度匹配打分、可否直投诊断、背调风险、沟通模板并一键跳转沟通页。</div>`;
    return;
  }

  const visibleJobs = getFilteredSortedJobs();
  let job = visibleJobs.find((j) => j.id === state.selectedJobId);
  if (!job) {
    if (visibleJobs.length > 0) {
      state.selectedJobId = visibleJobs[0].id;
      job = visibleJobs[0];
    } else {
      els.jobInspectorPane.innerHTML = `<div class="empty-state">当前筛选下暂无岗位。</div>`;
      return;
    }
  }

  if (fetchFresh) {
    try {
      job = await api(`/api/jobs/${job.id}`);
    } catch {}
  }

  const tracks = state.data?.tracks || [];
  const profilePool = state.egoProfiles.length
    ? state.egoProfiles
    : tracks.map((t) => ({ id: t.profile_id, name: t.profile_name }));
  const preferredProfile = job.assigned_profile_id || job.source_profile_id || profilePool[0]?.id || "Profile 1";

  const matchObj = job.match || {};
  const dims = matchObj.dimensions || {};
  const dimList = [
    dims.work_content || { score: Math.round((job.match_score || 0) * 0.35), max: 35, label: "工作内容重合" },
    dims.tech_stack || { score: Math.round((job.match_score || 0) * 0.25), max: 25, label: "技能栈命中" },
    dims.role_alignment || { score: Math.round((job.match_score || 0) * 0.15), max: 15, label: "岗位方向契合" },
    dims.hard_gate || { score: Math.round((job.match_score || 0) * 0.15), max: 15, label: "资历门槛" },
    dims.project_context || { score: Math.round((job.match_score || 0) * 0.1), max: 10, label: "项目场景相关" },
  ];

  const applyAdvice = job.apply_advice || matchObj.apply_advice || "REVISE_FIRST";
  const adviceLabel = matchObj.advice_label || ADVICE_LABELS[applyAdvice] || "建议微调后投";
  const adviceSummary = matchObj.advice_summary || "请结合下方命中关键词与缺失必需项判断是否直接投递。";
  const reviseSuggestions = matchObj.revise_suggestions || [];
  const templates = Array.isArray(matchObj.greeting_templates) ? matchObj.greeting_templates : [];

  const tailored = job.tailored_resume || {};
  const factGuard = tailored.fact_guard || { passed: true, issues: [] };
  const intel = job.intel || {};
  const snippets = intel.snippets || [];
  const regName = intel.registered_name || "";
  const credit = intel.credit || {};
  const rep = intel.reputation || {};
  const commute = job.commute || {};
  const lookupEntity = regName || job.company_name;
  const conflict = (job.company_history || []).find((h) => h.profile_id !== preferredProfile);

  els.jobInspectorPane.innerHTML = `
    <div class="inspector-head">
      <div>
        <h2 class="inspector-title">${esc(job.job_title)} · ${esc(job.company_name)}${regName && regName !== job.company_name ? ` <span class="muted" style="font-size:12px;font-weight:500;">(${esc(regName)})</span>` : ""}</h2>
        <p class="inspector-sub">
          ${esc(job.salary_range || "薪资未标")} · ${esc(job.experience_req || "经验不限")} · ${esc(job.education_req || "学历不限")} · ${esc(job.scale || "规模未知")} · ${esc(job.financing || "融资未知")} · ${esc(job.recruiter_title || "招聘人")} (${esc(job.recruiter_active || "活跃未知")})
        </p>
      </div>
      <div class="inspector-controls">
        ${adviceTagHtml(applyAdvice, job.match_score || 0)}
        ${job.filter_status !== "FILTERED" ? salaryTagHtml(job) : ""}
        ${commuteTagHtml(job)}
        ${zoneTagHtml(job.zone, job.risk_score)}
        <button type="button" class="btn btn-secondary btn-xs" id="insp-open-page">Ego 打开</button>
        ${job.filter_status === "FILTERED" ? `<button type="button" class="btn btn-secondary btn-xs" id="insp-restore-btn">放行回精选</button>` : `<button type="button" class="btn btn-ghost btn-xs" id="insp-filter-out-btn">标记杂岗</button>`}
        <button type="button" class="btn btn-ghost btn-xs" id="insp-ban-btn">拉黑</button>
      </div>
    </div>

    <div class="commute-strip">
      <div>
        <strong>地点与单车+地铁：</strong>
        <span>${esc(job.work_address || job.area_district || "尚未抓取具体街道")}</span>
        <span class="muted" style="margin-left:8px;">${esc(commute.status === "DONE" ? commute.summary : "点击右侧按居住地址测算单车+地铁真实耗时")}</span>
      </div>
      <button type="button" class="btn btn-secondary btn-xs" id="insp-calc-commute" style="flex:none;">测算单车+地铁</button>
    </div>

    ${job.filter_status === "FILTERED" ? `<div class="alert-strip alert-warn" style="border-radius:8px;"><span><strong>自动精筛已过滤：</strong>${esc(job.filter_reason || "非测试相关或经验超档")}</span></div>` : ""}
    ${job.blacklisted ? `<div class="conflict-alert">黑名单拦截：${esc(job.blacklisted.company_name)}（${esc(job.blacklisted.reason)}）</div>` : ""}
    ${conflict ? `<div class="conflict-alert">防撞车提醒：公司「${esc(job.company_name)}」近期曾用 ${esc(conflict.profile_id)} 沟通过，请确认是否继续跳转。</div>` : ""}

    <div class="inspector-tabs" role="tablist" aria-label="岗位详情视图">
      <button type="button" role="tab" id="itab-match" aria-selected="${state.inspectorTab === "match"}">匹配打分与直达沟通</button>
      <button type="button" role="tab" id="itab-risk" aria-selected="${state.inspectorTab === "risk"}">背调风控与舆情</button>
      <button type="button" role="tab" id="itab-jd" aria-selected="${state.inspectorTab === "jd"}">完整 JD 与个人备注</button>
    </div>

    <div role="tabpanel" aria-labelledby="itab-match" ${state.inspectorTab === "match" ? "" : "hidden"}>
      <div class="panel-inner">
        <div class="dim-grid">
          ${dimList
            .map((d) => {
              const pct = d.max > 0 ? Math.min(100, Math.round((d.score / d.max) * 100)) : 0;
              return `
                <div class="dim-card" title="${esc(d.note || "")}">
                  <div class="dim-top">
                    <span class="dim-label">${esc(d.label)}</span>
                    <span class="dim-score">${esc(d.score)}/${esc(d.max)}</span>
                  </div>
                  <div class="dim-bar"><div class="dim-bar-fill" style="width:${pct}%"></div></div>
                </div>
              `;
            })
            .join("")}
        </div>

        <div class="verdict-box">
          <div class="verdict-head">
            <div>
              <strong>投递诊断：${esc(adviceLabel)}（总分 ${esc(job.match_score || 0)}/100）</strong>
              <span class="meta-pill" style="margin-left:6px;">${factGuard.passed ? "2年事实锁通过" : "事实锁异常"}</span>
            </div>
            <button type="button" class="btn btn-secondary btn-xs" id="insp-recalc-btn">按当前2年简历重算</button>
          </div>
          <div class="muted">${esc(adviceSummary)}</div>
          <div style="font-size:12px;">
            <strong>命中工作点：</strong>${esc((matchObj.matched_keywords || []).join("、") || "基础软件测试")}
            ${matchObj.missing_must_haves?.length ? `<span style="margin-left:10px;color:var(--yellow-fg);"><strong>JD必需但简历较弱：</strong>${esc(matchObj.missing_must_haves.join("、"))}</span>` : ""}
          </div>
          ${reviseSuggestions.length ? `<ul class="evidence-list">${reviseSuggestions.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
        </div>

        <div class="form-grid">
          <label class="field">
            <span>跳转沟通所用 Ego 账号</span>
            <select id="insp-profile-select">
              ${profilePool.map((p) => `<option value="${esc(p.id)}" ${p.id === preferredProfile ? "selected" : ""}>${esc(p.name)} (${esc(p.id)})</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>投递跟进状态</span>
            <select id="insp-status-select">
              ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${esc(k)}" ${job.status === k ? "selected" : ""}>${esc(v)}</option>`).join("")}
            </select>
          </label>
        </div>

        <details>
          <summary class="muted" style="cursor:pointer;">2年主简历原文 vs 本岗动态微调 Diff 对比</summary>
          <div class="diff-grid" style="margin-top:8px;">
            <div>
              <span class="muted">2年母版原文：</span>
              <div class="code-box">${esc(tailored.original_summary || "尚未同步2年经历主简历")}</div>
            </div>
            <div>
              <span class="muted">针对本岗侧重优化：</span>
              <div class="code-box">${esc(tailored.tailored_summary || "")}</div>
            </div>
          </div>
        </details>

        <label class="field">
          <span>定制优势摘要（仅微调侧重点，导出定制 PDF 后发送给 HR）</span>
          <textarea id="insp-tailored-summary" rows="3">${esc(tailored.tailored_summary || "")}</textarea>
        </label>

        <div class="stack-sm">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
            <span style="font-size:12px;font-weight:600;color:var(--text-muted);">预测沟通话术模板（点击切换 · <strong id="insp-greeting-len">${(job.custom_greeting || "").length}</strong> / 120 字）</span>
            <div class="template-chips">
              ${templates
                .map(
                  (t, idx) =>
                    `<button type="button" class="tpl-btn ${t.text === job.custom_greeting ? "active" : ""}" data-tpl-idx="${idx}">${esc(t.label)}</button>`
                )
                .join("")}
              <button type="button" class="btn btn-ghost btn-xs" id="insp-copy-greeting">复制话术</button>
            </div>
          </div>
          <textarea id="insp-greeting" rows="3" maxlength="120">${esc(job.custom_greeting || "")}</textarea>
        </div>

        <details style="margin-top:2px;">
          <summary class="muted" style="cursor:pointer;">HR 回复后探底 4 连问（防踩坑话术）与投递时机建议</summary>
          <div class="surface-box" style="margin-top:8px;gap:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong>破冰回复后实用 4 问（排查一人多岗 / 单双休 / 社保基数 / 绩效）</strong>
              <button type="button" class="btn btn-secondary btn-xs" id="insp-copy-probe">一键复制 4 问</button>
            </div>
            <div class="code-box" id="insp-probe-text" style="max-height:none;">您好，进一步沟通前想确认几个基础问题方便双向评估：
1. 该岗位日常核心工作内容主要是软件/AI测试本身，还是会涉及跨岗杂活？
2. 团队目前的工作时间与休假安排是标准双休吗？是否涉及倒班？
3. 五险一金是入职即按全额工资还是最低基数缴纳？
4. 薪资 ${esc(job.salary_range || "9-12K")} 是全额固定底薪，还是包含绩效浮动？谢谢！</div>
            <div class="muted" style="font-size:12px;">
              💡 <strong>提效建议：</strong>周日晚上或睡前（20:30-22:30）及工作日早 9:30-10:30 沟通更容易排在 HR 收件箱前排；若推荐总重复，可用一个副号在 Boss 隐私中临时隐藏在线简历，配合软件增量扫新公司。${matchObj.matched_keywords?.length ? ` 本岗重点面试核验点：<strong>${esc(matchObj.matched_keywords.slice(0, 4).join("、"))}</strong>${matchObj.missing_must_haves?.length ? `（建议提前补强 ${esc(matchObj.missing_must_haves.slice(0, 2).join("、"))} 案例）` : ""}。` : ""}
            </div>
          </div>
        </details>

        <div class="right-row">
          <button type="button" class="btn btn-secondary btn-sm" id="insp-export-pdf">导出2年定制 PDF</button>
          <a class="btn btn-ghost btn-sm" href="/resume-print.html?jobId=${job.id}&track=${esc(state.data?.settings?.primary_resume_track || "A")}" target="_blank">打印预览</a>
          <button type="button" class="btn btn-secondary btn-sm" id="insp-save-btn">保存修改</button>
          <button type="button" class="btn btn-primary btn-sm" id="insp-deliver-prefill" ${job.blacklisted ? "disabled" : ""}>跳转 Boss 沟通页（预填话术）</button>
          <button type="button" class="btn btn-ghost btn-sm" id="insp-deliver-auto" ${job.blacklisted ? "disabled" : ""}>直接发送</button>
        </div>
      </div>
    </div>

    <div role="tabpanel" aria-labelledby="itab-risk" ${state.inspectorTab === "risk" ? "" : "hidden"}>
      <div class="panel-inner">
        <div class="surface-box">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <strong>三段式企业尽调与背调风控（${esc(job.zone)} · ${esc(job.risk_score)} 分）</strong>
            <div class="intel-links">
              <a class="btn btn-ghost btn-xs" href="https://aiqicha.baidu.com/s?q=${encodeURIComponent(lookupEntity)}" target="_blank" rel="noreferrer">爱企查工商</a>
              <a class="btn btn-ghost btn-xs" href="https://www.tianyancha.com/search?key=${encodeURIComponent(lookupEntity)}" target="_blank" rel="noreferrer">天眼查诉讼</a>
              <a class="btn btn-ghost btn-xs" href="https://www.zhihu.com/search?q=${encodeURIComponent(lookupEntity + " 怎么样 背调")}" target="_blank" rel="noreferrer">知乎风评</a>
              <button type="button" class="btn btn-secondary btn-xs" id="insp-refresh-intel">深度联网尽调</button>
            </div>
          </div>
          <div style="font-size:12.5px;display:flex;flex-wrap:wrap;gap:8px;">
            <span class="meta-pill">工商主体：${esc(regName || "点击「深度联网尽调」自动识别全称")}</span>
            ${credit.established_year ? `<span class="meta-pill">成立：${esc(credit.established_year)}年</span>` : ""}
            ${credit.registered_capital ? `<span class="meta-pill">注册：${esc(credit.registered_capital)}</span>` : ""}
            ${credit.paid_capital ? `<span class="meta-pill">实缴：${esc(credit.paid_capital)}</span>` : ""}
            ${credit.insured_count != null ? `<span class="meta-pill">参保：${esc(credit.insured_count)}人</span>` : ""}
            ${rep.negative_tags?.length ? `<span class="zone-tag zone-RED">雷区预警：${esc(rep.negative_tags.join("、"))}</span>` : ""}
          </div>
          <ul class="evidence-list">
            ${(job.evidence || []).map((ev) => `<li>${esc(ev)}</li>`).join("")}
          </ul>
          <p class="muted">尽调结论：${esc(intel.summary || job.intel_summary || "尚未补查")}</p>
          ${snippets.length ? `<ul class="evidence-list">${snippets.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)}</a><br><span class="muted">${esc(s.snippet)}</span></li>`).join("")}</ul>` : ""}
        </div>
      </div>
    </div>

    <div role="tabpanel" aria-labelledby="itab-jd" ${state.inspectorTab === "jd" ? "" : "hidden"}>
      <div class="panel-inner">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="muted">来源：${esc(job.matched_query || "手动导入")} · 采集账号：${esc(job.source_profile_id || "未知")} · 保存时间：${esc(fmtTime(job.updated_at || job.created_at))}</span>
          ${job.job_url ? `<a class="btn btn-ghost btn-xs" href="${esc(job.job_url)}" target="_blank" rel="noreferrer">浏览器查看链接</a>` : ""}
        </div>
        <div class="code-box" style="max-height:360px;">${esc(job.jd_text || "无 JD 文本")}</div>
        ${job.company_intro ? `<details><summary class="muted" style="cursor:pointer;">公司简介</summary><div class="code-box" style="margin-top:6px;">${esc(job.company_intro)}</div></details>` : ""}
        <label class="field">
          <span>个人跟进笔记</span>
          <textarea id="insp-notes" rows="3" placeholder="记录面试反馈、HR回复情况、背调确认结果...">${esc(job.notes || "")}</textarea>
        </label>
        <div class="right-row">
          <button type="button" class="btn btn-secondary btn-xs" id="insp-save-notes">保存笔记</button>
        </div>
      </div>
    </div>
  `;

  // Wire inspector sub-tabs
  const itabs = [...els.jobInspectorPane.querySelectorAll('.inspector-tabs [role="tab"]')];
  const ipanels = [...els.jobInspectorPane.querySelectorAll('[role="tabpanel"]')];
  itabs.forEach((t) => {
    t.addEventListener("click", () => {
      state.inspectorTab = t.id.replace("itab-", "");
      itabs.forEach((x) => x.setAttribute("aria-selected", String(x === t)));
      ipanels.forEach((p) => { p.hidden = p.getAttribute("aria-labelledby") !== t.id; });
    });
  });

  const greetingEl = document.getElementById("insp-greeting");
  const lenEl = document.getElementById("insp-greeting-len");
  greetingEl.addEventListener("input", () => { lenEl.textContent = greetingEl.value.length; });

  els.jobInspectorPane.querySelectorAll("[data-tpl-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.tplIdx);
      const tpl = templates[idx];
      if (!tpl) return;
      greetingEl.value = tpl.text;
      lenEl.textContent = tpl.text.length;
      els.jobInspectorPane.querySelectorAll("[data-tpl-idx]").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  document.getElementById("insp-copy-greeting").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(greetingEl.value);
      els.liveLogLatest.textContent = "已复制沟通话术到剪贴板";
    } catch {
      greetingEl.select();
      document.execCommand("copy");
    }
  });

  document.getElementById("insp-copy-probe")?.addEventListener("click", async () => {
    const txt = document.getElementById("insp-probe-text")?.textContent || "";
    try {
      await navigator.clipboard.writeText(txt);
      els.liveLogLatest.textContent = "已复制 HR 探底 4 连问话术到剪贴板";
    } catch {}
  });

  document.getElementById("insp-open-page").addEventListener("click", async () => {
    const profileId = document.getElementById("insp-profile-select").value;
    setWorkerBusy(true, `正在使用 ${profileId} 打开岗位详情页...`);
    try {
      const res = await api(`/api/jobs/${job.id}/open`, {
        method: "POST",
        body: JSON.stringify({ profileId }),
      });
      alert(`${res.open?.message || "已在 Ego 打开原网页"}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkerBusy(false);
    }
  });

  document.getElementById("insp-ban-btn").addEventListener("click", async () => {
    if (!confirm(`确定将「${job.company_name}」加入避坑黑名单吗？`)) return;
    await api("/api/blacklist", { method: "POST", body: JSON.stringify({ company_name: job.company_name, reason: "工作台拉黑" }) });
    await refreshState();
  });

  document.getElementById("insp-restore-btn")?.addEventListener("click", async () => {
    await api(`/api/jobs/${job.id}/override-filter`, { method: "POST", body: JSON.stringify({ filter_status: "PASS" }) });
    await refreshState();
  });

  document.getElementById("insp-filter-out-btn")?.addEventListener("click", async () => {
    await api(`/api/jobs/${job.id}/override-filter`, { method: "POST", body: JSON.stringify({ filter_status: "FILTERED" }) });
    await refreshState();
  });

  document.getElementById("insp-refresh-intel").addEventListener("click", async () => {
    setWorkerBusy(true, "正在进行工商+背调+口碑三段式尽调...");
    try {
      await api(`/api/jobs/${job.id}/intel`, { method: "POST" });
      await refreshState();
      await renderInspector(true);
    } finally {
      setWorkerBusy(false);
    }
  });

  document.getElementById("insp-calc-commute")?.addEventListener("click", async () => {
    setWorkerBusy(true, "正在测算地址与单车+地铁通勤...");
    try {
      await api(`/api/jobs/${job.id}/commute`, { method: "POST" });
      await refreshState();
      await renderInspector(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkerBusy(false);
    }
  });

  document.getElementById("insp-recalc-btn").addEventListener("click", async () => {
    const profileId = document.getElementById("insp-profile-select").value;
    await api(`/api/jobs/${job.id}/evaluate`, { method: "POST", body: JSON.stringify({ profileId }) });
    await refreshState();
    await renderInspector(true);
  });

  document.getElementById("insp-export-pdf").addEventListener("click", async () => {
    const trackKey = state.data?.settings?.primary_resume_track || "A";
    setWorkerBusy(true, "正在渲染 2 年定制 PDF...");
    try {
      const res = await api(`/api/jobs/${job.id}/pdf`, { method: "POST", body: JSON.stringify({ trackKey }) });
      window.open(res.download_url, "_blank");
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkerBusy(false);
    }
  });

  document.getElementById("insp-save-btn").addEventListener("click", async () => {
    const profileId = document.getElementById("insp-profile-select").value;
    const status = document.getElementById("insp-status-select").value;
    const tailoredSummary = document.getElementById("insp-tailored-summary").value.trim();
    const notes = document.getElementById("insp-notes")?.value ?? job.notes;
    await api(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        assigned_profile_id: profileId,
        status,
        notes,
        custom_greeting: greetingEl.value.trim(),
        tailored_resume: { ...tailored, tailored_summary: tailoredSummary },
      }),
    });
    await refreshState();
  });

  document.getElementById("insp-save-notes")?.addEventListener("click", async () => {
    const notes = document.getElementById("insp-notes").value;
    await api(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ notes }) });
    await refreshState();
    els.liveLogLatest.textContent = "已保存个人跟进笔记";
  });

  const handleDeliver = async (autoSend) => {
    const profileId = document.getElementById("insp-profile-select").value;
    if (autoSend && !confirm("确认直接发送打招呼消息吗？建议优先用「跳转 Boss 沟通页」确认后再点发送及附件简历。")) return;
    setWorkerBusy(true, `正在用 ${profileId} 跳转到 Boss 沟通页`);
    try {
      const res = await api(`/api/jobs/${job.id}/deliver`, {
        method: "POST",
        body: JSON.stringify({
          profileId,
          greetingText: greetingEl.value.trim(),
          autoSend,
          forceCrossTrack: Boolean(conflict),
        }),
      });
      if (res.status === "VERIFICATION_REQUIRED") {
        showVerifyBanner(res);
      } else if (res.delivery?.status === "PREPARED_HANDOFF") {
        alert(`${res.delivery.message}\n请在 Ego 浏览器窗口确认发送话术与附件简历（TaskSpace #${res.delivery.taskSpaceId}）。`);
      } else {
        alert("已发送沟通！");
      }
      await refreshState();
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkerBusy(false);
    }
  };

  document.getElementById("insp-deliver-prefill").addEventListener("click", () => handleDeliver(false));
  document.getElementById("insp-deliver-auto").addEventListener("click", () => handleDeliver(true));
}

function renderResumeCardHtml(r, title, profilesList, isPrimary) {
  return `
    <article class="surface-box" data-resume-track="${esc(r.track_key)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <h3>${esc(title)}</h3>
          <p class="muted">当前绑定：${esc(r.years_label || "2年经验")} · 最近同步：${esc(r.synced_at ? fmtTime(r.synced_at) : "未同步")}</p>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <select class="input-compact" data-sync-profile="${esc(r.track_key)}" aria-label="选择从哪个Ego账号同步">
            ${profilesList.map((p) => `<option value="${esc(p.id)}" ${p.id === (isPrimary ? "Profile 2" : "Profile 1") ? "selected" : ""}>从 ${esc(p.name)} (${esc(p.id)}) 同步</option>`).join("")}
          </select>
          <button type="button" class="btn btn-secondary btn-xs" data-sync-resume="${esc(r.track_key)}">读取线上简历</button>
        </div>
      </div>
      <div class="form-grid">
        <label class="field"><span>候选人名称</span><input type="text" data-field="candidate_name" value="${esc(r.candidate_name)}"></label>
        <label class="field"><span>经验年限标签</span><input type="text" data-field="years_label" value="${esc(r.years_label)}"></label>
      </div>
      <label class="field"><span>个人优势摘要</span><textarea rows="4" data-field="summary">${esc(r.summary)}</textarea></label>
      <label class="field"><span>核心技能（逗号分隔）</span><input type="text" data-field="skills" value="${esc((r.skills || []).join(", "))}"></label>
      <label class="field"><span>工作经历 JSON（事实锁受保护字段）</span><textarea rows="7" data-field="experiences_json">${esc(JSON.stringify(r.experiences || [], null, 2))}</textarea></label>
      <label class="field"><span>项目经历 JSON</span><textarea rows="6" data-field="projects_json">${esc(JSON.stringify(r.projects || [], null, 2))}</textarea></label>
      <div class="right-row">
        <a class="btn btn-ghost btn-xs" href="/resume-print.html?track=${esc(r.track_key)}" target="_blank">预览打印版</a>
        <button type="button" class="btn btn-primary btn-xs" data-save-resume="${esc(r.track_key)}">保存简历母版</button>
      </div>
    </article>
  `;
}

function renderResumes() {
  const { resumes, tracks, settings } = state.data;
  const primaryKey = settings?.primary_resume_track || "A";
  const primary = resumes.find((r) => r.track_key === primaryKey) || resumes[0];
  const secondary = resumes.find((r) => r.track_key !== primary?.track_key);
  const profilesList = state.egoProfiles.length
    ? state.egoProfiles
    : tracks.map((t) => ({ id: t.profile_id, name: t.profile_name }));

  els.resumesContainer.innerHTML =
    (primary ? renderResumeCardHtml(primary, "统一评估主简历（2年经历版）", profilesList, true) : "") +
    (secondary
      ? `<details class="surface-box"><summary class="muted" style="cursor:pointer;">展开备用/历史简历素材（${esc(secondary.years_label || secondary.track_key)}）</summary><div style="margin-top:12px;">${renderResumeCardHtml(secondary, `备用素材 (${secondary.track_key})`, profilesList, false)}</div></details>`
      : "");

  els.resumesContainer.querySelectorAll("[data-sync-resume]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.syncResume;
      const card = btn.closest("[data-resume-track]");
      const profileId = card.querySelector(`[data-sync-profile="${key}"]`)?.value;
      btn.disabled = true;
      setWorkerBusy(true, `正在从 ${profileId || "Ego"} 读取线上简历...`);
      try {
        const res = await api(`/api/resumes/${key}/sync`, {
          method: "POST",
          body: JSON.stringify({ profileId }),
        });
        if (res.status === "VERIFICATION_REQUIRED") showVerifyBanner(res);
        await refreshState();
      } catch (err) {
        alert(err.message);
      } finally {
        setWorkerBusy(false);
        btn.disabled = false;
      }
    });
  });

  els.resumesContainer.querySelectorAll("[data-save-resume]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.saveResume;
      const card = btn.closest("[data-resume-track]");
      try {
        const payload = {
          candidate_name: card.querySelector('[data-field="candidate_name"]').value.trim(),
          years_label: card.querySelector('[data-field="years_label"]').value.trim(),
          summary: card.querySelector('[data-field="summary"]').value.trim(),
          skills: card.querySelector('[data-field="skills"]').value.split(/[,，]+/).map((s) => s.trim()).filter(Boolean),
          experiences: JSON.parse(card.querySelector('[data-field="experiences_json"]').value || "[]"),
          projects: JSON.parse(card.querySelector('[data-field="projects_json"]').value || "[]"),
        };
        await api(`/api/resumes/${key}`, { method: "POST", body: JSON.stringify(payload) });
        await refreshState();
        alert("已保存 2年经历主简历母版！建议点击右上角重算全部岗位评分。");
      } catch (err) {
        alert(`保存失败：${err.message}`);
      }
    });
  });
}

function renderFunnel() {
  const f = state.data?.funnel;
  if (!f) return;
  const replyRate = f.delivered > 0 ? Math.round((f.replied / f.delivered) * 100) : 0;
  const ivRate = f.delivered > 0 ? Math.round((f.interviews / f.delivered) * 100) : 0;
  els.funnelCards.innerHTML = `
    <div class="funnel-card">
      <strong>精筛岗位池</strong>
      <div class="muted">精选保留 ${esc(f.eligible_jobs ?? f.total_jobs)} 条（总抓 ${esc(f.total_jobs)}）</div>
      <div class="muted">自动过滤杂岗 ${esc(f.filtered_out ?? 0)} 条 · 黑名单拦截 ${esc(f.skipped)} 条</div>
    </div>
    <div class="funnel-card">
      <strong>匹配决策分布</strong>
      <div class="muted">可直接投：${esc(f.direct_apply ?? 0)} 条</div>
      <div class="muted">改后投：${esc(f.revise_first ?? 0)} 条 · 偏低：${esc(f.low_fit ?? 0)} 条</div>
    </div>
    <div class="funnel-card">
      <strong>沟通转化统计</strong>
      <div class="muted">实投 ${esc(f.delivered ?? 0)} · 回复 ${esc(f.replied ?? 0)} (${replyRate}%)</div>
      <div class="muted">约面 ${esc(f.interviews ?? 0)} (${ivRate}%)</div>
    </div>
  `;

  renderScrapeTelemetry();
}

function renderScrapeTelemetry() {
  const st = state.data?.scrape_telemetry;
  const runs = state.data?.patrol_runs || [];
  if (!st || !els.patrolKpiStrip) return;

  const quotaBadge = st.today_quota_filled
    ? `<span class="zone-tag zone-GREEN" style="margin-left:4px;">今日已抓满</span>`
    : st.today_ran
      ? `<span class="zone-tag zone-YELLOW" style="margin-left:4px;">今日未满/中断</span>`
      : `<span class="meta-pill" style="margin-left:4px;">今日待巡检</span>`;

  els.patrolKpiStrip.innerHTML = `
    <div class="funnel-card">
      <strong>今日巡检配额 ${quotaBadge}</strong>
      <div style="font-size:15px;font-weight:700;">${esc(st.today_patrol_scanned)} / ${esc(st.planned_quota)} 条次</div>
      <div class="muted">${esc(st.keyword_count)} 词 × ${esc(st.profiles_count)} 账号 × ${esc(st.max_per_keyword)} 条/词</div>
    </div>
    <div class="funnel-card">
      <strong>今日首次新抓与留存</strong>
      <div style="font-size:15px;font-weight:700;">新抓 ${esc(st.today_new_count)} → 留下 ${esc(st.today_new_kept)} 条</div>
      <div class="muted">今日规则过滤 ${esc(st.today_new_filtered)} 条（含 &lt;7K / 异地 / 非测岗）</div>
    </div>
    <div class="funnel-card">
      <strong>历史累计去重入库</strong>
      <div style="font-size:15px;font-weight:700;">总计 ${esc(st.total_jobs)} → 留下 ${esc(st.total_kept)} 条</div>
      <div class="muted">累计过滤 ${esc(st.total_filtered)} 条 · 留存率 ${st.total_jobs > 0 ? Math.round((st.total_kept / st.total_jobs) * 100) : 0}%</div>
    </div>
    <div class="funnel-card">
      <strong>9-12K 高权重精选池</strong>
      <div style="font-size:15px;font-weight:700;">${esc(st.salary_ideal_count)} 条理想薪资</div>
      <div class="muted">可在岗位工作台一点筛选直投</div>
    </div>
  `;

  if (els.patrolRunsTableBody) {
    els.patrolRunsTableBody.innerHTML = runs.length
      ? runs
          .map((r) => {
            const quotaTxt = r.planned_quota ? `${r.scanned_count}/${r.planned_quota}` : `${r.scanned_count}`;
            const statusText = r.status === "OK"
              ? (r.planned_quota && r.scanned_count >= r.planned_quota ? "已满完成" : "已完成")
              : "验证中断";
            const modeText = r.mode === "SINGLE" ? "单词采集" : "每日巡检";
            const timeShort = r.finished_at ? fmtTime(r.finished_at).slice(5, 16) : r.run_date;
            return `
              <tr>
                <td><strong>${esc(timeShort)}</strong> <span class="muted">${esc(modeText)}</span><div class="muted">${esc((r.profiles || []).join("+"))}</div></td>
                <td>${esc(quotaTxt)}</td>
                <td>${esc(r.new_count)}</td>
                <td class="num-kept">${esc(r.kept_count)} <span class="num-filt">(/ 滤${esc(r.filtered_count)})</span></td>
                <td><span class="meta-pill">${esc(statusText)}</span></td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="5" class="muted">暂无巡检批次记录。</td></tr>`;
  }

  if (els.dailyBreakdownTableBody) {
    const days = st.by_day || [];
    els.dailyBreakdownTableBody.innerHTML = days.length
      ? days
          .map((d) => `
            <tr>
              <td><strong>${esc(d.run_date)}</strong></td>
              <td>${esc(d.new_count)} 条</td>
              <td class="num-kept">${esc(d.kept_count)} 条</td>
              <td class="num-filt">${esc(d.filtered_count)} 条</td>
            </tr>
          `)
          .join("")
      : `<tr><td colspan="4" class="muted">暂无每日记录。</td></tr>`;
  }

  if (els.keywordStatsTableBody) {
    const kws = st.by_keyword || [];
    els.keywordStatsTableBody.innerHTML = kws.length
      ? kws
          .map((k) => {
            const pct = k.total > 0 ? Math.round((k.kept / k.total) * 100) : 0;
            return `
              <tr>
                <td><strong>${esc(k.keyword)}</strong></td>
                <td>${esc(k.total)} 条</td>
                <td class="num-kept">${esc(k.kept)} 条</td>
                <td class="num-filt">${esc(k.filtered)} 条</td>
                <td>${pct}%</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="5" class="muted">暂无关键词明细。</td></tr>`;
  }
}

function renderBlacklist() {
  const items = state.data?.blacklist || [];
  if (items.length === 0) {
    els.blacklistItems.innerHTML = `<span class="muted">暂无黑名单公司。</span>`;
    return;
  }
  els.blacklistItems.innerHTML = items
    .map((b) => `<span class="blacklist-pill"><span>${esc(b.company_name)}</span><button type="button" data-del-blacklist="${b.id}" aria-label="移除">×</button></span>`)
    .join("");
  els.blacklistItems.querySelectorAll("[data-del-blacklist]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/blacklist/${btn.dataset.delBlacklist}`, { method: "DELETE" });
      await refreshState();
    });
  });
}

function renderSettings() {
  const { tracks, settings } = state.data;
  const profilesList = state.egoProfiles.length
    ? state.egoProfiles
    : tracks.map((t) => ({ id: t.profile_id, name: t.profile_name }));

  els.tracksConfigList.innerHTML = tracks
    .map(
      (t, idx) => `
      <div class="log-item">
        <div class="form-grid">
          <div class="field">
            <span>账号槽位 ${idx + 1} ${t.breaker_active ? '<strong style="color:var(--red-fg)">(今日熔断中)</strong>' : ""}</span>
            <input type="text" value="${esc(t.profile_name)}" data-track-name="${esc(t.track_key)}">
          </div>
          <label class="field">
            <span>绑定 Ego Profile</span>
            <select data-track-profile="${esc(t.track_key)}">
              ${profilesList.map((p) => `<option value="${esc(p.id)}" data-name="${esc(p.name)}" ${p.id === t.profile_id ? "selected" : ""}>${esc(p.name)} (${esc(p.id)})</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>日投递上限</span>
            <input type="number" min="1" max="60" value="${esc(t.daily_limit)}" data-track-limit="${esc(t.track_key)}">
          </label>
          <div class="right-row">
            <button type="button" class="btn btn-secondary btn-xs" data-save-track="${esc(t.track_key)}">更新绑定</button>
            ${t.breaker_active ? `<button type="button" class="btn btn-ghost btn-xs" data-clear-breaker="${esc(t.track_key)}">解除熔断</button>` : ""}
          </div>
        </div>
      </div>
    `
    )
    .join("");

  els.tracksConfigList.querySelectorAll("[data-save-track]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const k = btn.dataset.saveTrack;
      const sel = els.tracksConfigList.querySelector(`[data-track-profile="${k}"]`);
      const nameInput = els.tracksConfigList.querySelector(`[data-track-name="${k}"]`);
      const opt = sel.selectedOptions[0];
      const limit = Number(els.tracksConfigList.querySelector(`[data-track-limit="${k}"]`).value) || 25;
      await api(`/api/tracks/${k}`, {
        method: "POST",
        body: JSON.stringify({
          profile_id: sel.value,
          profile_name: nameInput.value.trim() || opt?.dataset?.name || sel.value,
          daily_limit: limit,
        }),
      });
      await refreshState();
    });
  });

  els.tracksConfigList.querySelectorAll("[data-clear-breaker]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/tracks/${btn.dataset.clearBreaker}/clear-breaker`, { method: "POST" });
      await refreshState();
    });
  });

  const form = els.settingsForm;
  form.watchlist_text.value = state.watchlist.join("、");
  form.home_address.value = settings.home_address || "";
  form.home_city.value = settings.home_city || "广州";
  if (form.scrape_max_jobs) form.scrape_max_jobs.value = settings.scrape_max_jobs || "10";
  form.daily_check_enabled.value = settings.daily_check_enabled || "true";
  form.daily_check_time.value = settings.daily_check_time || "09:30";
  form.scan_mode.value = settings.scan_mode === "single" ? "single" : "both";
  form.filter_exp_mode.value = settings.filter_exp_mode || "prefer_1_3_allow_3_5";
  form.filter_exclude_intern.value = settings.filter_exclude_intern || "true";
  form.filter_exclude_non_qa.value = settings.filter_exclude_non_qa || "true";
  if (form.filter_min_salary_k) form.filter_min_salary_k.value = settings.filter_min_salary_k ?? "7";
  if (form.target_salary_min_k) form.target_salary_min_k.value = settings.target_salary_min_k ?? "9";
  if (form.target_salary_max_k) form.target_salary_max_k.value = settings.target_salary_max_k ?? "12";
  if (form.filter_exclude_remote) form.filter_exclude_remote.value = settings.filter_exclude_remote || "true";
  form.delay_min_ms.value = settings.delay_min_ms || "4500";
  form.delay_max_ms.value = settings.delay_max_ms || "8500";
  form.auto_web_search.value = settings.auto_web_search || "true";
  form.auto_check_update.value = settings.auto_check_update || "true";
  form.github_repo.value = settings.github_repo || "ShawnLi-code/boss-ai-router";
  form.llm_base_url.value = settings.llm_base_url || "";
  form.llm_model.value = settings.llm_model || "";
  form.llm_api_key.value = settings.llm_api_key || "";
  if (settings.min_hr_active) els.scrapeHrActive.value = settings.min_hr_active;
}

function renderDeliveryLogs() {
  const logs = state.data?.logs || [];
  if (logs.length === 0) {
    els.deliveryLogsList.innerHTML = `<p class="muted">暂无沟通记录。</p>`;
    return;
  }
  els.deliveryLogsList.innerHTML = logs
    .map((l) => `
      <div class="log-item">
        <strong>${esc(l.company_name)}</strong> · ${esc(l.profile_id)} · <span class="meta-pill">${esc(l.status)}</span>
        <div class="muted">${esc(fmtTime(l.created_at))} — ${esc(l.detail)}</div>
      </div>
    `)
    .join("");
}

// Watchlist drawer handlers
els.btnAddWatchlist.addEventListener("click", () => {
  const kw = els.newWatchlistKw.value.trim();
  if (!kw) return;
  if (!state.watchlist.includes(kw)) state.watchlist.push(kw);
  state.selectedWatchlist.add(kw);
  els.newWatchlistKw.value = "";
  renderWatchlistChips();
});

els.btnSaveWatchlist.addEventListener("click", async () => {
  await api("/api/settings", {
    method: "POST",
    body: JSON.stringify({ watchlist_keywords: JSON.stringify(state.watchlist) }),
  });
  await refreshState();
  els.liveLogLatest.textContent = `已保存 ${state.watchlist.length} 类目标岗位到每日巡检清单`;
});

// GitHub Update Flow
async function checkUpdates({ openModal = false, silent = false } = {}) {
  if (openModal) {
    els.updateStatusText.textContent = "正在连接 GitHub Releases 检查更新...";
    els.updateNotesBox.hidden = true;
    els.updateProgressWrap.hidden = true;
    els.btnApplyUpdate.hidden = true;
    if (!els.updateModal.open) els.updateModal.showModal();
  }
  try {
    const info = await api("/api/update/check");
    state.latestUpdate = info;
    els.updateReleaseLink.href = info.release_url || "https://github.com/ShawnLi-code/boss-ai-router/releases";
    if (info.has_update) {
      els.updateBannerTitle.textContent = `发现新版本 v${info.latest_version}（当前 v${info.current_version}）`;
      els.updateBannerDesc.textContent = info.asset ? `可应用内更新 (${info.asset.name})` : "点击查看 Release";
      els.updateBanner.hidden = false;
    }
    if (openModal || !silent) {
      els.updateStatusText.textContent = info.message;
      if (info.release_notes) {
        els.updateNotesBox.textContent = info.release_notes;
        els.updateNotesBox.hidden = false;
      }
      els.btnApplyUpdate.hidden = !(info.has_update && info.asset?.download_url);
      if (!els.updateModal.open && !silent) els.updateModal.showModal();
    }
  } catch (err) {
    if (openModal) els.updateStatusText.textContent = `检查更新出错：${err.message}`;
  }
}

els.btnCheckUpdate.addEventListener("click", () => checkUpdates({ openModal: true }));
els.btnOpenUpdateModal.addEventListener("click", () => checkUpdates({ openModal: true }));
els.btnDismissUpdateBanner.addEventListener("click", () => { els.updateBanner.hidden = true; });

els.btnApplyUpdate.addEventListener("click", async () => {
  const info = state.latestUpdate;
  if (!info?.asset?.download_url) return;
  els.btnApplyUpdate.disabled = true;
  els.updateProgressWrap.hidden = false;
  els.updateProgress.value = 0;
  els.updateProgressLabel.textContent = `正在下载 ${info.asset.name}...`;
  els.updateStatusText.textContent = "正在下载更新包，完成后将自动启动安装并重启应用...";
  try {
    const res = await api("/api/update/apply", {
      method: "POST",
      body: JSON.stringify({ download_url: info.asset.download_url, file_name: info.asset.name }),
    });
    els.updateStatusText.textContent = `更新包已就绪（${res.mode}），即将重启...`;
  } catch (err) {
    els.updateStatusText.textContent = `更新失败：${err.message}`;
    els.btnApplyUpdate.disabled = false;
  }
});

// Actions: Daily Multi-Keyword Patrol & Single Keyword Scrape & Re-score
els.btnPatrol.addEventListener("click", async () => {
  const keywords = [...state.selectedWatchlist];
  if (keywords.length === 0) return alert("请至少勾选 1 个目标岗位关键词");
  const modeVal = els.scrapeMode.value;
  const isSingle = modeVal.startsWith("single:");
  const scanMode = isSingle ? "single" : "both";
  const profileId = isSingle ? modeVal.slice("single:".length) : undefined;

  setWorkerBusy(true, `正在低速巡检 ${keywords.length} 类岗位...`);
  try {
    const res = await api("/api/jobs/patrol", {
      method: "POST",
      body: JSON.stringify({
        keywords,
        city: els.scrapeCity.value,
        minHrActive: els.scrapeHrActive.value,
        maxPerKeyword: Number(els.scrapeMax.value) || 5,
        scanMode,
        profileId,
      }),
    });
    if (res.status === "VERIFICATION_REQUIRED") {
      showVerifyBanner(res);
    } else {
      els.liveLogLatest.textContent = res.summary || `巡检完成，新增/更新 ${res.savedCount} 条岗位`;
    }
    await refreshState();
  } catch (err) {
    alert(err.message);
  } finally {
    setWorkerBusy(false);
  }
});

els.btnScrape.addEventListener("click", async () => {
  const modeVal = els.scrapeMode.value;
  const profileId = modeVal.startsWith("single:")
    ? modeVal.slice("single:".length)
    : (state.egoProfiles[0]?.id || "Profile 1");
  setWorkerBusy(true, "正在低速采集单关键词...");
  try {
    const res = await api("/api/jobs/scrape", {
      method: "POST",
      body: JSON.stringify({
        query: els.scrapeQuery.value.trim() || "AI测试",
        city: els.scrapeCity.value,
        minHrActive: els.scrapeHrActive.value,
        maxJobs: Number(els.scrapeMax.value) || 5,
        profileId,
      }),
    });
    if (res.status === "VERIFICATION_REQUIRED") showVerifyBanner(res);
    await refreshState();
  } catch (err) {
    alert(err.message);
  } finally {
    setWorkerBusy(false);
  }
});

async function reEvaluateAll() {
  setWorkerBusy(true, "正在用 2 年经历主简历重算全部岗位评分...");
  try {
    const res = await api("/api/jobs/re-evaluate-all", { method: "POST" });
    await refreshState();
    els.liveLogLatest.textContent = `已重算全部 ${res.count} 条岗位匹配度与建议`;
  } catch (err) {
    alert(err.message);
  } finally {
    setWorkerBusy(false);
  }
}

els.btnRecalcAll.addEventListener("click", reEvaluateAll);
els.btnRecalcFromResumes.addEventListener("click", reEvaluateAll);

els.btnPurgeFiltered.addEventListener("click", async () => {
  const cnt = Number(els.cntFiltered.textContent || 0);
  if (!confirm(`确定从本地数据库清理掉这 ${cnt} 条已过滤的实习/开发/产品/超龄杂岗吗？（已投递或人工放行的不会删除）`)) return;
  await api("/api/jobs/purge-filtered", { method: "POST" });
  await refreshState();
});

els.btnCalcCommute.addEventListener("click", async () => {
  setWorkerBusy(true, "正在补全办公地址并测算单车+地铁通勤...");
  try {
    const res = await api("/api/jobs/enrich-commute", { method: "POST", body: JSON.stringify({}) });
    await refreshState();
    els.liveLogLatest.textContent = `已完成 ${res.updated} 个精选岗位的单车+地铁通勤测算`;
  } catch (err) {
    alert(err.message);
  } finally {
    setWorkerBusy(false);
  }
});

els.btnOpenImport.addEventListener("click", () => els.importModal.showModal());

els.btnFillSampleJobs.addEventListener("click", () => {
  els.importJsonInput.value = JSON.stringify(
    [
      {
        job_title: "AI大模型测试工程师",
        company_name: "微众银行金融科技合作部",
        scale: "1000-9999人",
        financing: "已上市",
        industry: "银行/金融",
        recruiter_title: "HRBP",
        salary_range: "20-30K",
        experience_req: "1-3年",
        education_req: "本科",
        jd_text: "负责大模型与RAG智能问答系统的效果评测、接口自动化及Pytest框架维护，要求严格背调与个税流水核验。",
      },
      {
        job_title: "AI应用测试工程师",
        company_name: "广州灵眸跃动科技有限公司",
        scale: "20-99人",
        financing: "天使轮",
        industry: "人工智能",
        recruiter_title: "测试经理",
        salary_range: "12-18K",
        experience_req: "1-3年",
        education_req: "本科",
        jd_text: "急招！独立负责Web及移动端测试体系从0到1搭建，主要做大模型Prompt评测、RAG知识库检索验证、Python+Pytest接口自动化与Playwright，非外包。",
      },
      {
        job_title: "AI模型测试工程师（接受小白无经验）",
        company_name: "星途实训科技有限公司",
        scale: "20-99人",
        financing: "未融资",
        industry: "教育培训",
        recruiter_title: "HR",
        salary_range: "15-25K",
        jd_text: "接受小白无经验转行，岗前实训包教包会，推荐就业。",
      },
    ],
    null,
    2
  );
});

els.importForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const parsed = JSON.parse(els.importJsonInput.value);
    els.liveLogLatest.textContent = "正在按 2 年经历主简历评估匹配度与背调...";
    await api("/api/jobs/import", {
      method: "POST",
      body: JSON.stringify({ jobs: Array.isArray(parsed) ? parsed : [parsed] }),
    });
    els.importModal.close();
    await refreshState();
  } catch (err) {
    alert(`导入失败：${err.message}`);
  }
});

els.blacklistForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = els.blacklistInput.value.trim();
  if (!text) return;
  await api("/api/blacklist", { method: "POST", body: JSON.stringify({ text }) });
  els.blacklistInput.value = "";
  await refreshState();
});

els.settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(els.settingsForm);
  const rawObj = Object.fromEntries(fd.entries());
  const kwList = String(rawObj.watchlist_text || "")
    .split(/[\r\n,，、]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  delete rawObj.watchlist_text;
  if (kwList.length > 0) rawObj.watchlist_keywords = JSON.stringify([...new Set(kwList)]);
  if (Number(rawObj.delay_min_ms) < 3000) rawObj.delay_min_ms = "3000";
  await api("/api/settings", { method: "POST", body: JSON.stringify(rawObj) });
  await refreshState();
  alert("巡检计划与系统配置已保存");
});

els.verifyDoneBtn.addEventListener("click", async () => {
  if (state.pendingVerifySpaceId) {
    await api(`/api/ego/spaces/${state.pendingVerifySpaceId}/finish`, { method: "POST" }).catch(() => {});
  }
  state.pendingVerifySpaceId = null;
  els.verifyBanner.hidden = true;
});

els.verifyDismissBtn.addEventListener("click", () => { els.verifyBanner.hidden = true; });

const evt = new EventSource("/api/events");
evt.addEventListener("log", (e) => { els.liveLogLatest.textContent = JSON.parse(e.data).message; });
evt.addEventListener("patrol-progress", (e) => {
  const p = JSON.parse(e.data);
  if (p.done) return;
  els.liveLogLatest.textContent = `巡检 [${p.step}/${p.total}] ${p.profileId} · ${p.keyword}（已累计 ${p.savedCount} 条）`;
});
evt.addEventListener("verification", (e) => showVerifyBanner(JSON.parse(e.data)));
evt.addEventListener("update-progress", (e) => {
  const p = JSON.parse(e.data);
  els.updateProgress.value = p.percent || 0;
  els.updateProgressLabel.textContent = `已下载 ${p.percent || 0}%`;
});

await refreshState();
loadEgoProfiles();
if (state.data?.settings?.auto_check_update !== "false") {
  checkUpdates({ silent: true });
}
