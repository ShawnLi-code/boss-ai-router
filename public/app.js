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
  editingResumeCtx: null,
  deliveryFilter: "ALL",
  deliveryMaterial: "ALL",
  deliveryProfile: "ALL",
  deliverySearch: "",
  followupJobId: null,
  followupProfileId: null,
  followupMessages: [],
  followupCanSendImg: false,
  followupAdvice: null,
  batchMode: false,
  batchSelectedIds: new Set(),
  batchRunning: false,
  batchAbortRequested: false,
};

const els = {
  versionTag: document.getElementById("app-version-tag"),
  navJobsCount: document.getElementById("nav-jobs-count"),
  navDeliveriesCount: document.getElementById("nav-deliveries-count"),
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
  btnCalcCommute: document.getElementById("btn-calc-commute"),
  cntAll: document.getElementById("cnt-all"),
  cntSalaryIdeal: document.getElementById("cnt-salary-ideal"),
  cntContacted: document.getElementById("cnt-contacted"),
  cntFiltered: document.getElementById("cnt-filtered"),
  cntDeliveryLogs: document.getElementById("cnt-delivery-logs"),
  btnPurgeFiltered: document.getElementById("btn-purge-filtered"),
  jobSearchInput: document.getElementById("job-search-input"),
  jobCommuteFilter: document.getElementById("job-commute-filter"),
  jobSortSelect: document.getElementById("job-sort-select"),
  jobListPane: document.getElementById("job-list-pane"),
  jobInspectorPane: document.getElementById("job-inspector-pane"),
  liveLogLatest: document.getElementById("live-log-latest"),
  resumesContainer: document.getElementById("resumes-container"),
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
  deliveryKpiStrip: document.getElementById("delivery-kpi-strip"),
  deliveriesList: document.getElementById("deliveries-list"),
  deliveryMaterialFilter: document.getElementById("delivery-material-filter"),
  deliveryProfileFilter: document.getElementById("delivery-profile-filter"),
  deliverySearchInput: document.getElementById("delivery-search-input"),
  btnSyncBossChats: document.getElementById("btn-sync-boss-chats"),
  followupModal: document.getElementById("followup-modal"),
  followupModalSub: document.getElementById("followup-modal-sub"),
  followupSyncBtn: document.getElementById("followup-sync-btn"),
  followupImgUnlockPill: document.getElementById("followup-img-unlock-pill"),
  followupChatThread: document.getElementById("followup-chat-thread"),
  followupManualHrInput: document.getElementById("followup-manual-hr-input"),
  followupRecalcBtn: document.getElementById("followup-recalc-btn"),
  followupIntentTitle: document.getElementById("followup-intent-title"),
  followupStrategyTip: document.getElementById("followup-strategy-tip"),
  followupTemplatesList: document.getElementById("followup-templates-list"),
  followupReplyLen: document.getElementById("followup-reply-len"),
  followupReplyTextarea: document.getElementById("followup-reply-textarea"),
  followupSendImgChk: document.getElementById("followup-send-img-chk"),
  followupPreviewImgBtn: document.getElementById("followup-preview-img-btn"),
  followupCopyBtn: document.getElementById("followup-copy-btn"),
  followupSendBtn: document.getElementById("followup-send-btn"),
  btnToggleBatch: document.getElementById("btn-toggle-batch"),
  batchDeliverBar: document.getElementById("batch-deliver-bar"),
  btnBatchSelectNew: document.getElementById("btn-batch-select-new"),
  btnBatchClear: document.getElementById("btn-batch-clear"),
  batchSelectedCount: document.getElementById("batch-selected-count"),
  batchTemplateStyle: document.getElementById("batch-template-style"),
  batchProfileSelect: document.getElementById("batch-profile-select"),
  batchSendImgChk: document.getElementById("batch-send-img-chk"),
  btnBatchDeliver: document.getElementById("btn-batch-deliver"),
  btnBatchStop: document.getElementById("btn-batch-stop"),
  batchProgressText: document.getElementById("batch-progress-text"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  resumeEditModal: document.getElementById("resume-edit-modal"),
  resumeEditTitle: document.getElementById("resume-edit-modal-title"),
  resumeEditForm: document.getElementById("resume-edit-form"),
  resumeEditFields: document.getElementById("resume-edit-fields"),
  resumeEditCancel: document.getElementById("resume-edit-cancel"),
  imagePreviewModal: document.getElementById("image-preview-modal"),
  imagePreviewFull: document.getElementById("image-preview-full"),
};

const STATUS_LABELS = {
  NEW: "待沟通",
  SKIP: "已拦截",
  PREPARED: "已打开聊天",
  DELIVERED: "已打招呼",
  REPLIED: "HR已回复",
  INTERVIEW: "已约面试",
  REJECTED: "不合适/结束",
};

const CONTACTED_STATUSES = new Set(["PREPARED", "DELIVERED", "REPLIED", "INTERVIEW"]);

const ADVICE_LABELS = {
  DIRECT_APPLY: "推荐沟通",
  REVISE_FIRST: "匹配良好",
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
  if (els.btnScrape) els.btnScrape.disabled = busy;
  if (els.btnPatrol) els.btnPatrol.disabled = busy;
}

function showVerifyBanner(payload) {
  state.pendingVerifySpaceId = payload.taskSpaceId || null;
  els.verifyTitle.textContent = `需要人工安全验证（TaskSpace #${payload.taskSpaceId ?? "-"} · 已自动暂停保护账号）`;
  els.verifyDesc.textContent = payload.message || "请在 Ego 浏览器完成验证后点击右侧恢复。";
  els.verifyBanner.hidden = false;
}

async function copyResumeImageToClipboard() {
  const meta = state.data?.resume_image;
  if (!meta?.exists) {
    throw new Error("当前还没有生成图片简历，请先在「我的简历」右侧上传 PDF 或生成图片简历");
  }
  const resp = await fetch(meta.url);
  if (!resp.ok) throw new Error("读取图片简历失败");
  const blob = await resp.blob();
  let pngBlob = blob;
  if (blob.type !== "image/png") {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext("2d").drawImage(bmp, 0, 0);
    pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
}

// Sidebar navigation
const navItems = [...document.querySelectorAll(".nav-item[data-view]")];
const viewPanes = {
  jobs: document.getElementById("view-jobs"),
  resumes: document.getElementById("view-resumes"),
  deliveries: document.getElementById("view-deliveries"),
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

// Dialog light-dismiss fallback & returnValue reset per modern-web-guidance
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

els.resumeEditCancel?.addEventListener("click", () => els.resumeEditModal.close());

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
    els.btnPurgeFiltered.hidden = state.activeFilter !== "FILTERED" || Number(els.cntFiltered.textContent || 0) === 0;
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
    const firstPass = data.jobs.find((j) => (j.filter_status || "PASS") === "PASS") || data.jobs[0];
    state.selectedJobId = firstPass.id;
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

function profileDisplayName(profileId) {
  const tr = (state.data?.tracks || []).find((t) => t.profile_id === profileId);
  if (tr?.profile_name) return tr.profile_name;
  const ep = (state.egoProfiles || []).find((p) => p.id === profileId);
  return ep?.name || profileId || "默认账号";
}

function updateBatchBarUi() {
  if (!els.batchDeliverBar || !els.btnToggleBatch) return;
  els.batchDeliverBar.hidden = !state.batchMode;
  els.btnToggleBatch.classList.toggle("active", state.batchMode);
  els.btnToggleBatch.textContent = state.batchMode ? "✅ 退出多选" : "☑️ 多选投递";

  const count = state.batchSelectedIds.size;
  if (els.batchSelectedCount) els.batchSelectedCount.textContent = String(count);
  if (els.btnBatchDeliver) {
    els.btnBatchDeliver.disabled = state.batchRunning || count === 0;
    els.btnBatchDeliver.textContent = state.batchRunning
      ? "⏳ 批量投递中..."
      : `🚀 批量一键打招呼 (${count})`;
  }
  if (els.btnBatchStop) els.btnBatchStop.hidden = !state.batchRunning;

  if (els.batchProfileSelect && state.data) {
    const tracks = state.data.tracks || [];
    const pool = state.egoProfiles.length ? state.egoProfiles : tracks.map((t) => ({ id: t.profile_id, name: t.profile_name }));
    const prev = els.batchProfileSelect.value || "auto";
    els.batchProfileSelect.innerHTML = `<option value="auto">🤖 智能分流防撞车</option>` + pool.map((p) => {
      const tr = tracks.find((t) => t.profile_id === p.id);
      const qTxt = tr ? ` (${tr.today_delivered}/${tr.daily_limit}${tr.breaker_active ? " 暂停" : ""})` : "";
      return `<option value="${esc(p.id)}" ${prev === p.id ? "selected" : ""}>${esc(profileDisplayName(p.id))}${esc(qTxt)}</option>`;
    }).join("");
  }
  if (els.batchSendImgChk && state.data) {
    const hasImg = Boolean(state.data.resume_image?.exists);
    els.batchSendImgChk.disabled = !hasImg;
    if (!hasImg) els.batchSendImgChk.checked = false;
  }
}

function renderAll() {
  if (!state.data) return;
  renderSidebarSummary();
  renderWatchlistChips();
  renderProfileSelectors();
  updateBatchBarUi();
  renderJobList();
  renderInspector();
  renderResumes();
  renderDeliveries();
  renderFunnel();
  renderBlacklist();
  renderSettings();
  renderDeliveryLogs();
}

function renderSidebarSummary() {
  const { jobs, tracks, settings, logs = [] } = state.data;
  const eligible = jobs.filter((j) => (j.filter_status || "PASS") === "PASS");
  const contacted = jobs.filter((j) => CONTACTED_STATUSES.has(j.status));
  const filtered = jobs.filter((j) => j.filter_status === "FILTERED");

  els.navJobsCount.textContent = eligible.length;
  if (els.navDeliveriesCount) {
    const deliveredJobsCount = Math.max(
      contacted.length,
      new Set(logs.filter((l) => l.status === "DELIVERED").map((l) => l.job_id)).size
    );
    els.navDeliveriesCount.textContent = deliveredJobsCount;
  }
  els.cntAll.textContent = eligible.length;
  els.cntSalaryIdeal.textContent = eligible.filter((j) => j.match?.salary_fit?.highlighted).length;
  els.cntContacted.textContent = contacted.length;
  els.cntFiltered.textContent = filtered.length;
  if (els.cntDeliveryLogs) els.cntDeliveryLogs.textContent = getDeliveryAttemptLogs().length;
  els.btnPurgeFiltered.hidden = state.activeFilter !== "FILTERED" || filtered.length === 0;

  const t1 = tracks[0];
  const t2 = tracks[1];
  if (t1) {
    els.sideALabel.textContent = t1.profile_name || t1.profile_id;
    els.sideAQuota.textContent = `${t1.today_delivered}/${t1.daily_limit}${t1.breaker_active ? " 暂停" : ""}`;
  }
  if (t2) {
    els.sideBLabel.textContent = t2.profile_name || t2.profile_id;
    els.sideBQuota.textContent = `${t2.today_delivered}/${t2.daily_limit}${t2.breaker_active ? " 暂停" : ""}`;
  }

  const st = state.data?.scrape_telemetry;
  const today = new Date().toLocaleDateString("sv-SE");
  if (st && st.today_ran) {
    const quotaText = st.today_quota_filled
      ? `今日已抓满 (${st.today_patrol_scanned}/${st.planned_quota})`
      : `今日已抓 ${st.today_patrol_scanned}/${st.planned_quota}`;
    els.sidePatrolStatus.textContent = `巡检：${quotaText}`;
  } else if (settings?.last_daily_check_date === today) {
    els.sidePatrolStatus.textContent = "今日巡检：已完成";
  } else {
    els.sidePatrolStatus.textContent = settings?.daily_check_enabled === "true"
      ? `自动巡检：${settings.daily_check_time || "09:30"}`
      : "巡检：手动触发";
  }
  if (els.sideScrapeRetention && st) {
    els.sideScrapeRetention.textContent = `今日新 ${st.today_new_count} 留 ${st.today_new_kept} · 累计留 ${st.total_kept} →`;
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
    `<option value="both" ${current === "both" ? "selected" : ""}>双号轮刷（自动去重）</option>`,
    ...list.map((p) => {
      const v = `single:${p.id}`;
      return `<option value="${esc(v)}" ${current === v ? "selected" : ""}>仅用 ${esc(profileDisplayName(p.id))}</option>`;
    }),
  ];
  els.scrapeMode.innerHTML = options.join("");
}

function adviceTagHtml(advice, score) {
  const key = advice || "REVISE_FIRST";
  const label = ADVICE_LABELS[key] || "可沟通";
  return `<span class="zone-tag advice-${esc(key)}">${esc(score)}分 · ${esc(label)}</span>`;
}

function zoneTagHtml(zone, score) {
  const map = { GREEN: "企业稳健", YELLOW: "常规留意", RED: "风险预警", SKIP: "黑名单拦截" };
  const text = map[zone] || `风控 ${score}`;
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

function deliveryBadgeHtml(job) {
  const imgDel = job.tailored_resume?.image_delivery;
  if (imgDel === "SENT") {
    return `<span class="zone-tag zone-GREEN">已发送文字+图片</span>`;
  }
  if (CONTACTED_STATUSES.has(job.status)) {
    return `<span class="zone-tag zone-GREEN">${esc(STATUS_LABELS[job.status] || "已发送文字")}</span>`;
  }
  return `<span class="muted" style="margin-left:auto;">${esc(STATUS_LABELS[job.status] || job.status)}</span>`;
}

function getFilteredSortedJobs() {
  const all = state.data?.jobs || [];
  let list = all.filter((j) => {
    const isFiltered = j.filter_status === "FILTERED";
    if (state.activeFilter === "FILTERED") {
      if (!isFiltered) return false;
    } else if (state.activeFilter === "CONTACTED") {
      if (!CONTACTED_STATUSES.has(j.status)) return false;
    } else {
      if ((j.filter_status || "PASS") !== "PASS") return false;
      if (state.activeFilter === "SALARY_IDEAL" && !j.match?.salary_fit?.highlighted) return false;
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
  }
  return list;
}

function getDeliveryAttemptLogs() {
  return (state.data?.logs || []).filter(
    (l) => l.action !== "BOSS_HISTORY_SYNC" && l.action !== "MANUAL_SYNC"
  );
}

function renderDeliveryAttemptRows() {
  let rows = getDeliveryAttemptLogs();
  if (state.searchText) {
    rows = rows.filter((l) => {
      const hay = `${l.job_title || ""} ${l.company_name || ""} ${profileDisplayName(l.profile_id)} ${l.detail || ""} ${l.greeting_text || ""}`.toLowerCase();
      return hay.includes(state.searchText);
    });
  }
  if (rows.length === 0) {
    els.jobListPane.innerHTML = `<div class="empty-state">暂无投递记录；发起打招呼或批量投递后，成功与失败明细都会记录在这里。</div>`;
    return;
  }

  const jobMap = new Map((state.data?.jobs || []).map((j) => [j.id, j]));
  els.jobListPane.innerHTML = rows
    .map((l) => {
      const selected = l.job_id && Number(l.job_id) === state.selectedJobId;
      const linkedJob = jobMap.get(l.job_id);
      const salary = l.salary_range || linkedJob?.salary_range || "";
      const isFailed = l.status === "FAILED";
      const isVerify = l.status === "VERIFICATION";
      const isPrepared = l.status === "PREPARED";
      let statusBadge = "";
      if (isFailed) {
        statusBadge = `<span class="zone-tag zone-RED">❌ 失败</span>`;
      } else if (isVerify) {
        statusBadge = `<span class="zone-tag zone-YELLOW">⚠️ 待验证</span>`;
      } else if (isPrepared) {
        statusBadge = `<span class="zone-tag zone-YELLOW">📝 已预填待发</span>`;
      } else {
        const txtPart = l.text_sent ? `<span class="meta-pill">📝 已发文字</span>` : "";
        const imgPart = l.image_sent
          ? `<span class="zone-tag zone-GREEN">🖼️ 已发图片</span>`
          : `<span class="meta-pill">🖼️ 未发图片</span>`;
        statusBadge = `${txtPart} ${imgPart}`.trim();
      }
      const noteLine = l.detail ? `<div class="job-row-sub" style="margin-top:4px;color:${isFailed ? "var(--red-fg)" : "var(--text-muted)"};">${esc(l.detail)}</div>` : "";
      return `
        <button type="button" class="job-row" role="option" aria-selected="${selected}" data-select-job="${esc(l.job_id || "")}">
          <div class="job-row-top">
            <span class="job-row-title">${esc(l.job_title || "未知岗位")}</span>
            <span class="job-row-salary">${esc(salary || (isFailed ? "未发出" : ""))}</span>
          </div>
          <div class="job-row-sub">${esc(l.company_name || "未知公司")} · ${esc(profileDisplayName(l.profile_id))} · ${esc(fmtTime(l.created_at))}</div>
          ${noteLine}
          <div class="job-row-meta">
            ${statusBadge}
          </div>
        </button>
      `;
    })
    .join("");

  els.jobListPane.querySelectorAll("[data-select-job]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.selectJob);
      if (!id) return;
      state.selectedJobId = id;
      renderJobList();
      renderInspector(true);
    });
  });
}

function renderJobList() {
  if (state.activeFilter === "DELIVERY_LOGS") {
    renderDeliveryAttemptRows();
    return;
  }
  const jobs = getFilteredSortedJobs();
  if (jobs.length === 0) {
    els.jobListPane.innerHTML = `<div class="empty-state">当前分类下暂无岗位。</div>`;
    return;
  }

  els.jobListPane.innerHTML = jobs
    .map((j) => {
      const selected = j.id === state.selectedJobId;
      const checked = state.batchSelectedIds.has(j.id);
      const adv = j.apply_advice || j.match?.apply_advice || "REVISE_FIRST";
      const salaryIdeal = j.filter_status !== "FILTERED" && Boolean(j.match?.salary_fit?.highlighted);
      const locSub = j.area_district || (j.work_address ? j.work_address.slice(0, 14) : "");
      const rowBtn = `
        <button type="button" class="job-row ${salaryIdeal ? "job-row-salary-ideal" : ""}" role="option" aria-selected="${selected}" data-select-job="${j.id}">
          <div class="job-row-top">
            <span class="job-row-title">${esc(j.job_title)}</span>
            <span class="job-row-salary ${salaryIdeal ? "is-ideal" : ""}">${esc(j.salary_range || "面议")}</span>
          </div>
          <div class="job-row-sub">${esc(j.company_name)}${locSub ? ` · ${esc(locSub)}` : ""} · ${esc(j.experience_req || "经验不限")} · ${esc(j.recruiter_active || j.recruiter_title || "HR")}</div>
          <div class="job-row-meta">
            ${j.filter_status === "FILTERED" ? `<span class="meta-pill">${esc(j.filter_reason || "已过滤")}</span>` : adviceTagHtml(adv, j.match_score || 0)}
            ${commuteTagHtml(j)}
            ${zoneTagHtml(j.zone, j.risk_score)}
            <span style="margin-left:auto;">${deliveryBadgeHtml(j)}</span>
          </div>
        </button>
      `;
      if (!state.batchMode) return rowBtn;
      return `
        <div class="job-row-wrap">
          <label class="batch-job-chk-wrap" title="勾选加入批量投递">
            <input type="checkbox" class="batch-job-chk" data-batch-chk="${j.id}" ${checked ? "checked" : ""}>
          </label>
          ${rowBtn}
        </div>
      `;
    })
    .join("");

  els.jobListPane.querySelectorAll("[data-batch-chk]").forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = Number(chk.dataset.batchChk);
      if (chk.checked) state.batchSelectedIds.add(id);
      else state.batchSelectedIds.delete(id);
      updateBatchBarUi();
    });
  });

  els.jobListPane.querySelectorAll("[data-select-job]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedJobId = Number(btn.dataset.selectJob);
      renderJobList();
      renderInspector(true);
    });
  });
}

function pickBestProfileForJob(job, tracks, profilePool) {
  const prevSameCompany = (job.company_history || [])[0]?.profile_id;
  if (prevSameCompany) return prevSameCompany;
  const candidate = job.assigned_profile_id || job.source_profile_id || profilePool[0]?.id || "Profile 1";
  const candTrack = tracks.find((t) => t.profile_id === candidate);
  if (candTrack && !candTrack.breaker_active && (candTrack.today_delivered || 0) < (candTrack.daily_limit || 25)) {
    return candidate;
  }
  const healthy = tracks.find((t) => !t.breaker_active && (t.today_delivered || 0) < (t.daily_limit || 25));
  return healthy?.profile_id || candidate;
}

async function renderInspector(fetchFresh = false) {
  if (!state.selectedJobId) {
    els.jobInspectorPane.innerHTML = `<div class="empty-state">在左侧选择一个岗位，即可一键发送打招呼语和图片简历。</div>`;
    return;
  }

  const visibleJobs = getFilteredSortedJobs();
  let job = visibleJobs.find((j) => j.id === state.selectedJobId);
  if (!job) {
    if (visibleJobs.length > 0) {
      state.selectedJobId = visibleJobs[0].id;
      job = visibleJobs[0];
    } else {
      els.jobInspectorPane.innerHTML = `<div class="empty-state">当前分类下暂无岗位。</div>`;
      return;
    }
  }

  if (fetchFresh) {
    try {
      job = await api(`/api/jobs/${job.id}`);
    } catch {}
  }

  const settings = state.data?.settings || {};
  const tracks = state.data?.tracks || [];
  const resumeImg = state.data?.resume_image || { exists: false };
  const profilePool = state.egoProfiles.length
    ? state.egoProfiles
    : tracks.map((t) => ({ id: t.profile_id, name: t.profile_name }));
  const preferredProfile = pickBestProfileForJob(job, tracks, profilePool);

  const matchObj = job.match || {};
  const dims = matchObj.dimensions || {};
  const dimList = [
    dims.work_content || { score: Math.round((job.match_score || 0) * 0.35), max: 35, label: "工作内容重合" },
    dims.tech_stack || { score: Math.round((job.match_score || 0) * 0.25), max: 25, label: "技能栈命中" },
    dims.role_alignment || { score: Math.round((job.match_score || 0) * 0.15), max: 15, label: "方向契合" },
    dims.hard_gate || { score: Math.round((job.match_score || 0) * 0.15), max: 15, label: "资历门槛" },
    dims.project_context || { score: Math.round((job.match_score || 0) * 0.1), max: 10, label: "项目场景" },
  ];

  const applyAdvice = job.apply_advice || matchObj.apply_advice || "REVISE_FIRST";
  const adviceLabel = matchObj.advice_label || ADVICE_LABELS[applyAdvice] || "匹配良好";
  const adviceSummary = matchObj.advice_summary || "";
  const templates = Array.isArray(matchObj.greeting_templates) ? matchObj.greeting_templates : [];
  const intel = job.intel || {};
  const snippets = intel.snippets || [];
  const regName = intel.registered_name || "";
  const credit = intel.credit || {};
  const rep = intel.reputation || {};
  const commute = job.commute || {};
  const lookupEntity = regName || job.company_name;
  const sameAccountHistory = (job.company_history || []).find((h) => h.profile_id === preferredProfile);
  const conflict = (job.company_history || []).find((h) => h.profile_id !== preferredProfile);

  const defaultAutoSend = settings.deliver_auto_send !== "false";
  const defaultSendImg = settings.deliver_send_image !== "false" && resumeImg.exists;
  const imgDeliveryState = job.tailored_resume?.image_delivery || "NONE";
  const alreadyContacted = CONTACTED_STATUSES.has(job.status) || Boolean(sameAccountHistory);

  els.jobInspectorPane.innerHTML = `
    <div class="inspector-head">
      <div>
        <h2 class="inspector-title">${esc(job.job_title)} · ${esc(job.company_name)}${regName && regName !== job.company_name ? ` <span class="muted" style="font-size:12px;font-weight:500;">(${esc(regName)})</span>` : ""}</h2>
        <p class="inspector-sub">
          <strong style="color:var(--accent-teal);">${esc(job.salary_range || "薪资面议")}</strong> · ${esc(job.experience_req || "经验不限")} · ${esc(job.education_req || "学历不限")} · ${esc(job.scale || "规模未知")} · ${esc(job.recruiter_title || "HR")} (${esc(job.recruiter_active || "近期活跃")})
        </p>
      </div>
      <div class="inspector-controls">
        ${adviceTagHtml(applyAdvice, job.match_score || 0)}
        ${commuteTagHtml(job)}
        ${zoneTagHtml(job.zone, job.risk_score)}
        ${alreadyContacted ? `<button type="button" class="btn btn-primary btn-xs" id="insp-open-followup">💬 连续沟通/回复模板</button>` : ""}
        <button type="button" class="btn btn-secondary btn-xs" id="insp-open-page">在 Ego 打开</button>
        ${job.filter_status === "FILTERED" ? `<button type="button" class="btn btn-secondary btn-xs" id="insp-restore-btn">放回精选</button>` : `<button type="button" class="btn btn-ghost btn-xs" id="insp-filter-out-btn">移入杂岗</button>`}
        <button type="button" class="btn btn-ghost btn-xs" id="insp-ban-btn">拉黑公司</button>
      </div>
    </div>

    ${job.filter_status === "FILTERED" ? `<div class="alert-strip alert-warn" style="border-radius:8px;"><span><strong>已过滤原因：</strong>${esc(job.filter_reason || "非目标岗位")}</span></div>` : ""}
    ${job.blacklisted ? `<div class="conflict-alert">黑名单公司拦截：${esc(job.blacklisted.company_name)}（${esc(job.blacklisted.reason)}）</div>` : ""}
    ${conflict ? `<div class="conflict-alert">防撞车提醒：该公司曾使用 ${esc(conflict.profile_id)} 联系过（${esc((conflict.created_at || "").slice(0, 10))}），建议切换为同一账号避免重复打招呼。</div>` : ""}
    ${alreadyContacted ? `<div class="alert-strip alert-info" style="border-radius:8px;"><span><strong>🛡️ 防重复提示：</strong>${CONTACTED_STATUSES.has(job.status) ? "该岗位已处于「" + esc(STATUS_LABELS[job.status] || job.status) + "」" : "该公司此前已用 " + esc(sameAccountHistory?.profile_id || preferredProfile) + " 沟通过（" + esc((sameAccountHistory?.created_at || "").slice(0, 10)) + "）"}；再次点击会先拦截确认，若仅需发送图片简历请点「🖼️ 补发图片简历」。</span></div>` : ""}

    <div class="inspector-tabs" role="tablist" aria-label="岗位详情切换">
      <button type="button" role="tab" id="itab-match" aria-selected="${state.inspectorTab === "match"}">一键打招呼与岗位详情</button>
      <button type="button" role="tab" id="itab-risk" aria-selected="${state.inspectorTab === "risk"}">公司排雷与回复后追问</button>
    </div>

    <div role="tabpanel" aria-labelledby="itab-match" ${state.inspectorTab === "match" ? "" : "hidden"}>
      <div class="panel-inner">
        <!-- 核心一键打招呼卡片（置顶最顺手） -->
        <section class="greet-action-card">
          <div class="greet-card-head">
            <span class="greet-card-title">
              <span>专属打招呼话术</span>
              <span class="muted" style="font-weight:500;">(<strong id="insp-greeting-len">${(job.custom_greeting || "").length}</strong>/120 字)</span>
            </span>
            <div class="template-chips">
              ${templates
                .map(
                  (t, idx) =>
                    `<button type="button" class="tpl-btn ${t.text === job.custom_greeting ? "active" : ""}" data-tpl-idx="${idx}">${esc(t.label)}</button>`
                )
                .join("")}
              <button type="button" class="btn btn-ghost btn-xs" id="insp-regen-greeting" title="重新生成或切换话术">🔄 换一版</button>
              <button type="button" class="btn btn-ghost btn-xs" id="insp-copy-greeting">复制文字</button>
            </div>
          </div>

          <textarea id="insp-greeting" class="greet-textarea" rows="3" maxlength="120" placeholder="输入或选择打招呼话术...">${esc(job.custom_greeting || "")}</textarea>

          <div class="greet-footer">
            <div class="greet-options">
              <label class="inline-ctrl">
                <span>账号</span>
                <select id="insp-profile-select" class="input-compact">
                  ${profilePool.map((p) => {
                    const tr = tracks.find((t) => t.profile_id === p.id);
                    const qTxt = tr ? ` ${tr.today_delivered}/${tr.daily_limit}` : "";
                    return `<option value="${esc(p.id)}" ${p.id === preferredProfile ? "selected" : ""}>${esc(profileDisplayName(p.id))}${esc(qTxt)}</option>`;
                  }).join("")}
                </select>
              </label>

              <label class="check-label" for="insp-send-img-chk">
                <input type="checkbox" id="insp-send-img-chk" ${defaultSendImg ? "checked" : ""} ${resumeImg.exists ? "" : "disabled"}>
                <span>顺带发图片简历</span>
              </label>
              ${resumeImg.exists
                ? `<button type="button" class="btn-text" id="insp-preview-img-btn" style="color:var(--accent-teal);">预览图片简历</button>`
                : `<button type="button" class="btn-text" id="insp-goto-resume-upload" style="color:var(--yellow-fg);">去上传图片简历 →</button>`}

              <label class="check-label" for="insp-auto-send-chk" title="取消勾选则只填好话术停在聊天页，由你亲自按回车">
                <input type="checkbox" id="insp-auto-send-chk" ${defaultAutoSend ? "checked" : ""}>
                <span>自动发出</span>
              </label>
            </div>

            <div class="greet-cta-group">
              ${resumeImg.exists ? `<button type="button" class="btn btn-secondary btn-sm" id="insp-copy-img-btn" title="复制高清图片简历到剪贴板，在任意聊天框可直接 Ctrl+V 粘贴">📋 复制图片简历</button>` : ""}
              ${(alreadyContacted && imgDeliveryState !== "SENT" && resumeImg.exists)
                ? `<button type="button" class="btn btn-secondary btn-sm" id="insp-send-img-only" ${job.blacklisted ? "disabled" : ""}>🖼️ 补发图片简历</button>`
                : ""}
              <button type="button" class="btn btn-boss btn-lg" id="insp-deliver-main" ${job.blacklisted ? "disabled" : ""}>
                ${alreadyContacted ? "🔁 再次打招呼（已沟通过）" : `💬 一键打招呼${defaultSendImg ? "（附图片简历）" : ""}`}
              </button>
            </div>
          </div>

          ${imgDeliveryState === "PENDING_REPLY" ? `<div class="muted" style="font-size:12px;color:var(--yellow-fg);">💡 上次已成功发出招呼语；因对方回复前 Boss 暂锁首图，待 HR 回复后点击右侧「🖼️ 补发图片简历」或直接 Ctrl+V 即可发出。</div>` : ""}
        </section>

        <!-- 匹配亮点与通勤精简卡 -->
        <div class="verdict-box">
          <div class="verdict-head">
            <strong>匹配度 ${esc(job.match_score || 0)}/100 · ${esc(adviceLabel)}</strong>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="muted">状态：</span>
              <select id="insp-status-select" class="input-compact" style="padding:3px 8px;font-size:12px;">
                ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${esc(k)}" ${job.status === k ? "selected" : ""}>${esc(v)}</option>`).join("")}
              </select>
            </div>
          </div>
          ${adviceSummary ? `<div class="muted">${esc(adviceSummary)}</div>` : ""}
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
          <div style="font-size:12.5px;">
            <strong>命中亮点：</strong>${esc((matchObj.matched_keywords || []).join("、") || "基础软件测试")}
            ${matchObj.missing_must_haves?.length ? `<span style="margin-left:12px;color:var(--yellow-fg);"><strong>JD 额外提及：</strong>${esc(matchObj.missing_must_haves.join("、"))}</span>` : ""}
          </div>
        </div>

        <div class="commute-strip">
          <div>
            <strong>📍 办公地点与通勤：</strong>
            <span>${esc(job.work_address || job.area_district || "暂未获取详细街道")}</span>
            <span class="muted" style="margin-left:8px;">${esc(commute.status === "DONE" ? commute.summary : "点击右侧测算单车+地铁耗时")}</span>
          </div>
          <button type="button" class="btn btn-secondary btn-xs" id="insp-calc-commute" style="flex:none;">测算通勤</button>
        </div>

        <!-- 同屏直接看完整 JD（免切标签页） -->
        <div class="surface-box">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <h3>岗位职责与要求 (JD)</h3>
            <span class="muted">来源词：${esc(job.matched_query || "-")} · ${esc(fmtTime(job.updated_at || job.created_at))}</span>
          </div>
          <div class="code-box" style="max-height:320px;background:var(--bg-canvas);">${esc(job.jd_text || "暂无详细 JD 文本")}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="insp-notes" placeholder="随手记一句跟进备注（如：HR已回、周四下午面试）..." value="${esc(job.notes || "")}">
            <button type="button" class="btn btn-secondary btn-sm" id="insp-save-notes" style="flex:none;">保存备注</button>
          </div>
        </div>
      </div>
    </div>

    <div role="tabpanel" aria-labelledby="itab-risk" ${state.inspectorTab === "risk" ? "" : "hidden"}>
      <div class="panel-inner">
        <div class="surface-box">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <strong>企业工商排雷与口碑（风险分 ${esc(job.risk_score)}）</strong>
            <div class="intel-links">
              <a class="btn btn-ghost btn-xs" href="https://aiqicha.baidu.com/s?q=${encodeURIComponent(lookupEntity)}" target="_blank" rel="noreferrer">爱企查</a>
              <a class="btn btn-ghost btn-xs" href="https://www.tianyancha.com/search?key=${encodeURIComponent(lookupEntity)}" target="_blank" rel="noreferrer">天眼查</a>
              <a class="btn btn-ghost btn-xs" href="https://www.zhihu.com/search?q=${encodeURIComponent(lookupEntity + " 怎么样")}" target="_blank" rel="noreferrer">知乎评价</a>
              <button type="button" class="btn btn-secondary btn-xs" id="insp-refresh-intel">联网深查</button>
            </div>
          </div>
          <div style="font-size:12.5px;display:flex;flex-wrap:wrap;gap:8px;">
            <span class="meta-pill">工商全称：${esc(regName || "点击「联网深查」获取")}</span>
            ${credit.established_year ? `<span class="meta-pill">成立：${esc(credit.established_year)}年</span>` : ""}
            ${credit.registered_capital ? `<span class="meta-pill">注册资本：${esc(credit.registered_capital)}</span>` : ""}
            ${credit.paid_capital ? `<span class="meta-pill">实缴：${esc(credit.paid_capital)}</span>` : ""}
            ${credit.insured_count != null ? `<span class="meta-pill">参保：${esc(credit.insured_count)}人</span>` : ""}
            ${rep.negative_tags?.length ? `<span class="zone-tag zone-RED">舆情预警：${esc(rep.negative_tags.join("、"))}</span>` : ""}
          </div>
          <ul class="evidence-list">
            ${(job.evidence || []).map((ev) => `<li>${esc(ev)}</li>`).join("")}
          </ul>
          <p class="muted">结论：${esc(intel.summary || job.intel_summary || "常规企业")}</p>
          ${snippets.length ? `<ul class="evidence-list">${snippets.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)}</a><br><span class="muted">${esc(s.snippet)}</span></li>`).join("")}</ul>` : ""}
        </div>

        <div class="surface-box">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong>HR 回复后探底 4 连问（防单休 / 压薪 / 杂活）</strong>
            <button type="button" class="btn btn-secondary btn-xs" id="insp-copy-probe">一键复制 4 问</button>
          </div>
          <div class="code-box" id="insp-probe-text" style="max-height:none;background:var(--bg-canvas);">您好，进一步沟通前想确认几个基础问题方便双向评估：
1. 该岗位日常核心工作主要是软件/AI测试本身，还是会涉及跨岗杂活？
2. 团队目前作息是标准双休吗？
3. 五险一金是入职即按实际薪资还是最低基数缴纳？
4. 薪资 ${esc(job.salary_range || "9-12K")} 是全额固定底薪，还是含绩效浮动？谢谢！</div>
        </div>
      </div>
    </div>
  `;

  // Wire sub-tabs
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
  const sendImgChk = document.getElementById("insp-send-img-chk");
  const autoSendChk = document.getElementById("insp-auto-send-chk");
  const mainDeliverBtn = document.getElementById("insp-deliver-main");

  const updateDeliverBtnText = () => {
    const auto = autoSendChk.checked;
    const withImg = sendImgChk.checked && resumeImg.exists;
    if (alreadyContacted) {
      mainDeliverBtn.textContent = "🔁 再次打招呼（已沟通过）";
      return;
    }
    if (!auto) {
      mainDeliverBtn.textContent = "↗ 跳转聊天页（预填话术）";
    } else if (withImg) {
      mainDeliverBtn.textContent = "💬 一键打招呼（附图片简历）";
    } else {
      mainDeliverBtn.textContent = "💬 一键打招呼";
    }
  };
  sendImgChk.addEventListener("change", updateDeliverBtnText);
  autoSendChk.addEventListener("change", updateDeliverBtnText);
  updateDeliverBtnText();

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

  document.getElementById("insp-regen-greeting").addEventListener("click", async () => {
    const curIdx = templates.findIndex((t) => t.text === greetingEl.value.trim());
    const profileId = document.getElementById("insp-profile-select").value;
    if (state.data?.llmConfigured) {
      setWorkerBusy(true, "正在结合 JD 重新生成招呼语...");
      try {
        const res = await api(`/api/jobs/${job.id}/evaluate`, { method: "POST", body: JSON.stringify({ profileId, useLlm: true }) });
        greetingEl.value = res.job?.custom_greeting || greetingEl.value;
        lenEl.textContent = greetingEl.value.length;
        els.liveLogLatest.textContent = "已重新生成专属打招呼话术";
      } finally {
        setWorkerBusy(false);
      }
    } else if (templates.length > 0) {
      const nextTpl = templates[(curIdx + 1) % templates.length];
      greetingEl.value = nextTpl.text;
      lenEl.textContent = nextTpl.text.length;
      els.jobInspectorPane.querySelectorAll("[data-tpl-idx]").forEach((x, i) => x.classList.toggle("active", i === (curIdx + 1) % templates.length));
      els.liveLogLatest.textContent = `已切换至「${nextTpl.label}」话术`;
    }
  });

  document.getElementById("insp-copy-greeting").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(greetingEl.value);
      els.liveLogLatest.textContent = "已复制打招呼话术到剪贴板";
    } catch {}
  });

  document.getElementById("insp-preview-img-btn")?.addEventListener("click", () => {
    els.imagePreviewFull.src = resumeImg.url;
    els.imagePreviewModal.showModal();
  });

  document.getElementById("insp-goto-resume-upload")?.addEventListener("click", () => {
    switchView("resumes");
  });

  document.getElementById("insp-copy-img-btn")?.addEventListener("click", async () => {
    try {
      await copyResumeImageToClipboard();
      els.liveLogLatest.textContent = "✅ 已将高清图片简历复制进剪贴板，在聊天框按 Ctrl+V 即可直接粘贴发送！";
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("insp-copy-probe")?.addEventListener("click", async () => {
    const txt = document.getElementById("insp-probe-text")?.textContent || "";
    try {
      await navigator.clipboard.writeText(txt);
      els.liveLogLatest.textContent = "已复制 HR 探底 4 连问到剪贴板";
    } catch {}
  });

  document.getElementById("insp-status-select").addEventListener("change", async (e) => {
    await api(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: e.target.value, custom_greeting: greetingEl.value.trim() }),
    });
    await refreshState();
  });

  document.getElementById("insp-save-notes").addEventListener("click", async () => {
    const notes = document.getElementById("insp-notes").value;
    await api(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ notes, custom_greeting: greetingEl.value.trim() }),
    });
    await refreshState();
    els.liveLogLatest.textContent = "已保存岗位备注";
  });

  document.getElementById("insp-open-followup")?.addEventListener("click", () => {
    openFollowupModal(job.id, document.getElementById("insp-profile-select")?.value || preferredProfile);
  });

  document.getElementById("insp-open-page").addEventListener("click", async () => {
    const profileId = document.getElementById("insp-profile-select").value;
    setWorkerBusy(true, `正在用 ${profileId} 打开岗位原网页...`);
    try {
      await api(`/api/jobs/${job.id}/open`, { method: "POST", body: JSON.stringify({ profileId }) });
      els.liveLogLatest.textContent = `已在 Ego (${profileId}) 打开岗位详情页`;
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkerBusy(false);
    }
  });

  document.getElementById("insp-ban-btn").addEventListener("click", async () => {
    if (!confirm(`确定将「${job.company_name}」加入黑名单屏蔽吗？`)) return;
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

  document.getElementById("insp-refresh-intel")?.addEventListener("click", async () => {
    setWorkerBusy(true, "正在联网核查工商、参保与口碑...");
    try {
      await api(`/api/jobs/${job.id}/intel`, { method: "POST" });
      await refreshState();
      await renderInspector(true);
    } finally {
      setWorkerBusy(false);
    }
  });

  document.getElementById("insp-calc-commute")?.addEventListener("click", async () => {
    setWorkerBusy(true, "正在测算单车+地铁通勤耗时...");
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

  const executeDelivery = async ({ onlySendImage = false } = {}) => {
    const profileId = document.getElementById("insp-profile-select").value;
    const chosenConflict = (job.company_history || []).find((h) => h.profile_id !== profileId);
    if (chosenConflict && !confirm(`该公司此前已用 ${chosenConflict.profile_id} 联系过，确定改用 ${profileId} 重复触达吗？`)) {
      return;
    }
    const sameRepeat = !onlySendImage && (CONTACTED_STATUSES.has(job.status) || (job.company_history || []).some((h) => h.profile_id === profileId));
    if (sameRepeat && !confirm(`防重复提醒：当前账号（${profileId}）此前已对「${job.company_name}」沟通过，确认还要再次发送打招呼语吗？\n\n（如果只是补发简历图片，请点取消并直接点击左侧「🖼️ 补发图片简历」）`)) {
      return;
    }
    const autoSend = onlySendImage ? true : autoSendChk.checked;
    const sendImageResume = onlySendImage ? true : (sendImgChk.checked && resumeImg.exists);

    mainDeliverBtn.disabled = true;
    setWorkerBusy(true, onlySendImage ? `正在用 ${profileId} 补发高清图片简历...` : `正在用 ${profileId} 自动打招呼...`);
    try {
      const res = await api(`/api/jobs/${job.id}/deliver`, {
        method: "POST",
        body: JSON.stringify({
          profileId,
          greetingText: greetingEl.value.trim(),
          autoSend,
          sendImageResume,
          onlySendImage,
          forceCrossTrack: Boolean(chosenConflict),
          forceRepeat: Boolean(sameRepeat),
        }),
      });
      if (res.status === "VERIFICATION_REQUIRED") {
        showVerifyBanner(res);
      } else {
        const msg = res.delivery?.message || "已完成打招呼操作";
        els.liveLogLatest.textContent = msg;
        if (res.delivery?.status === "SENT_TEXT_PENDING_IMAGE" && resumeImg.exists) {
          await copyResumeImageToClipboard().catch(() => {});
        }
      }
      await refreshState();
      await renderInspector(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkerBusy(false);
      mainDeliverBtn.disabled = false;
    }
  };

  mainDeliverBtn.addEventListener("click", () => executeDelivery({ onlySendImage: false }));
  document.getElementById("insp-send-img-only")?.addEventListener("click", () => executeDelivery({ onlySendImage: true }));
}

// ============================================================================
// VIEW 2: Boss-Style Online Resume + Modal Editor + Image Resume Sidebar
// ============================================================================
function renderResumes() {
  const { resumes, tracks, settings, resume_image: resumeImg = { exists: false } } = state.data;
  const primaryKey = settings?.primary_resume_track || "A";
  const r = resumes.find((x) => x.track_key === primaryKey) || resumes[0] || {
    track_key: "A",
    candidate_name: "候选人",
    years_label: "1年经验",
    summary: "",
    skills: [],
    experiences: [],
    projects: [],
    education: [],
  };
  const profilesList = state.egoProfiles.length
    ? state.egoProfiles
    : tracks.map((t) => ({ id: t.profile_id, name: t.profile_name }));

  const avatarChar = (r.candidate_name || "简").trim().slice(0, 1);
  const degreeTxt = r.education?.[0]?.degree || "本科";
  const kbTxt = resumeImg.exists ? `${Math.max(1, Math.round((resumeImg.bytes || 0) / 1024))} KB` : "";

  els.resumesContainer.innerHTML = `
    <!-- Left: Boss-style Online Resume Sheet -->
    <div class="boss-resume-sheet">
      <div class="boss-sheet-topbar">
        <span class="boss-sheet-topbar-title">我的在线简历 · 最近同步 ${esc(r.synced_at ? fmtTime(r.synced_at) : "本地保存")}</span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select id="boss-sync-profile-sel" class="input-compact" aria-label="选择Boss账号读取">
            ${profilesList.map((p) => `<option value="${esc(p.id)}">从 ${esc(p.name)} (${esc(p.id)}) 拉取</option>`).join("")}
          </select>
          <button type="button" class="btn btn-secondary btn-xs" id="btn-boss-sync-now">从 Boss 同步最新</button>
          <button type="button" class="btn btn-ghost btn-xs" id="btn-rescore-from-resume">重算全部岗位匹配分</button>
        </div>
      </div>

      <div class="boss-sheet-body">
        <!-- 1. Base Info Hero -->
        <section class="boss-hero">
          <div class="boss-hero-main">
            <div class="boss-hero-name-row">
              <h2 class="boss-hero-name">${esc(r.candidate_name || "未填写姓名")}</h2>
              <button type="button" class="boss-link-btn" data-edit-sec="base">编辑</button>
            </div>
            <div class="boss-hero-meta">
              <span>💼 ${esc(r.years_label || "1年经验")}</span>
              <span>·</span>
              <span>🎓 ${esc(degreeTxt)}</span>
              <span>·</span>
              <span>🟢 在职-考虑机会 / 最快一周到岗</span>
            </div>
          </div>
          <div class="boss-avatar" aria-hidden="true">${esc(avatarChar)}</div>
        </section>

        <!-- 2. Summary / Advantage -->
        <section class="boss-sec">
          <div class="boss-sec-head">
            <h3 class="boss-sec-title">个人优势</h3>
            <button type="button" class="boss-link-btn" data-edit-sec="summary">编辑</button>
          </div>
          <div class="boss-summary-text">${esc(r.summary || "点击右上角「编辑」补充个人核心优势，或直接从 Boss 同步。")}</div>
        </section>

        <!-- 3. Skills -->
        <section class="boss-sec">
          <div class="boss-sec-head">
            <h3 class="boss-sec-title">核心技能标签</h3>
            <button type="button" class="boss-link-btn" data-edit-sec="skills">编辑</button>
          </div>
          <div class="boss-skill-pills">
            ${(r.skills || []).length
              ? r.skills.map((s) => `<span class="boss-skill-pill">${esc(s)}</span>`).join("")
              : `<span class="muted">暂无技能标签</span>`}
          </div>
        </section>

        <!-- 4. Work Experience -->
        <section class="boss-sec">
          <div class="boss-sec-head">
            <h3 class="boss-sec-title">工作经历</h3>
            <button type="button" class="boss-link-btn" data-edit-sec="work-add">+ 添加工作经历</button>
          </div>
          <div class="boss-entry-list">
            ${(r.experiences || []).length
              ? r.experiences.map((e, idx) => `
                <div class="boss-entry">
                  <div class="boss-entry-top">
                    <div>
                      <span class="boss-entry-title">${esc(e.company || "未命名公司")}</span>
                      <span class="boss-entry-role">${esc(e.role || "")}</span>
                    </div>
                    <div class="boss-entry-right">
                      <span>${esc(e.period || "")}</span>
                      <button type="button" class="boss-link-btn" data-edit-sec="work" data-idx="${idx}">编辑</button>
                      <button type="button" class="boss-link-btn danger" data-del-sec="work" data-idx="${idx}">删除</button>
                    </div>
                  </div>
                  <div class="boss-entry-desc">${esc(e.content || "")}</div>
                </div>
              `).join("")
              : `<div class="muted">暂无工作经历</div>`}
          </div>
        </section>

        <!-- 5. Project Experience -->
        <section class="boss-sec">
          <div class="boss-sec-head">
            <h3 class="boss-sec-title">项目经历</h3>
            <button type="button" class="boss-link-btn" data-edit-sec="proj-add">+ 添加项目经历</button>
          </div>
          <div class="boss-entry-list">
            ${(r.projects || []).length
              ? r.projects.map((p, idx) => `
                <div class="boss-entry">
                  <div class="boss-entry-top">
                    <div>
                      <span class="boss-entry-title">${esc(p.name || "未命名项目")}</span>
                      <span class="boss-entry-role">${esc(p.role || "")}</span>
                    </div>
                    <div class="boss-entry-right">
                      <span>${esc(p.period || "")}</span>
                      <button type="button" class="boss-link-btn" data-edit-sec="proj" data-idx="${idx}">编辑</button>
                      <button type="button" class="boss-link-btn danger" data-del-sec="proj" data-idx="${idx}">删除</button>
                    </div>
                  </div>
                  <div class="boss-entry-desc">${esc(p.content || "")}</div>
                </div>
              `).join("")
              : `<div class="muted">暂无项目经历</div>`}
          </div>
        </section>

        <!-- 6. Education -->
        <section class="boss-sec">
          <div class="boss-sec-head">
            <h3 class="boss-sec-title">教育经历</h3>
            <button type="button" class="boss-link-btn" data-edit-sec="edu-add">+ 添加教育经历</button>
          </div>
          <div class="boss-entry-list">
            ${(r.education || []).length
              ? r.education.map((ed, idx) => `
                <div class="boss-entry">
                  <div class="boss-entry-top">
                    <div>
                      <span class="boss-entry-title">${esc(ed.school || "学校名称")}</span>
                      <span class="boss-entry-role">${esc([ed.major, ed.degree].filter(Boolean).join(" · "))}</span>
                    </div>
                    <div class="boss-entry-right">
                      <span>${esc(ed.period || "")}</span>
                      <button type="button" class="boss-link-btn" data-edit-sec="edu" data-idx="${idx}">编辑</button>
                      <button type="button" class="boss-link-btn danger" data-del-sec="edu" data-idx="${idx}">删除</button>
                    </div>
                  </div>
                  ${ed.content ? `<div class="boss-entry-desc">${esc(ed.content)}</div>` : ""}
                </div>
              `).join("")
              : `<div class="muted">暂无教育经历</div>`}
          </div>
        </section>
      </div>
    </div>

    <!-- Right: Attachment & Image Resume Sidebar -->
    <aside class="boss-resume-sider">
      <div class="boss-sider-card">
        <h3>
          <span>🖼️ 图片简历（打招呼专用）</span>
          ${resumeImg.exists ? `<span class="zone-tag zone-GREEN">已就绪</span>` : `<span class="zone-tag zone-YELLOW">待上传</span>`}
        </h3>
        <p class="muted">上传 PDF 简历或图片后，系统自动生成高清长图简历；点击打招呼时可一键发给 HR。</p>

        ${resumeImg.exists
          ? `
            <div class="boss-img-preview-box" id="sider-img-zoom" title="点击放大查看高清图片简历">
              <img src="${esc(resumeImg.url)}" alt="当前图片简历预览">
              <span class="boss-img-preview-hint">点击放大 (${esc(kbTxt)})</span>
            </div>
          `
          : `<div class="empty-state" style="padding:24px 12px;border:1px dashed var(--border-line);border-radius:8px;">尚未配置图片简历</div>`}

        <input type="file" id="resume-asset-file-input" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden>
        <div class="stack-sm">
          <button type="button" class="btn btn-boss btn-sm" id="btn-upload-resume-asset">📄 上传 PDF / 图片简历</button>
          ${resumeImg.exists ? `<button type="button" class="btn btn-secondary btn-sm" id="btn-copy-resume-img">📋 复制图片到剪贴板</button>` : ""}
          <button type="button" class="btn btn-ghost btn-xs" id="btn-render-from-online">由左侧在线简历生成长图</button>
        </div>
      </div>

      <div class="boss-sider-card">
        <h3>💡 为什么用图片简历？</h3>
        <p class="muted" style="line-height:1.65;">
          Boss 直聘默认需对方点同意才能发 PDF 附件；而聊天窗口的「发送图片」在对方主动打招呼或回复后可直接发出高清大图，HR 手机端点开即看、无需下载，回复率更高。
        </p>
      </div>
    </aside>
  `;

  // Sync from Boss
  document.getElementById("btn-boss-sync-now").addEventListener("click", async () => {
    const profileId = document.getElementById("boss-sync-profile-sel").value;
    setWorkerBusy(true, `正在从 ${profileId} 同步线上简历...`);
    try {
      const res = await api(`/api/resumes/${r.track_key}/sync`, {
        method: "POST",
        body: JSON.stringify({ profileId }),
      });
      if (res.status === "VERIFICATION_REQUIRED") {
        showVerifyBanner(res);
      } else if (res.resume) {
        const otherKey = r.track_key === "A" ? "B" : "A";
        await api(`/api/resumes/${otherKey}`, { method: "POST", body: JSON.stringify(res.resume) }).catch(() => {});
        els.liveLogLatest.textContent = `已从 ${profileId} 同步最新在线简历`;
      }
      await refreshState();
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkerBusy(false);
    }
  });

  document.getElementById("btn-rescore-from-resume").addEventListener("click", reEvaluateAll);

  // Image zoom & upload & copy
  document.getElementById("sider-img-zoom")?.addEventListener("click", () => {
    els.imagePreviewFull.src = resumeImg.url;
    els.imagePreviewModal.showModal();
  });

  const fileInp = document.getElementById("resume-asset-file-input");
  document.getElementById("btn-upload-resume-asset").addEventListener("click", () => fileInp.click());

  fileInp.addEventListener("change", async () => {
    const file = fileInp.files?.[0];
    if (!file) return;
    setWorkerBusy(true, `正在处理「${file.name}」并生成高清图片简历...`);
    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取本地文件失败"));
        reader.readAsDataURL(file);
      });
      await api("/api/resume-assets/upload", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, dataBase64 }),
      });
      await refreshState();
      els.liveLogLatest.textContent = `✅ 已更新高清图片简历（${file.name}）`;
    } catch (err) {
      alert(`上传生成失败：${err.message}`);
    } finally {
      fileInp.value = "";
      setWorkerBusy(false);
    }
  });

  document.getElementById("btn-copy-resume-img")?.addEventListener("click", async () => {
    try {
      await copyResumeImageToClipboard();
      els.liveLogLatest.textContent = "✅ 已复制高清图片简历到剪贴板";
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("btn-render-from-online").addEventListener("click", async () => {
    setWorkerBusy(true, "正在渲染高清长图简历...");
    try {
      await api("/api/resume-assets/generate-from-online", { method: "POST", body: JSON.stringify({}) });
      await refreshState();
      els.liveLogLatest.textContent = "✅ 已生成高清图片简历";
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkerBusy(false);
    }
  });

  // Edit / Delete section handlers (zero raw JSON!)
  els.resumesContainer.querySelectorAll("[data-edit-sec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openResumeSectionModal(r, btn.dataset.editSec, btn.dataset.idx != null ? Number(btn.dataset.idx) : null);
    });
  });

  els.resumesContainer.querySelectorAll("[data-del-sec]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sec = btn.dataset.delSec;
      const idx = Number(btn.dataset.idx);
      if (!confirm("确定删除这一条记录吗？")) return;
      const next = structuredCloneResume(r);
      if (sec === "work") next.experiences.splice(idx, 1);
      if (sec === "proj") next.projects.splice(idx, 1);
      if (sec === "edu") next.education.splice(idx, 1);
      await persistUnifiedResume(next);
    });
  });
}

function structuredCloneResume(r) {
  return {
    candidate_name: r.candidate_name || "",
    years_label: r.years_label || "1年经验",
    summary: r.summary || "",
    skills: [...(r.skills || [])],
    experiences: (r.experiences || []).map((x) => ({ ...x })),
    projects: (r.projects || []).map((x) => ({ ...x })),
    education: (r.education || []).map((x) => ({ ...x })),
    raw_text: r.raw_text || "",
  };
}

async function persistUnifiedResume(payload) {
  await api("/api/resumes/A", { method: "POST", body: JSON.stringify(payload) });
  await api("/api/resumes/B", { method: "POST", body: JSON.stringify(payload) }).catch(() => {});
  await refreshState();
  els.liveLogLatest.textContent = "已保存简历更新";
}

function openResumeSectionModal(r, type, idx = null) {
  state.editingResumeCtx = { r: structuredCloneResume(r), type, idx };
  let title = "编辑简历";
  let fieldsHtml = "";

  if (type === "base") {
    title = "编辑基本信息";
    fieldsHtml = `
      <label class="field"><span>姓名</span><input type="text" name="candidate_name" value="${esc(r.candidate_name || "")}" required autofocus></label>
      <label class="field"><span>工作经验标签（如：1年经验 / 25届应届生）</span><input type="text" name="years_label" value="${esc(r.years_label || "")}" required></label>
    `;
  } else if (type === "summary") {
    title = "编辑个人优势";
    fieldsHtml = `
      <label class="field"><span>个人优势（建议分点换行填写）</span><textarea name="summary" rows="7" required autofocus>${esc(r.summary || "")}</textarea></label>
    `;
  } else if (type === "skills") {
    title = "编辑核心技能标签";
    fieldsHtml = `
      <label class="field"><span>技能标签（用逗号或顿号分隔）</span><input type="text" name="skills" value="${esc((r.skills || []).join("、"))}" placeholder="Python、Pytest、HTTPX、RAG、Docker" autofocus></label>
    `;
  } else if (type === "work" || type === "work-add") {
    const item = idx != null ? (r.experiences?.[idx] || {}) : { company: "", role: "", period: "2025.06-至今", content: "" };
    title = type === "work-add" ? "添加工作经历" : "编辑工作经历";
    fieldsHtml = `
      <div class="form-grid">
        <label class="field"><span>公司名称</span><input type="text" name="company" value="${esc(item.company || "")}" placeholder="示例科技有限公司" required autofocus></label>
        <label class="field"><span>职位名称</span><input type="text" name="role" value="${esc(item.role || "")}" placeholder="AI应用测试工程师" required></label>
      </div>
      <label class="field"><span>在职时间</span><input type="text" name="period" value="${esc(item.period || "")}" placeholder="2025.06-至今" required></label>
      <label class="field"><span>工作内容与成果</span><textarea name="content" rows="6" required>${esc(item.content || "")}</textarea></label>
    `;
  } else if (type === "proj" || type === "proj-add") {
    const item = idx != null ? (r.projects?.[idx] || {}) : { name: "", role: "", period: "2025.06-至今", content: "" };
    title = type === "proj-add" ? "添加项目经历" : "编辑项目经历";
    fieldsHtml = `
      <div class="form-grid">
        <label class="field"><span>项目名称</span><input type="text" name="name" value="${esc(item.name || "")}" required autofocus></label>
        <label class="field"><span>担任角色</span><input type="text" name="role" value="${esc(item.role || "")}" placeholder="核心QA负责人" required></label>
      </div>
      <label class="field"><span>项目时间</span><input type="text" name="period" value="${esc(item.period || "")}" placeholder="2025.06-至今" required></label>
      <label class="field"><span>项目描述与职责成果</span><textarea name="content" rows="7" required>${esc(item.content || "")}</textarea></label>
    `;
  } else if (type === "edu" || type === "edu-add") {
    const item = idx != null ? (r.education?.[idx] || {}) : { school: "", major: "", degree: "本科", period: "2021-2025", content: "" };
    title = type === "edu-add" ? "添加教育经历" : "编辑教育经历";
    fieldsHtml = `
      <div class="form-grid">
        <label class="field"><span>学校名称</span><input type="text" name="school" value="${esc(item.school || "")}" required autofocus></label>
        <label class="field"><span>专业</span><input type="text" name="major" value="${esc(item.major || "")}" required></label>
        <label class="field"><span>学历</span><input type="text" name="degree" value="${esc(item.degree || "本科")}" required></label>
        <label class="field"><span>时间段</span><input type="text" name="period" value="${esc(item.period || "2021-2025")}" required></label>
      </div>
      <label class="field"><span>在校经历 / 主修课程与荣誉（选填）</span><textarea name="content" rows="4">${esc(item.content || "")}</textarea></label>
    `;
  }

  els.resumeEditTitle.textContent = title;
  els.resumeEditFields.innerHTML = fieldsHtml;
  els.resumeEditModal.showModal();
}

els.resumeEditForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ctx = state.editingResumeCtx;
  if (!ctx) return;
  const fd = new FormData(els.resumeEditForm);
  const v = Object.fromEntries(fd.entries());
  const next = ctx.r;

  if (ctx.type === "base") {
    next.candidate_name = String(v.candidate_name || "").trim();
    next.years_label = String(v.years_label || "").trim();
  } else if (ctx.type === "summary") {
    next.summary = String(v.summary || "").trim();
  } else if (ctx.type === "skills") {
    next.skills = String(v.skills || "").split(/[,，、\n]+/).map((s) => s.trim()).filter(Boolean);
  } else if (ctx.type === "work" || ctx.type === "work-add") {
    const entry = {
      company: String(v.company || "").trim(),
      role: String(v.role || "").trim(),
      period: String(v.period || "").trim(),
      content: String(v.content || "").trim(),
    };
    if (ctx.type === "work-add") next.experiences.unshift(entry);
    else next.experiences[ctx.idx] = entry;
  } else if (ctx.type === "proj" || ctx.type === "proj-add") {
    const entry = {
      name: String(v.name || "").trim(),
      role: String(v.role || "").trim(),
      period: String(v.period || "").trim(),
      content: String(v.content || "").trim(),
    };
    if (ctx.type === "proj-add") next.projects.unshift(entry);
    else next.projects[ctx.idx] = entry;
  } else if (ctx.type === "edu" || ctx.type === "edu-add") {
    const entry = {
      school: String(v.school || "").trim(),
      major: String(v.major || "").trim(),
      degree: String(v.degree || "").trim(),
      period: String(v.period || "").trim(),
      content: String(v.content || "").trim(),
    };
    if (ctx.type === "edu-add") next.education.push(entry);
    else next.education[ctx.idx] = entry;
  }

  els.resumeEditModal.close();
  await persistUnifiedResume(next);
});

// ============================================================================
// VIEW 3 & VIEW 4: Telemetry, Blacklist & Clean Settings
// ============================================================================
function renderFunnel() {
  const f = state.data?.funnel;
  if (!f) return;
  const replyRate = f.delivered > 0 ? Math.round((f.replied / f.delivered) * 100) : 0;
  const ivRate = f.delivered > 0 ? Math.round((f.interviews / f.delivered) * 100) : 0;
  els.funnelCards.innerHTML = `
    <div class="funnel-card">
      <strong>精选岗位池</strong>
      <div class="muted">精选保留 ${esc(f.eligible_jobs ?? f.total_jobs)} 条（累计抓 ${esc(f.total_jobs)}）</div>
      <div class="muted">自动过滤杂岗 ${esc(f.filtered_out ?? 0)} 条</div>
    </div>
    <div class="funnel-card">
      <strong>匹配分布</strong>
      <div class="muted">高匹配推荐：${esc(f.direct_apply ?? 0)} 条</div>
      <div class="muted">良好可聊：${esc(f.revise_first ?? 0)} 条</div>
    </div>
    <div class="funnel-card">
      <strong>沟通跟进</strong>
      <div class="muted">已打招呼 ${esc(f.delivered ?? 0)} · 回复 ${esc(f.replied ?? 0)} (${replyRate}%)</div>
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
    ? `<span class="zone-tag zone-GREEN" style="margin-left:4px;">今日已满</span>`
    : st.today_ran
      ? `<span class="zone-tag zone-YELLOW" style="margin-left:4px;">进行中/未满</span>`
      : `<span class="meta-pill" style="margin-left:4px;">今日待巡检</span>`;

  els.patrolKpiStrip.innerHTML = `
    <div class="funnel-card">
      <strong>今日巡检进度 ${quotaBadge}</strong>
      <div style="font-size:15px;font-weight:700;">${esc(st.today_patrol_scanned)} / ${esc(st.planned_quota)} 条次</div>
      <div class="muted">${esc(st.keyword_count)} 词 × ${esc(st.profiles_count)} 账号 × ${esc(st.max_per_keyword)} 条/词</div>
    </div>
    <div class="funnel-card">
      <strong>今日新发现岗位</strong>
      <div style="font-size:15px;font-weight:700;">新抓 ${esc(st.today_new_count)} → 留下 ${esc(st.today_new_kept)} 条</div>
      <div class="muted">过滤不符 ${esc(st.today_new_filtered)} 条</div>
    </div>
    <div class="funnel-card">
      <strong>历史累计去重池</strong>
      <div style="font-size:15px;font-weight:700;">累计 ${esc(st.total_jobs)} → 精选 ${esc(st.total_kept)} 条</div>
      <div class="muted">留存率 ${st.total_jobs > 0 ? Math.round((st.total_kept / st.total_jobs) * 100) : 0}%</div>
    </div>
    <div class="funnel-card">
      <strong>9-12K 黄金薪资岗</strong>
      <div style="font-size:15px;font-weight:700;">${esc(st.salary_ideal_count)} 条</div>
      <div class="muted">在岗位页点「9-12K优先」直达</div>
    </div>
  `;

  if (els.patrolRunsTableBody) {
    els.patrolRunsTableBody.innerHTML = runs.length
      ? runs
          .map((r) => {
            const quotaTxt = r.planned_quota ? `${r.scanned_count}/${r.planned_quota}` : `${r.scanned_count}`;
            const statusText = r.status === "OK" ? "完成" : "待验证";
            const modeText = r.mode === "SINGLE" ? "单词快采" : "每日巡检";
            const timeShort = r.finished_at ? fmtTime(r.finished_at).slice(5, 16) : r.run_date;
            return `
              <tr>
                <td><strong>${esc(timeShort)}</strong> <span class="muted">${esc(modeText)}</span></td>
                <td>${esc(quotaTxt)}</td>
                <td>${esc(r.new_count)}</td>
                <td class="num-kept">${esc(r.kept_count)} <span class="num-filt">(/ 滤${esc(r.filtered_count)})</span></td>
                <td><span class="meta-pill">${esc(statusText)}</span></td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="5" class="muted">暂无记录。</td></tr>`;
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
      : `<tr><td colspan="4" class="muted">暂无记录。</td></tr>`;
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
      : `<tr><td colspan="5" class="muted">暂无记录。</td></tr>`;
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
            <span>Boss 账号 ${idx + 1} 备注名 ${t.breaker_active ? '<strong style="color:var(--red-fg)">(今日防封暂停)</strong>' : ""}</span>
            <input type="text" value="${esc(t.profile_name)}" data-track-name="${esc(t.track_key)}">
          </div>
          <label class="field">
            <span>绑定 Ego 浏览器配置</span>
            <select data-track-profile="${esc(t.track_key)}">
              ${profilesList.map((p) => `<option value="${esc(p.id)}" data-name="${esc(p.name)}" ${p.id === t.profile_id ? "selected" : ""}>${esc(p.name)} (${esc(p.id)})</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>每日打招呼安全上限</span>
            <input type="number" min="1" max="60" value="${esc(t.daily_limit)}" data-track-limit="${esc(t.track_key)}">
          </label>
          <div class="right-row">
            <button type="button" class="btn btn-secondary btn-xs" data-save-track="${esc(t.track_key)}">保存账号配置</button>
            ${t.breaker_active ? `<button type="button" class="btn btn-ghost btn-xs" data-clear-breaker="${esc(t.track_key)}">恢复使用</button>` : ""}
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
      els.liveLogLatest.textContent = "已更新 Boss 账号绑定";
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
  if (form.deliver_auto_send) form.deliver_auto_send.value = settings.deliver_auto_send ?? "true";
  if (form.deliver_send_image) form.deliver_send_image.value = settings.deliver_send_image ?? "true";
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
  if (form.boss_native_filter) form.boss_native_filter.value = settings.boss_native_filter || "true";
  if (form.boss_salary_filter) form.boss_salary_filter.value = settings.boss_salary_filter || "";
  form.delay_min_ms.value = settings.delay_min_ms || "4500";
  form.delay_max_ms.value = settings.delay_max_ms || "8500";
  form.auto_web_search.value = settings.auto_web_search || "true";
  form.auto_check_update.value = settings.auto_check_update || "true";
  form.github_repo.value = settings.github_repo || "ShawnLi-code/boss-ai-router";
  form.llm_base_url.value = settings.llm_base_url || "https://api.commandcode.ai/provider/v1";
  form.llm_model.value = settings.llm_model || "deepseek/deepseek-v4.1-flash-fast";
  form.llm_api_key.value = settings.llm_api_key || "";
  if (form.followup_reply_prompt) {
    form.followup_reply_prompt.value = settings.followup_reply_prompt || state.data?.defaultFollowupPrompt || "";
  }
  if (settings.min_hr_active && els.scrapeHrActive) els.scrapeHrActive.value = settings.min_hr_active;
}

const BOSS_STAGE_LABELS = {
  NEW_GREET: "新招呼",
  CHATTING: "仅沟通",
  EXCHANGED: "有交换",
  INTERVIEW: "有面试",
  NOT_INTERESTED: "不感兴趣",
};

function buildConversationLedger() {
  const logs = (state.data?.logs || []).filter((l) => l.status === "DELIVERED");
  const jobsMap = new Map((state.data?.jobs || []).map((j) => [j.id, j]));
  const groups = new Map();

  for (const l of logs) {
    const key = l.job_id ? `job:${l.job_id}` : `comp:${l.normalized_company || l.company_name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }

  const items = [];
  for (const [, rows] of groups) {
    const latest = rows[0];
    const job = latest.job_id ? jobsMap.get(latest.job_id) : null;
    const msgs = Array.isArray(job?.chat_messages) ? job.chat_messages.filter((m) => m && m.text) : [];
    const hasMeInThread = msgs.some((m) => m.sender === "ME");
    const hasHrInThread = msgs.some((m) => m.sender === "HR");
    const sentByMeViaApp = rows.some((r) => ["AUTO_SEND", "PREFILL_HANDOFF", "FOLLOWUP_REPLY", "BOSS_ALREADY_CONTACTED", "MANUAL_SYNC"].includes(r.action));
    const sentByMe = hasMeInThread || sentByMeViaApp || (!hasHrInThread && rows.some((r) => r.text_sent));
    const hasHrMsg = hasHrInThread || rows.some((r) => String(r.detail || "").includes("HR已回复")) || job?.status === "REPLIED";
    const hrInitiated = !sentByMe && hasHrMsg;
    const mutualReplied = sentByMe && hasHrMsg;

    const hasImg = rows.some((r) => r.image_sent || r.image_status === "SENT") || job?.tailored_resume?.image_delivery === "SENT";
    const hasText = sentByMe;

    let lastSender = "ME";
    let lastText = "";
    if (msgs.length > 0) {
      const lastMsg = msgs[msgs.length - 1];
      lastSender = lastMsg.sender === "HR" ? "HR" : "ME";
      lastText = lastMsg.text;
    } else {
      lastSender = latest.action === "FOLLOWUP_REPLY" || latest.action === "AUTO_SEND" ? "ME" : (hasHrMsg ? "HR" : "ME");
      lastText = latest.greeting_text || "";
    }

    let bossStage = job?.boss_stage || "";
    if (!bossStage) {
      if (job?.status === "INTERVIEW") bossStage = "INTERVIEW";
      else if (job?.status === "REJECTED") bossStage = "NOT_INTERESTED";
      else if (/面试|约.*时间|线下面|视频面/.test(lastText)) bossStage = "INTERVIEW";
      else if (/微信|交换|联系方式|加[vV]|已发送简历/.test(lastText)) bossStage = "EXCHANGED";
      else if (/暂不合适|已招满|暂不考虑|感谢投递/.test(lastText)) bossStage = "NOT_INTERESTED";
      else if (hrInitiated) bossStage = "NEW_GREET";
      else bossStage = "CHATTING";
    }

    items.push({
      job_id: latest.job_id,
      company_name: latest.company_name,
      normalized_company: latest.normalized_company || latest.company_name,
      job_title: latest.job_title || job?.job_title || "",
      salary_range: latest.salary_range || job?.salary_range || "",
      profile_id: latest.profile_id,
      created_at: latest.created_at,
      detail: latest.detail || "",
      msgCount: msgs.length || rows.length,
      unreadCount: Number(job?.boss_unread_count || 0),
      bossStage,
      sentByMe,
      hasHrMsg,
      hrInitiated,
      mutualReplied,
      hasImg,
      hasText,
      lastSender,
      lastText,
    });
  }
  return items;
}

function deliveryConvBadgesHtml(c) {
  const unreadHtml = c.unreadCount > 0 ? `<span class="zone-tag zone-RED">未读 ${esc(c.unreadCount)}</span>` : "";
  const stageColor = c.bossStage === "INTERVIEW" || c.bossStage === "EXCHANGED"
    ? "zone-GREEN"
    : c.bossStage === "NEW_GREET"
      ? "zone-YELLOW"
      : c.bossStage === "NOT_INTERESTED"
        ? "zone-RED"
        : "zone-GREEN";
  const stageBadge = `<span class="zone-tag ${stageColor}">${esc(BOSS_STAGE_LABELS[c.bossStage] || "仅沟通")}</span>`;
  const materialBadge = c.hasImg
    ? `<span class="zone-tag zone-GREEN">🖼️ 已发送文字+图片</span>`
    : c.hasText
      ? `<span class="meta-pill">📝 已发送文字</span>`
      : `<span class="meta-pill">HR主动发来</span>`;

  return `${unreadHtml} ${stageBadge} ${materialBadge}`.trim();
}

function renderDeliveries() {
  if (!els.deliveriesList || !els.deliveryKpiStrip) return;
  const convs = buildConversationLedger();
  const uniqueCompanies = new Set(convs.map((c) => c.normalized_company || c.company_name)).size;
  const textOnlyCount = convs.filter((c) => c.hasText && !c.hasImg).length;
  const textAndImgCount = convs.filter((c) => c.hasText && c.hasImg).length;
  const unreadTotal = convs.filter((c) => c.unreadCount > 0).length;
  const newGreetCount = convs.filter((c) => c.bossStage === "NEW_GREET").length;
  const chattingCount = convs.filter((c) => c.bossStage === "CHATTING").length;
  const exchangedCount = convs.filter((c) => c.bossStage === "EXCHANGED").length;
  const interviewCount = convs.filter((c) => c.bossStage === "INTERVIEW").length;
  const notIntCount = convs.filter((c) => c.bossStage === "NOT_INTERESTED").length;

  els.deliveryKpiStrip.innerHTML = `
    <div class="funnel-card">
      <strong>全部对话</strong>
      <div style="font-size:16px;font-weight:700;">${esc(convs.length)} 个会话 <span class="muted" style="font-size:12px;">(${esc(uniqueCompanies)} 家企业)</span></div>
      <div class="muted">按 Boss 标签分类管理</div>
    </div>
    <div class="funnel-card">
      <strong>未读 / 新招呼</strong>
      <div style="font-size:16px;font-weight:700;color:var(--yellow-fg);">未读 ${esc(unreadTotal)} · 新招呼 ${esc(newGreetCount)}</div>
      <div class="muted">点「同步」更新 Boss 未读</div>
    </div>
    <div class="funnel-card">
      <strong>文字 / 图片发送</strong>
      <div style="font-size:16px;font-weight:700;color:var(--accent-teal);">仅文字 ${esc(textOnlyCount)} · 文字+图片 ${esc(textAndImgCount)}</div>
      <div class="muted">支持右侧按发送内容筛选</div>
    </div>
    <div class="funnel-card">
      <strong>进展节点</strong>
      <div style="font-size:16px;font-weight:700;color:var(--green-fg);">有交换 ${esc(exchangedCount)} · 有面试 ${esc(interviewCount)}</div>
      <div class="muted">不感兴趣 ${esc(notIntCount)} 个</div>
    </div>
  `;

  if (els.deliveryProfileFilter) {
    const profiles = [...new Set(convs.map((c) => c.profile_id).filter(Boolean))];
    const prev = state.deliveryProfile;
    els.deliveryProfileFilter.innerHTML = `<option value="ALL">全部账号</option>`
      + profiles.map((pid) => `<option value="${esc(pid)}" ${prev === pid ? "selected" : ""}>${esc(profileDisplayName(pid))}</option>`).join("");
  }

  const q = state.deliverySearch.trim().toLowerCase();
  const baseFiltered = convs.filter((c) => {
    if (state.deliveryProfile !== "ALL" && c.profile_id !== state.deliveryProfile) return false;
    if (state.deliveryMaterial === "TEXT_ONLY" && !(c.hasText && !c.hasImg)) return false;
    if (state.deliveryMaterial === "WITH_IMAGE" && !(c.hasText && c.hasImg)) return false;
    if (q) {
      const hay = `${c.company_name} ${c.job_title} ${profileDisplayName(c.profile_id)} ${c.lastText} ${c.detail}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = String(n); };
  setCount("dcnt-all", baseFiltered.length);
  setCount("dcnt-unread", baseFiltered.filter((c) => c.unreadCount > 0).length);
  setCount("dcnt-new-greet", baseFiltered.filter((c) => c.bossStage === "NEW_GREET").length);
  setCount("dcnt-chatting", baseFiltered.filter((c) => c.bossStage === "CHATTING").length);
  setCount("dcnt-exchanged", baseFiltered.filter((c) => c.bossStage === "EXCHANGED").length);
  setCount("dcnt-interview", baseFiltered.filter((c) => c.bossStage === "INTERVIEW").length);
  setCount("dcnt-not-interested", baseFiltered.filter((c) => c.bossStage === "NOT_INTERESTED").length);

  const stageMatches = (c) => {
    if (state.deliveryFilter === "UNREAD") return c.unreadCount > 0;
    if (["NEW_GREET", "CHATTING", "EXCHANGED", "INTERVIEW", "NOT_INTERESTED"].includes(state.deliveryFilter)) {
      return c.bossStage === state.deliveryFilter;
    }
    return true;
  };
  let filtered = baseFiltered.filter(stageMatches);
  if (filtered.length === 0 && state.deliveryFilter !== "ALL" && baseFiltered.length > 0) {
    state.deliveryFilter = "ALL";
    document.querySelectorAll(".seg-btn[data-delivery-filter]").forEach((b) => {
      b.classList.toggle("active", b.dataset.deliveryFilter === "ALL");
    });
    filtered = baseFiltered;
  }

  if (filtered.length === 0) {
    els.deliveriesList.innerHTML = `<p class="muted">当前标签下暂无会话。</p>`;
    return;
  }

  const hasResumeImg = Boolean(state.data?.resume_image?.exists);
  els.deliveriesList.innerHTML = filtered
    .map((c) => {
      const canSendImg = Boolean(c.job_id && hasResumeImg && !c.hasImg);
      const quoteLabel = c.lastSender === "ME"
        ? "📤 我方最近发出："
        : c.hrInitiated
          ? "📩 HR主动发来："
          : "📩 对方最新回复：";
      return `
        <article class="delivery-card">
          <div class="delivery-card-head">
            <div>
              <strong>${esc(c.company_name)}</strong>${c.job_title ? ` · <span>${esc(c.job_title)}</span>` : ""}
              ${c.salary_range ? ` <span class="meta-pill">${esc(c.salary_range)}</span>` : ""}
              <span class="muted" style="margin-left:6px;">${esc(profileDisplayName(c.profile_id))} · ${esc(fmtTime(c.created_at))}${c.msgCount > 1 ? ` · 共${esc(c.msgCount)}条动态` : ""}</span>
            </div>
            <div class="delivery-card-badges">
              ${deliveryConvBadgesHtml(c)}
              ${c.job_id ? `
                <select class="input-compact" style="padding:2px 6px;font-size:11.5px;" data-conv-stage="${c.job_id}" aria-label="切换 Boss 对话标签">
                  ${Object.entries(BOSS_STAGE_LABELS).map(([k, v]) => `<option value="${k}" ${c.bossStage === k ? "selected" : ""}>${v}</option>`).join("")}
                </select>
              ` : ""}
            </div>
          </div>
          ${c.lastText ? `<div class="delivery-quote"><strong style="color:${c.lastSender === "HR" ? "var(--green-fg)" : "var(--accent-teal)"};">${quoteLabel}</strong>${esc(c.lastText)}</div>` : ""}
          <div class="delivery-card-actions">
            <span class="muted" style="font-size:12px;">${esc(c.detail || "")}</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${c.job_id ? `<button type="button" class="btn btn-primary btn-xs" data-deliv-followup="${c.job_id}" data-deliv-profile="${esc(c.profile_id)}">💬 连续沟通/回复模板</button>` : ""}
              ${c.job_id ? `<button type="button" class="btn btn-secondary btn-xs" data-deliv-jump="${c.job_id}">查看岗位详情</button>` : ""}
              ${canSendImg ? `<button type="button" class="btn btn-secondary btn-xs" data-deliv-send-img="${c.job_id}" data-deliv-profile="${esc(c.profile_id)}">🖼️ 发送图片简历</button>` : ""}
              ${c.job_id ? `<button type="button" class="btn btn-ghost btn-xs" data-deliv-open="${c.job_id}" data-deliv-profile="${esc(c.profile_id)}">在 Ego 打开</button>` : ""}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  els.deliveriesList.querySelectorAll("[data-conv-stage]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await api(`/api/jobs/${sel.dataset.convStage}`, {
        method: "PATCH",
        body: JSON.stringify({ boss_stage: sel.value }),
      });
      await refreshState();
    });
  });

  els.deliveriesList.querySelectorAll("[data-deliv-followup]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openFollowupModal(Number(btn.dataset.delivFollowup), btn.dataset.delivProfile);
    });
  });

  els.deliveriesList.querySelectorAll("[data-deliv-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedJobId = Number(btn.dataset.delivJump);
      switchView("jobs");
      renderJobList();
      renderInspector(true);
    });
  });

  els.deliveriesList.querySelectorAll("[data-deliv-open]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/jobs/${btn.dataset.delivOpen}/open`, {
        method: "POST",
        body: JSON.stringify({ profileId: btn.dataset.delivProfile }),
      }).catch((err) => alert(err.message));
    });
  });

  els.deliveriesList.querySelectorAll("[data-deliv-send-img]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const jobId = btn.dataset.delivSendImg;
      const pid = btn.dataset.delivProfile;
      setWorkerBusy(true, `正在用 ${pid} 补发高清图片简历...`);
      try {
        const res = await api(`/api/jobs/${jobId}/deliver`, {
          method: "POST",
          body: JSON.stringify({ profileId: pid, onlySendImage: true, autoSend: true, sendImageResume: true }),
        });
        if (res.status === "VERIFICATION_REQUIRED") showVerifyBanner(res);
        else els.liveLogLatest.textContent = res.delivery?.message || "已完成补发图片尝试";
        await refreshState();
      } catch (err) {
        alert(err.message);
      } finally {
        setWorkerBusy(false);
      }
    });
  });
}

function renderDeliveryLogs() {
  const convs = buildConversationLedger();
  if (convs.length === 0) {
    els.deliveryLogsList.innerHTML = `<p class="muted">暂无沟通记录。</p>`;
    return;
  }
  els.deliveryLogsList.innerHTML = convs
    .slice(0, 30)
    .map((c) => `
      <div class="log-item">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <span><strong>${esc(c.company_name)}</strong>${c.job_title ? ` · ${esc(c.job_title)}` : ""} · ${esc(profileDisplayName(c.profile_id))}</span>
          <span>${deliveryConvBadgesHtml(c)}</span>
        </div>
        <div class="muted">${esc(fmtTime(c.created_at))} — ${esc(c.lastText ? c.lastText.slice(0, 80) : c.detail)}</div>
      </div>
    `)
    .join("");
}

document.querySelectorAll(".seg-btn[data-delivery-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg-btn[data-delivery-filter]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.deliveryFilter = btn.dataset.deliveryFilter;
    renderDeliveries();
  });
});

els.deliveryMaterialFilter?.addEventListener("change", () => {
  state.deliveryMaterial = els.deliveryMaterialFilter.value;
  renderDeliveries();
});

els.deliveryProfileFilter?.addEventListener("change", () => {
  state.deliveryProfile = els.deliveryProfileFilter.value;
  renderDeliveries();
});

els.deliverySearchInput?.addEventListener("input", () => {
  state.deliverySearch = els.deliverySearchInput.value;
  renderDeliveries();
});

els.btnSyncBossChats?.addEventListener("click", async () => {
  setWorkerBusy(true, "正在从 Boss 聊天列表同步最新对话与 HR 回复...");
  try {
    const res = await api("/api/deliveries/sync-boss", { method: "POST", body: JSON.stringify({}) });
    if (res.status === "VERIFICATION_REQUIRED") {
      showVerifyBanner(res);
    } else {
      const nNew = res.syncedCount || 0;
      const nUpd = res.updatedCount || 0;
      const msg = (nNew > 0 || nUpd > 0)
        ? `🔄 同步完成：新增 ${nNew} 条、更新 ${nUpd} 条最新回复/状态（${(res.matchedCompanies || []).slice(0, 4).join("、")}）`
        : "🔄 同步完成，已是最新状态；如需看完整多轮聊天记录，点卡片上的「💬 连续沟通/回复模板」即可自动拉取。";
      els.liveLogLatest.textContent = msg;
      alert(msg);
    }
    await refreshState();
  } catch (err) {
    alert(err.message);
  } finally {
    setWorkerBusy(false);
  }
});

// ============================================================================
// Continuous Follow-up & Multi-Turn Reply Advisor
// ============================================================================
function renderFollowupModalBody() {
  const job = (state.data?.jobs || []).find((j) => j.id === state.followupJobId);
  if (!job) return;
  const msgs = state.followupMessages || [];
  const hasImgAsset = Boolean(state.data?.resume_image?.exists);

  els.followupModalSub.textContent = `${job.company_name} · ${job.job_title} · 账号 ${profileDisplayName(state.followupProfileId)} · 当前状态：${STATUS_LABELS[job.status] || job.status}`;
  els.followupImgUnlockPill.textContent = !hasImgAsset
    ? "未配置图片简历"
    : state.followupCanSendImg
      ? "🖼️ Boss已解锁发图"
      : msgs.some((m) => m.sender === "HR")
        ? "🖼️ HR已回，可尝试发图"
        : "⏳ 对方回复前 Boss 暂锁首图";

  if (msgs.length === 0) {
    els.followupChatThread.innerHTML = `<div class="muted" style="text-align:center;margin:auto;">暂无本地缓存对话，点击右上角「🔄 拉取最新 Boss 对话」或在下方手动贴入 HR 回复。</div>`;
  } else {
    els.followupChatThread.innerHTML = msgs
      .map((m) => {
        const cleanBody = String(m.text || "").trim();
        const isImgPlaceholder = /^\[图片(?:消息|简历)?\]$/.test(cleanBody);
        const isImg = Boolean(m.imageUrl || m.kind === "image" || isImgPlaceholder);
        const resumeUrl = hasImgAsset ? state.data.resume_image.url : "";
        const primaryImgSrc = m.imageUrl || (m.sender === "ME" ? resumeUrl : "");
        const fallbackAttr = (m.sender === "ME" && resumeUrl && primaryImgSrc !== resumeUrl)
          ? ` data-fallback="${esc(resumeUrl)}"`
          : "";
        const imgHtml = isImg && primaryImgSrc
          ? `<div class="chat-bubble-img-wrap"><img class="chat-bubble-img" src="${esc(primaryImgSrc)}" referrerpolicy="no-referrer" alt="聊天图片"${fallbackAttr} data-preview-chat-img></div>`
          : isImg
            ? `<div class="muted" style="font-size:12px;">🖼️ [聊天图片未加载，点击右上角「🔄 拉取最新 Boss 对话」查看原图]</div>`
            : "";
        const showText = cleanBody && !(isImg && isImgPlaceholder);
        return `
          <div class="chat-bubble ${m.sender === "ME" ? "chat-bubble-me" : "chat-bubble-hr"}">
            <div class="chat-bubble-meta">${m.sender === "ME" ? "我" : "HR"}${m.time ? ` · ${esc(m.time)}` : ""}</div>
            ${showText ? `<div>${esc(cleanBody)}</div>` : ""}${imgHtml}
          </div>
        `;
      })
      .join("");
    els.followupChatThread.querySelectorAll("[data-preview-chat-img]").forEach((img) => {
      img.addEventListener("load", () => {
        els.followupChatThread.scrollTop = els.followupChatThread.scrollHeight;
      });
      img.addEventListener("error", () => {
        if (img.dataset.fallback) {
          img.src = img.dataset.fallback;
          img.removeAttribute("data-fallback");
        }
      });
      img.addEventListener("click", () => {
        if (!els.imagePreviewModal || !els.imagePreviewFull) return;
        els.imagePreviewFull.src = img.currentSrc || img.src;
        els.imagePreviewModal.showModal();
      });
    });
    els.followupChatThread.scrollTop = els.followupChatThread.scrollHeight;
  }

  const adv = state.followupAdvice;
  if (adv) {
    const modelTag = adv.used_llm
      ? `（${adv.llm_model || "DeepSeek AI"} 实时定制）`
      : "（未启用 AI，暂展示兜底参考）";
    els.followupIntentTitle.textContent = `🎯 识别对方意图：${adv.intent_label || "待分析"}${modelTag}`;
    const noticeHtml = !adv.used_llm && adv.llm_notice
      ? `<div style="margin-top:4px;color:var(--yellow-fg);">${esc(adv.llm_notice)} <button type="button" id="followup-goto-settings-btn" class="btn btn-ghost btn-xs" style="padding:1px 6px;">去填 API Key</button></div>`
      : "";
    els.followupStrategyTip.innerHTML = `${esc(adv.strategy_tip || "")}${noticeHtml}`;
    document.getElementById("followup-goto-settings-btn")?.addEventListener("click", () => {
      els.followupModal?.close();
      switchView("settings");
    });
    const curText = els.followupReplyTextarea.value.trim();
    els.followupTemplatesList.innerHTML = (adv.templates || [])
      .map((t, idx) => `
        <button type="button" class="reply-tpl-card ${curText === t.text ? "active" : ""}" data-followup-tpl="${idx}">
          <div class="reply-tpl-head">
            <span>${esc(t.label)}</span>
            <span class="meta-pill">${esc(t.tag || "参考")}</span>
          </div>
          <div class="muted" style="font-size:12px;line-height:1.45;">${esc(t.text)}</div>
        </button>
      `)
      .join("");
    els.followupTemplatesList.querySelectorAll("[data-followup-tpl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tpl = adv.templates[Number(btn.dataset.followupTpl)];
        if (!tpl) return;
        els.followupReplyTextarea.value = tpl.text;
        els.followupReplyLen.textContent = String(tpl.text.length);
        els.followupTemplatesList.querySelectorAll("[data-followup-tpl]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  els.followupSendImgChk.disabled = !hasImgAsset;
  if (els.followupPreviewImgBtn) els.followupPreviewImgBtn.hidden = !hasImgAsset;
  if (!hasImgAsset) els.followupSendImgChk.checked = false;
}

async function openFollowupModal(jobId, profileId) {
  const job = (state.data?.jobs || []).find((j) => j.id === jobId);
  if (!job) return;
  state.followupJobId = jobId;
  state.followupProfileId = profileId || job.assigned_profile_id || job.source_profile_id || "Profile 1";
  state.followupMessages = Array.isArray(job.chat_messages) ? [...job.chat_messages] : [];
  state.followupCanSendImg = false;
  state.followupAdvice = null;
  els.followupManualHrInput.value = "";
  els.followupReplyTextarea.value = "";
  els.followupReplyLen.textContent = "0";
  els.followupSendImgChk.checked = false;

  renderFollowupModalBody();
  if (!els.followupModal.open) els.followupModal.showModal();

  // 若本地只有 0~1 条记录（例如尚未拉取完整多轮对话），自动同步一次真实 Boss 对话记录
  if (state.followupMessages.length < 2) {
    await syncFollowupFromBoss({ silentNotFound: true });
    return;
  }

  try {
    const res = await api(`/api/jobs/${jobId}/chat/suggest`, {
      method: "POST",
      body: JSON.stringify({ profileId: state.followupProfileId, messages: state.followupMessages }),
    });
    state.followupAdvice = res.advice;
    if (res.advice?.templates?.[0] && !els.followupReplyTextarea.value) {
      els.followupReplyTextarea.value = res.advice.templates[0].text;
      els.followupReplyLen.textContent = String(res.advice.templates[0].text.length);
    }
    renderFollowupModalBody();
  } catch (err) {
    els.followupStrategyTip.textContent = `生成模板失败：${err.message}`;
  }
}

async function syncFollowupFromBoss({ silentNotFound = false } = {}) {
  if (!state.followupJobId) return;
  els.followupSyncBtn.disabled = true;
  els.followupStrategyTip.textContent = "正在自动拉取 Boss 实时完整对话并匹配回复模板...";
  setWorkerBusy(true, "正在从 Boss 拉取真实对话记录并对齐回复模板...");
  try {
    const res = await api(`/api/jobs/${state.followupJobId}/chat/sync`, {
      method: "POST",
      body: JSON.stringify({ profileId: state.followupProfileId, customHint: els.followupManualHrInput.value.trim() }),
    });
    if (res.status === "VERIFICATION_REQUIRED") {
      showVerifyBanner(res);
      return;
    }
    if (!silentNotFound && res.chatStatus === "NOT_FOUND" && res.message) {
      alert(res.message);
    }
    state.followupMessages = res.messages || [];
    state.followupCanSendImg = Boolean(res.canSendImage);
    state.followupAdvice = res.advice || state.followupAdvice;
    if (res.advice?.templates?.[0]) {
      els.followupReplyTextarea.value = res.advice.templates[0].text;
      els.followupReplyLen.textContent = String(res.advice.templates[0].text.length);
    }
    if (state.followupCanSendImg && state.data?.resume_image?.exists) {
      els.followupSendImgChk.checked = true;
    }
    await refreshState();
    renderFollowupModalBody();
  } catch (err) {
    if (!silentNotFound) alert(err.message);
    else els.followupStrategyTip.textContent = `拉取实时对话失败：${err.message}`;
  } finally {
    els.followupSyncBtn.disabled = false;
    setWorkerBusy(false);
  }
}

els.followupReplyTextarea?.addEventListener("input", () => {
  els.followupReplyLen.textContent = String(els.followupReplyTextarea.value.length);
});

els.followupSyncBtn?.addEventListener("click", () => syncFollowupFromBoss({ silentNotFound: false }));

els.followupRecalcBtn?.addEventListener("click", async () => {
  if (!state.followupJobId) return;
  const manualLine = els.followupManualHrInput.value.trim();
  const nextMsgs = manualLine
    ? [...(state.followupMessages || []), { sender: "HR", time: "刚才", text: manualLine }]
    : (state.followupMessages || []);
  state.followupMessages = nextMsgs;
  els.followupManualHrInput.value = "";
  try {
    const res = await api(`/api/jobs/${state.followupJobId}/chat/suggest`, {
      method: "POST",
      body: JSON.stringify({ profileId: state.followupProfileId, messages: nextMsgs, customHint: manualLine }),
    });
    state.followupAdvice = res.advice;
    if (res.advice?.templates?.[0]) {
      els.followupReplyTextarea.value = res.advice.templates[0].text;
      els.followupReplyLen.textContent = String(res.advice.templates[0].text.length);
    }
    renderFollowupModalBody();
  } catch (err) {
    alert(err.message);
  }
});

els.followupCopyBtn?.addEventListener("click", async () => {
  const txt = els.followupReplyTextarea.value.trim();
  if (!txt) return;
  await navigator.clipboard.writeText(txt);
  els.followupCopyBtn.textContent = "✅ 已复制";
  setTimeout(() => { els.followupCopyBtn.textContent = "📋 复制回复"; }, 1400);
});

els.followupPreviewImgBtn?.addEventListener("click", () => {
  if (!state.data?.resume_image?.exists || !els.imagePreviewModal || !els.imagePreviewFull) return;
  els.imagePreviewFull.src = state.data.resume_image.url;
  els.imagePreviewModal.showModal();
});

els.followupSendBtn?.addEventListener("click", async () => {
  if (!state.followupJobId) return;
  const replyText = els.followupReplyTextarea.value.trim();
  const sendImageResume = Boolean(els.followupSendImgChk.checked);
  if (!replyText && !sendImageResume) return alert("请先选择或输入回复内容，或勾选图片简历");
  els.followupSendBtn.disabled = true;
  setWorkerBusy(true, "正在通过 Ego 发送跟进回复...");
  try {
    const res = await api(`/api/jobs/${state.followupJobId}/chat/send`, {
      method: "POST",
      body: JSON.stringify({
        profileId: state.followupProfileId,
        replyText,
        sendImageResume,
      }),
    });
    if (res.status === "VERIFICATION_REQUIRED") {
      showVerifyBanner(res);
      return;
    }
    state.followupMessages = res.messages || state.followupMessages;
    state.followupAdvice = res.advice || state.followupAdvice;
    els.followupReplyTextarea.value = "";
    els.followupReplyLen.textContent = "0";
    els.liveLogLatest.textContent = res.delivery?.message || "已发送回复";
    await refreshState();
    renderFollowupModalBody();
    alert(res.delivery?.message || "已发送回复");
  } catch (err) {
    alert(err.message);
  } finally {
    els.followupSendBtn.disabled = false;
    setWorkerBusy(false);
  }
});

// ============================================================================
// Batch Multi-Select & Template-Style One-Click Delivery
// ============================================================================
els.btnToggleBatch?.addEventListener("click", () => {
  if (state.batchRunning) return;
  state.batchMode = !state.batchMode;
  updateBatchBarUi();
  renderJobList();
});

els.btnBatchSelectNew?.addEventListener("click", () => {
  const visible = getFilteredSortedJobs();
  for (const j of visible) {
    if (j.filter_status === "FILTERED" || j.blacklisted) continue;
    if (CONTACTED_STATUSES.has(j.status) || (j.company_history || []).length > 0) continue;
    state.batchSelectedIds.add(j.id);
  }
  updateBatchBarUi();
  renderJobList();
});

els.btnBatchClear?.addEventListener("click", () => {
  state.batchSelectedIds.clear();
  updateBatchBarUi();
  renderJobList();
});

els.btnBatchStop?.addEventListener("click", () => {
  state.batchAbortRequested = true;
  if (els.batchProgressText) {
    els.batchProgressText.hidden = false;
    els.batchProgressText.textContent = "⏹️ 正在停止批量投递，当前条完成后将中止队列...";
  }
});

els.btnBatchDeliver?.addEventListener("click", async () => {
  if (state.batchRunning || state.batchSelectedIds.size === 0) return;
  const visibleMap = new Map((state.data?.jobs || []).map((j) => [j.id, j]));
  const targets = [...state.batchSelectedIds].map((id) => visibleMap.get(id)).filter(Boolean);
  if (targets.length === 0) return;

  const templateStyle = els.batchTemplateStyle?.value || "auto";
  const styleLabel = els.batchTemplateStyle?.selectedOptions?.[0]?.textContent || templateStyle;
  const chosenProfile = els.batchProfileSelect?.value || "auto";
  const sendImageResume = Boolean(els.batchSendImgChk?.checked && state.data?.resume_image?.exists);

  if (!confirm(`确认按「${styleLabel}」批量打招呼这 ${targets.length} 个岗位吗？\n\n系统会自动低速间隔 4.5~7.5 秒发送，遇到已沟通过/黑名单/跨号撞车公司将自动跳过，遇到验证立即暂停。`)) {
    return;
  }

  state.batchRunning = true;
  state.batchAbortRequested = false;
  updateBatchBarUi();
  if (els.batchProgressText) els.batchProgressText.hidden = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let okCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let verifyHalted = false;

  try {
    const tracks = state.data?.tracks || [];
    const profilePool = state.egoProfiles.length ? state.egoProfiles : tracks.map((t) => ({ id: t.profile_id, name: t.profile_name }));

    for (let i = 0; i < targets.length; i++) {
      if (state.batchAbortRequested) break;
      const latestJob = (state.data?.jobs || []).find((x) => x.id === targets[i].id) || targets[i];
      const stepLabel = `[${i + 1}/${targets.length}] ${latestJob.company_name} · ${latestJob.job_title}`;

      if (latestJob.blacklisted || CONTACTED_STATUSES.has(latestJob.status) || (latestJob.company_history || []).length > 0) {
        skippedCount++;
        state.batchSelectedIds.delete(latestJob.id);
        if (els.batchProgressText) els.batchProgressText.textContent = `⏭️ ${stepLabel}：黑名单或此前已沟通，已自动防重跳过`;
        continue;
      }

      const profileId = chosenProfile === "auto" ? pickBestProfileForJob(latestJob, tracks, profilePool) : chosenProfile;
      setWorkerBusy(true, `批量打招呼 ${stepLabel} (${profileId})`);
      if (els.batchProgressText) els.batchProgressText.textContent = `🚀 正在投递 ${stepLabel}（话术：${styleLabel}，账号：${profileId}）...`;

      try {
        const res = await api(`/api/jobs/${latestJob.id}/deliver`, {
          method: "POST",
          body: JSON.stringify({
            profileId,
            templateStyle,
            autoSend: true,
            sendImageResume,
          }),
        });
        if (res.status === "VERIFICATION_REQUIRED") {
          verifyHalted = true;
          showVerifyBanner(res);
          if (els.batchProgressText) els.batchProgressText.textContent = `⚠️ ${stepLabel} 触发验证，已停止队列保护账号`;
          break;
        }
        okCount++;
        state.batchSelectedIds.delete(latestJob.id);
        els.liveLogLatest.textContent = `${stepLabel}：${res.delivery?.message || "已发出"}`;
        await refreshState();
      } catch (err) {
        if (/防重复|防撞车|黑名单/.test(err.message)) {
          skippedCount++;
          state.batchSelectedIds.delete(latestJob.id);
        } else {
          failedCount++;
          if (els.batchProgressText) els.batchProgressText.textContent = `❌ ${stepLabel} 失败：${err.message}`;
          if (/防封熔断|安全上限/.test(err.message)) break;
        }
      }

      if (i < targets.length - 1 && !state.batchAbortRequested && !verifyHalted) {
        const waitMs = 4500 + Math.floor(Math.random() * 3000);
        if (els.batchProgressText) els.batchProgressText.textContent = `⏳ 已完成 ${okCount} 条，防风控冷却 ${(waitMs / 1000).toFixed(1)}s 后继续下一条...`;
        await sleep(waitMs);
      }
    }
  } finally {
    state.batchRunning = false;
    setWorkerBusy(false);
    await refreshState();
    const summary = verifyHalted
      ? `⚠️ 批量队列因安全验证已暂停：成功 ${okCount} 条、防重跳过 ${skippedCount} 条`
      : state.batchAbortRequested
        ? `⏹️ 已手动停止批量投递：成功 ${okCount} 条、跳过 ${skippedCount} 条、失败 ${failedCount} 条`
        : `✅ 批量投递完成：成功 ${okCount} 条、防重/黑名单跳过 ${skippedCount} 条、失败 ${failedCount} 条`;
    if (els.batchProgressText) els.batchProgressText.textContent = summary;
    els.liveLogLatest.textContent = summary;
    alert(summary);
  }
});

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
  els.liveLogLatest.textContent = `已保存 ${state.watchlist.length} 个默认巡检词`;
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
      els.updateBannerDesc.textContent = info.asset ? `可一键下载安装 (${info.asset.name})` : "点击查看更新说明";
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
  els.updateStatusText.textContent = "正在下载安装包，完成后自动安装并重启...";
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

// Patrol & Quick Scrape & Re-score
els.btnPatrol.addEventListener("click", async () => {
  const keywords = [...state.selectedWatchlist];
  if (keywords.length === 0) return alert("请至少勾选 1 个巡检岗位词");
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
        maxPerKeyword: Number(els.scrapeMax.value) || 10,
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
  setWorkerBusy(true, "正在采集单关键词岗位...");
  try {
    const res = await api("/api/jobs/scrape", {
      method: "POST",
      body: JSON.stringify({
        query: els.scrapeQuery.value.trim() || "AI测试",
        city: els.scrapeCity.value,
        minHrActive: els.scrapeHrActive.value,
        maxJobs: Number(els.scrapeMax.value) || 10,
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

els.scrapeQuery.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    els.btnScrape.click();
  }
});

async function reEvaluateAll() {
  setWorkerBusy(true, "正在按最新简历重算全部岗位匹配分...");
  try {
    const res = await api("/api/jobs/re-evaluate-all", { method: "POST" });
    await refreshState();
    els.liveLogLatest.textContent = `已按最新简历重算全部 ${res.count} 条岗位（精选保留 ${res.passCount} 条）`;
  } catch (err) {
    alert(err.message);
  } finally {
    setWorkerBusy(false);
  }
}

els.btnRecalcAll.addEventListener("click", reEvaluateAll);

els.btnPurgeFiltered.addEventListener("click", async () => {
  const cnt = Number(els.cntFiltered.textContent || 0);
  if (!confirm(`确定清空这 ${cnt} 条已过滤的杂岗吗？`)) return;
  await api("/api/jobs/purge-filtered", { method: "POST" });
  await refreshState();
});

els.btnCalcCommute.addEventListener("click", async () => {
  setWorkerBusy(true, "正在补全办公地址并测算单车+地铁通勤...");
  try {
    const res = await api("/api/jobs/enrich-commute", { method: "POST", body: JSON.stringify({}) });
    await refreshState();
    els.liveLogLatest.textContent = `已完成 ${res.updated} 个精选岗位的通勤测算`;
  } catch (err) {
    alert(err.message);
  } finally {
    setWorkerBusy(false);
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
  els.liveLogLatest.textContent = "✅ 设置已保存生效";
});

document.getElementById("btn-reset-prompt")?.addEventListener("click", () => {
  const defPrompt = state.data?.defaultFollowupPrompt || "";
  if (els.settingsForm?.followup_reply_prompt && defPrompt) {
    els.settingsForm.followup_reply_prompt.value = defPrompt;
  }
});

document.getElementById("btn-test-llm")?.addEventListener("click", async () => {
  const form = els.settingsForm;
  const btn = document.getElementById("btn-test-llm");
  if (!form || !btn) return;
  btn.disabled = true;
  btn.textContent = "测试中...";
  try {
    const res = await api("/api/settings/test-llm", {
      method: "POST",
      body: JSON.stringify({
        llm_base_url: form.llm_base_url?.value || "",
        llm_model: form.llm_model?.value || "",
        llm_api_key: form.llm_api_key?.value || "",
      }),
    });
    alert(res.message || "模型连接成功！");
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "🔌 测试模型连通";
  }
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
