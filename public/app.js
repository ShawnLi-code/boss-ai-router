const state = {
  data: null,
  egoProfiles: [],
  activeView: "jobs",
  activeZone: "ALL",
  selectedJobId: null,
  inspectorTab: "match",
  pendingVerifySpaceId: null,
  latestUpdate: null,
};

const els = {
  versionTag: document.getElementById("app-version-tag"),
  navJobsCount: document.getElementById("nav-jobs-count"),
  sideALabel: document.getElementById("side-a-label"),
  sideAQuota: document.getElementById("side-a-quota"),
  sideBLabel: document.getElementById("side-b-label"),
  sideBQuota: document.getElementById("side-b-quota"),
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
  scrapeQuery: document.getElementById("scrape-query"),
  scrapeCity: document.getElementById("scrape-city"),
  scrapeHrActive: document.getElementById("scrape-hr-active"),
  scrapeMax: document.getElementById("scrape-max"),
  scrapeProfile: document.getElementById("scrape-profile"),
  btnScrape: document.getElementById("btn-scrape"),
  btnOpenImport: document.getElementById("btn-open-import"),
  cntAll: document.getElementById("cnt-all"),
  cntRed: document.getElementById("cnt-red"),
  cntYellow: document.getElementById("cnt-yellow"),
  cntGreen: document.getElementById("cnt-green"),
  cntSkip: document.getElementById("cnt-skip"),
  jobListPane: document.getElementById("job-list-pane"),
  jobInspectorPane: document.getElementById("job-inspector-pane"),
  liveLogLatest: document.getElementById("live-log-latest"),
  resumesGrid: document.getElementById("resumes-grid"),
  btnSwapTracks: document.getElementById("btn-swap-tracks"),
  funnelCards: document.getElementById("funnel-cards"),
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
  PREPARED: "已预填待发",
  DELIVERED: "已投递",
  REPLIED: "HR已回复",
  INTERVIEW: "已约面试",
  REJECTED: "已婉拒/结束",
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

document.querySelectorAll(".seg-btn[data-zone]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg-btn[data-zone]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeZone = btn.dataset.zone;
    renderJobList();
  });
});

async function refreshState() {
  const data = await api("/api/state");
  state.data = data;
  if (data.version) els.versionTag.textContent = `v${data.version}`;
  setWorkerBusy(Boolean(data.activeLock), data.activeLock?.label);
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
  const { jobs, tracks } = state.data;
  els.navJobsCount.textContent = jobs.length;
  els.cntAll.textContent = jobs.length;
  els.cntRed.textContent = jobs.filter((j) => j.zone === "RED").length;
  els.cntYellow.textContent = jobs.filter((j) => j.zone === "YELLOW").length;
  els.cntGreen.textContent = jobs.filter((j) => j.zone === "GREEN").length;
  els.cntSkip.textContent = jobs.filter((j) => j.zone === "SKIP").length;

  const trackA = tracks.find((t) => t.track_key === "A");
  const trackB = tracks.find((t) => t.track_key === "B");
  if (trackA) {
    els.sideALabel.textContent = `A轨 · ${trackA.profile_name}`;
    els.sideAQuota.textContent = `${trackA.today_delivered}/${trackA.daily_limit}${trackA.breaker_active ? " 熔断" : ""}`;
  }
  if (trackB) {
    els.sideBLabel.textContent = `B轨 · ${trackB.profile_name}`;
    els.sideBQuota.textContent = `${trackB.today_delivered}/${trackB.daily_limit}${trackB.breaker_active ? " 熔断" : ""}`;
  }
}

function renderProfileSelectors() {
  const list = state.egoProfiles.length
    ? state.egoProfiles
    : (state.data?.tracks || []).map((t) => ({ id: t.profile_id, name: t.profile_name }));
  const current = els.scrapeProfile.value || state.data?.tracks?.find((t) => t.track_key === "B")?.profile_id || "Profile 1";
  els.scrapeProfile.innerHTML = list
    .map((p) => `<option value="${esc(p.id)}" ${p.id === current ? "selected" : ""}>${esc(p.name)} (${esc(p.id)})</option>`)
    .join("");
}

function zoneTagHtml(zone, score) {
  const text = zone === "SKIP" ? "SKIP" : `${zone} ${score}`;
  return `<span class="zone-tag zone-${esc(zone)}"><span class="zone-dot" aria-hidden="true"></span>${esc(text)}</span>`;
}

function renderJobList() {
  const jobs = (state.data?.jobs || []).filter((j) =>
    state.activeZone === "ALL" ? true : j.zone === state.activeZone
  );
  if (jobs.length === 0) {
    els.jobListPane.innerHTML = `<div class="empty-state">当前筛选下暂无岗位。</div>`;
    return;
  }

  const tracks = state.data.tracks || [];
  const trackMap = Object.fromEntries(tracks.map((t) => [t.track_key, t]));

  els.jobListPane.innerHTML = jobs
    .map((j) => {
      const effectiveKey = j.manual_track || (j.recommended_track === "A轨_真实日期版" ? "A" : j.recommended_track === "B轨_绿区池" ? "B" : null);
      const trackInfo = effectiveKey ? trackMap[effectiveKey] : null;
      const trackShort = j.zone === "SKIP" ? "跳过" : trackInfo ? `${effectiveKey}轨·${trackInfo.profile_name}` : "待定轨";
      const selected = j.id === state.selectedJobId;
      return `
        <button type="button" class="job-row" role="option" aria-selected="${selected}" data-select-job="${j.id}">
          <div class="job-row-top">
            <span class="job-row-title">${esc(j.job_title)}</span>
            <span class="job-row-salary">${esc(j.salary_range || "薪资未标")}</span>
          </div>
          <div class="job-row-sub">${esc(j.company_name)} · ${esc(j.scale || "规模未知")} · ${esc(j.recruiter_active || j.recruiter_title || "")}</div>
          <div class="job-row-meta">
            ${zoneTagHtml(j.zone, j.risk_score)}
            <span class="meta-pill">${esc(trackShort)}</span>
            <span class="meta-pill">匹配 ${esc(j.match_score)}%</span>
            <span class="muted" style="margin-left:auto;">${esc(STATUS_LABELS[j.status] || j.status)}</span>
          </div>
        </button>
      `;
    })
    .join("");

  els.jobListPane.querySelectorAll("[data-select-job]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.selectedJobId = Number(btn.dataset.selectJob);
      renderJobList();
      await renderInspector(true);
    });
  });
}

async function renderInspector(fetchFresh = false) {
  const id = state.selectedJobId;
  if (!id || !state.data?.jobs?.some((j) => j.id === id)) {
    els.jobInspectorPane.innerHTML = `<div class="empty-state">在左侧选择一个岗位，查看风控拆解、背调舆情、事实锁 Diff 并执行分号投递。</div>`;
    return;
  }

  const job = fetchFresh ? await api(`/api/jobs/${id}`) : state.data.jobs.find((j) => j.id === id);
  if (!job) return;

  const tracks = state.data.tracks || [];
  const effectiveKey = job.manual_track || (job.recommended_track === "A轨_真实日期版" ? "A" : job.recommended_track === "B轨_绿区池" ? "B" : "");
  const conflict = (job.company_history || []).find((h) => effectiveKey && h.track_key !== effectiveKey);
  const tailored = job.tailored_resume || {};
  const factGuard = tailored.fact_guard || { passed: true, issues: [] };
  const snippets = job.intel?.snippets || [];

  els.jobInspectorPane.innerHTML = `
    <div class="inspector-head">
      <div>
        <h2 class="inspector-title">${esc(job.job_title)} · ${esc(job.company_name)}</h2>
        <p class="inspector-sub">${esc(job.salary_range || "薪资未标")} · ${esc(job.scale || "规模未知")} · ${esc(job.financing || "融资未知")} · ${esc(job.industry || "行业未知")} · ${esc(job.recruiter_title || "招聘人")} (${esc(job.recruiter_active || "活跃度未知")})</p>
      </div>
      <div class="inspector-controls">
        ${zoneTagHtml(job.zone, job.risk_score)}
        <button type="button" class="btn btn-ghost btn-xs" id="insp-ban-btn">拉黑公司</button>
      </div>
    </div>

    ${job.blacklisted ? `<div class="conflict-alert">黑名单拦截：${esc(job.blacklisted.company_name)}（${esc(job.blacklisted.reason)}）</div>` : ""}
    ${conflict ? `<div class="conflict-alert">防撞车警告：该公司/关联主体此前已用 ${esc(conflict.track_key)}轨 (${esc(conflict.profile_id)}) 投递过，禁止再用另一账号重复投递！</div>` : ""}

    <div class="inspector-tabs" role="tablist" aria-label="岗位详情视图">
      <button type="button" role="tab" id="itab-match" aria-selected="${state.inspectorTab === "match"}">匹配改写与投递</button>
      <button type="button" role="tab" id="itab-risk" aria-selected="${state.inspectorTab === "risk"}">风控拆解与背调舆情</button>
      <button type="button" role="tab" id="itab-jd" aria-selected="${state.inspectorTab === "jd"}">原始 JD</button>
    </div>

    <div role="tabpanel" aria-labelledby="itab-match" ${state.inspectorTab === "match" ? "" : "hidden"}>
      <div class="panel-inner">
        <div class="form-grid">
          <label class="field">
            <span>投递轨道 / Ego 账号</span>
            <select id="insp-track-select">
              <option value="">-- 请定轨（当前未定轨/跳过） --</option>
              ${tracks.map((t) => `<option value="${esc(t.track_key)}" ${effectiveKey === t.track_key ? "selected" : ""}>${esc(t.track_label)} → ${esc(t.profile_name)} (${esc(t.profile_id)})</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>沟通状态</span>
            <select id="insp-status-select">
              ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${esc(k)}" ${job.status === k ? "selected" : ""}>${esc(v)}</option>`).join("")}
            </select>
          </label>
        </div>

        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;">
          <div style="font-size:12.5px;">
            <strong>人岗匹配 ${esc(job.match_score)}%</strong>
            <span class="muted" style="margin-left:8px;">命中：${esc((job.match?.matched_keywords || []).join("、") || "基础匹配")}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="zone-tag ${factGuard.passed ? "zone-GREEN" : "zone-RED"}">${factGuard.passed ? "事实锁通过" : "事实锁异常"}</span>
            <button type="button" class="btn btn-secondary btn-xs" id="insp-recalc-btn">按所选轨道重算</button>
          </div>
        </div>

        <details>
          <summary class="muted" style="cursor:pointer;">原文 vs 动态优化摘要 Diff 对比</summary>
          <div class="diff-grid" style="margin-top:8px;">
            <div>
              <span class="muted">母版原文：</span>
              <div class="code-box">${esc(tailored.original_summary || "尚未同步或无摘要")}</div>
            </div>
            <div>
              <span class="muted">动态适配：</span>
              <div class="code-box">${esc(tailored.tailored_summary || "")}</div>
            </div>
          </div>
        </details>

        <label class="field">
          <span>动态微调后的简历优势侧重点（用于导出定制 PDF）</span>
          <textarea id="insp-tailored-summary" rows="3">${esc(tailored.tailored_summary || "")}</textarea>
        </label>

        <label class="field">
          <span>专属打招呼话术（<strong id="insp-greeting-len">${(job.custom_greeting || "").length}</strong> / 120 字）</span>
          <textarea id="insp-greeting" rows="3" maxlength="120">${esc(job.custom_greeting || "")}</textarea>
        </label>

        <div class="right-row">
          <button type="button" class="btn btn-secondary btn-sm" id="insp-export-pdf">导出真 PDF 附件</button>
          <a class="btn btn-ghost btn-sm" href="/resume-print.html?jobId=${job.id}&track=${esc(effectiveKey || "B")}" target="_blank">打印预览</a>
          <button type="button" class="btn btn-secondary btn-sm" id="insp-save-btn">保存修改</button>
          <button type="button" class="btn btn-primary btn-sm" id="insp-deliver-prefill" ${conflict || job.blacklisted ? "disabled" : ""}>在 Ego 预填话术（推荐）</button>
          <button type="button" class="btn btn-ghost btn-sm" id="insp-deliver-auto" ${conflict || job.blacklisted ? "disabled" : ""}>直接发送</button>
        </div>
      </div>
    </div>

    <div role="tabpanel" aria-labelledby="itab-risk" ${state.inspectorTab === "risk" ? "" : "hidden"}>
      <div class="panel-inner">
        <div class="surface-box">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>评分明细（基础 10 分，上限 100）</strong>
            <button type="button" class="btn btn-secondary btn-xs" id="insp-refresh-intel">重新联网补查</button>
          </div>
          <ul class="evidence-list">
            ${(job.evidence || []).map((ev) => `<li>${esc(ev)}</li>`).join("")}
          </ul>
          <p class="muted">背调摘要：${esc(job.intel?.summary || job.intel_summary || "尚未补查")}</p>
          ${snippets.length ? `<ul class="evidence-list">${snippets.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)}</a><br><span class="muted">${esc(s.snippet)}</span></li>`).join("")}</ul>` : ""}
        </div>
      </div>
    </div>

    <div role="tabpanel" aria-labelledby="itab-jd" ${state.inspectorTab === "jd" ? "" : "hidden"}>
      <div class="panel-inner">
        <div class="code-box" style="max-height:420px;">${esc(job.jd_text || "无 JD 文本")}</div>
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

  document.getElementById("insp-ban-btn").addEventListener("click", async () => {
    if (!confirm(`确定将「${job.company_name}」加入避坑黑名单吗？`)) return;
    await api("/api/blacklist", { method: "POST", body: JSON.stringify({ company_name: job.company_name, reason: "工作台拉黑" }) });
    await refreshState();
  });

  document.getElementById("insp-refresh-intel").addEventListener("click", async () => {
    setWorkerBusy(true, "正在联网补查背调舆情...");
    try {
      await api(`/api/jobs/${job.id}/intel`, { method: "POST" });
      await refreshState();
      await renderInspector(true);
    } finally {
      setWorkerBusy(false);
    }
  });

  document.getElementById("insp-recalc-btn").addEventListener("click", async () => {
    const trackKey = document.getElementById("insp-track-select").value || undefined;
    await api(`/api/jobs/${job.id}/evaluate`, { method: "POST", body: JSON.stringify({ trackKey }) });
    await refreshState();
    await renderInspector(true);
  });

  document.getElementById("insp-export-pdf").addEventListener("click", async () => {
    const trackKey = document.getElementById("insp-track-select").value || effectiveKey || "B";
    setWorkerBusy(true, "正在渲染定制 PDF...");
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
    const trackKey = document.getElementById("insp-track-select").value || null;
    const status = document.getElementById("insp-status-select").value;
    const tailoredSummary = document.getElementById("insp-tailored-summary").value.trim();
    await api(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        manual_track: trackKey,
        status,
        custom_greeting: greetingEl.value.trim(),
        tailored_resume: { ...tailored, tailored_summary: tailoredSummary },
      }),
    });
    await refreshState();
  });

  const handleDeliver = async (autoSend) => {
    const trackKey = document.getElementById("insp-track-select").value;
    if (!trackKey) return alert("请先选择使用 A轨 还是 B轨 账号后再投递！");
    if (autoSend && !confirm("确认自动点击发送吗？建议优先用预填模式扫一眼再发。")) return;
    setWorkerBusy(true, `正在用 ${trackKey}轨 账号准备投递`);
    try {
      const res = await api(`/api/jobs/${job.id}/deliver`, {
        method: "POST",
        body: JSON.stringify({ trackKey, greetingText: greetingEl.value.trim(), autoSend }),
      });
      if (res.status === "VERIFICATION_REQUIRED") {
        showVerifyBanner(res);
      } else if (res.delivery?.status === "PREPARED_HANDOFF") {
        alert(`${res.delivery.message}\n请在 Ego 浏览器窗口确认发送（TaskSpace #${res.delivery.taskSpaceId}）。`);
      } else {
        alert("已完成投递！");
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

function renderResumes() {
  const { resumes, tracks } = state.data;
  const trackMap = Object.fromEntries(tracks.map((t) => [t.track_key, t]));
  els.resumesGrid.innerHTML = resumes
    .map((r) => {
      const tr = trackMap[r.track_key] || {};
      return `
        <article class="surface-box" data-resume-track="${esc(r.track_key)}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div>
              <h3>${esc(tr.track_label || r.track_key + "轨")}</h3>
              <p class="muted">绑定：${esc(tr.profile_name)} (${esc(tr.profile_id)}) · 同步：${esc(r.synced_at ? fmtTime(r.synced_at) : "未同步")}</p>
            </div>
            <button type="button" class="btn btn-secondary btn-xs" data-sync-resume="${esc(r.track_key)}">从 Ego 同步简历</button>
          </div>
          <div class="form-grid">
            <label class="field"><span>候选人名称</span><input type="text" data-field="candidate_name" value="${esc(r.candidate_name)}"></label>
            <label class="field"><span>经验标签</span><input type="text" data-field="years_label" value="${esc(r.years_label)}"></label>
          </div>
          <label class="field"><span>个人优势摘要</span><textarea rows="4" data-field="summary">${esc(r.summary)}</textarea></label>
          <label class="field"><span>核心技能（逗号分隔）</span><input type="text" data-field="skills" value="${esc((r.skills || []).join(", "))}"></label>
          <label class="field"><span>工作经历 JSON</span><textarea rows="5" data-field="experiences_json">${esc(JSON.stringify(r.experiences || [], null, 2))}</textarea></label>
          <label class="field"><span>项目经历 JSON</span><textarea rows="4" data-field="projects_json">${esc(JSON.stringify(r.projects || [], null, 2))}</textarea></label>
          <div class="right-row">
            <a class="btn btn-ghost btn-xs" href="/resume-print.html?track=${esc(r.track_key)}" target="_blank">预览基础版</a>
            <button type="button" class="btn btn-primary btn-xs" data-save-resume="${esc(r.track_key)}">保存母版</button>
          </div>
        </article>
      `;
    })
    .join("");

  els.resumesGrid.querySelectorAll("[data-sync-resume]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.syncResume;
      btn.disabled = true;
      setWorkerBusy(true, `正在从 Ego 读取 ${key} 轨简历`);
      try {
        const res = await api(`/api/resumes/${key}/sync`, { method: "POST" });
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

  els.resumesGrid.querySelectorAll("[data-save-resume]").forEach((btn) => {
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
        alert(`已保存 ${key} 轨简历母版`);
      } catch (err) {
        alert(`保存失败：${err.message}`);
      }
    });
  });
}

function renderFunnel() {
  const f = state.data?.funnel;
  if (!f) return;
  const card = (label, d) => `
    <div class="funnel-card">
      <strong>${esc(label)}</strong>
      <div class="muted">岗位 ${esc(d.total)} · 预填/发送 ${esc(d.prepared_or_sent)}</div>
      <div class="muted">实投 ${esc(d.delivered)} · 回复 ${esc(d.replied)} (${esc(d.reply_rate)}%)</div>
      <div class="muted">约面 ${esc(d.interviews)} (${esc(d.interview_rate)}%)</div>
    </div>
  `;
  els.funnelCards.innerHTML =
    card("A轨_真实日期版", f.A) +
    card("B轨_绿区池", f.B) +
    `<div class="funnel-card"><strong>反诈 / 黑名单拦截</strong><div class="muted">已跳过 ${esc(f.skipped)} / ${esc(f.total_jobs)} 条</div></div>`;
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
      (t) => `
      <div class="log-item">
        <div class="form-grid">
          <div class="field">
            <span>轨道 ${t.breaker_active ? '<strong style="color:var(--red-fg)">(今日熔断中)</strong>' : ""}</span>
            <input type="text" value="${esc(t.track_label)}" disabled>
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
      const opt = sel.selectedOptions[0];
      const limit = Number(els.tracksConfigList.querySelector(`[data-track-limit="${k}"]`).value) || 25;
      await api(`/api/tracks/${k}`, {
        method: "POST",
        body: JSON.stringify({ profile_id: sel.value, profile_name: opt?.dataset?.name || sel.value, daily_limit: limit }),
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
    els.deliveryLogsList.innerHTML = `<p class="muted">暂无投递记录。</p>`;
    return;
  }
  els.deliveryLogsList.innerHTML = logs
    .map((l) => `
      <div class="log-item">
        <strong>${esc(l.company_name)}</strong> · ${esc(l.track_key)}轨 (${esc(l.profile_id)}) · <span class="meta-pill">${esc(l.status)}</span>
        <div class="muted">${esc(fmtTime(l.created_at))} — ${esc(l.detail)}</div>
      </div>
    `)
    .join("");
}

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

// Actions
els.btnScrape.addEventListener("click", async () => {
  setWorkerBusy(true, "正在低速拟人采集...");
  try {
    const res = await api("/api/jobs/scrape", {
      method: "POST",
      body: JSON.stringify({
        query: els.scrapeQuery.value.trim() || "AI测试",
        city: els.scrapeCity.value,
        minHrActive: els.scrapeHrActive.value,
        maxJobs: Number(els.scrapeMax.value) || 8,
        profileId: els.scrapeProfile.value,
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
        jd_text: "银行核心AI风控问答系统测试，要求大厂背景，入职有严格背调与核薪流水。",
      },
      {
        job_title: "AI应用测试工程师",
        company_name: "广州灵眸跃动科技有限公司",
        scale: "20-99人",
        financing: "天使轮",
        industry: "人工智能",
        recruiter_title: "测试经理",
        salary_range: "12-18K",
        jd_text: "急招！独立负责测试从0到1搭建，主要做大模型Prompt评测和Playwright自动化，非外包。",
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
    els.liveLogLatest.textContent = "正在解析并按条件联网背调补查...";
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

els.btnSwapTracks.addEventListener("click", async () => {
  await api("/api/tracks/swap", { method: "POST" });
  await refreshState();
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
  const payload = Object.fromEntries(fd.entries());
  if (Number(payload.delay_min_ms) < 3000) payload.delay_min_ms = "3000";
  await api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
  await refreshState();
  alert("配置已保存");
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
