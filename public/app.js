const state = {
  data: null,
  egoProfiles: [],
  activeZone: "ALL",
  activeJobId: null,
  pendingVerifySpaceId: null,
  latestUpdate: null,
};

const els = {
  versionTag: document.getElementById("app-version-tag"),
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
  kpiRed: document.getElementById("kpi-red"),
  kpiYellow: document.getElementById("kpi-yellow"),
  kpiGreen: document.getElementById("kpi-green"),
  kpiQuota: document.getElementById("kpi-quota"),
  kpiAAccount: document.getElementById("kpi-a-account"),
  kpiBAccount: document.getElementById("kpi-b-account"),
  kpiQuotaDetail: document.getElementById("kpi-quota-detail"),
  scrapeQuery: document.getElementById("scrape-query"),
  scrapeCity: document.getElementById("scrape-city"),
  scrapeHrActive: document.getElementById("scrape-hr-active"),
  scrapeMax: document.getElementById("scrape-max"),
  scrapeProfile: document.getElementById("scrape-profile"),
  btnScrape: document.getElementById("btn-scrape"),
  btnOpenImport: document.getElementById("btn-open-import"),
  jobsTbody: document.getElementById("jobs-tbody"),
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
  jobModal: document.getElementById("job-modal"),
  jobModalTitle: document.getElementById("job-modal-title"),
  jobModalSub: document.getElementById("job-modal-sub"),
  jobModalBody: document.getElementById("job-modal-body"),
  importModal: document.getElementById("import-modal"),
  importForm: document.getElementById("import-form"),
  importJsonInput: document.getElementById("import-json-input"),
  btnFillSampleJobs: document.getElementById("btn-fill-sample-jobs"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
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
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

function setWorkerBusy(busy, label = "") {
  els.workerPill.classList.toggle("status-busy", busy);
  els.workerStatusText.textContent = busy ? (label || "Ego 执行中...") : "Ego 引擎空闲";
  els.btnScrape.disabled = busy;
}

function showVerifyBanner(payload) {
  state.pendingVerifySpaceId = payload.taskSpaceId || null;
  els.verifyTitle.textContent = `⚠️ Boss直聘需要人工安全验证（TaskSpace #${payload.taskSpaceId ?? "-"} · 已触发当日防封熔断）`;
  els.verifyDesc.textContent = payload.message || "Boss直聘触发了安全验证或登录提示，已移交给你处理；为防连续封号，该账号今日已触发防封熔断。";
  els.verifyBanner.hidden = false;
}

// Tabs
const tabs = [...document.querySelectorAll('[role="tab"]')];
const panels = [...document.querySelectorAll('[role="tabpanel"]')];

function selectTab(tab) {
  for (const t of tabs) {
    const active = t === tab;
    t.setAttribute("aria-selected", String(active));
    t.tabIndex = active ? 0 : -1;
  }
  for (const p of panels) {
    const match = p.getAttribute("aria-labelledby") === tab.id;
    p.hidden = !match;
  }
}

for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (e) => {
    const i = tabs.indexOf(tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next !== -1) {
      e.preventDefault();
      tabs[next].focus();
      selectTab(tabs[next]);
    }
  });
}

// Light dismiss fallback
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
  dialog.addEventListener("close", () => {
    dialog.returnValue = "";
  });
}

els.themeToggleBtn.addEventListener("click", () => {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme");
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const next = current ? (current === "dark" ? "light" : "dark") : (prefersDark ? "light" : "dark");
  root.setAttribute("data-theme", next);
});

document.querySelectorAll(".zone-filters .chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".zone-filters .chip").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeZone = btn.dataset.zone;
    renderJobsTable();
  });
});

async function refreshState() {
  const data = await api("/api/state");
  state.data = data;
  if (data.version) els.versionTag.textContent = `v${data.version}`;
  setWorkerBusy(Boolean(data.activeLock), data.activeLock?.label);
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
  renderKpis();
  renderProfileSelectors();
  renderJobsTable();
  renderResumes();
  renderFunnel();
  renderSettings();
  renderBlacklist();
  renderDeliveryLogs();
}

function renderKpis() {
  const { jobs, tracks } = state.data;
  const redCount = jobs.filter((j) => j.zone === "RED").length;
  const yellowCount = jobs.filter((j) => j.zone === "YELLOW").length;
  const greenCount = jobs.filter((j) => j.zone === "GREEN").length;

  const trackA = tracks.find((t) => t.track_key === "A");
  const trackB = tracks.find((t) => t.track_key === "B");

  els.kpiRed.textContent = redCount;
  els.kpiYellow.textContent = yellowCount;
  els.kpiGreen.textContent = greenCount;

  if (trackA) {
    els.kpiAAccount.textContent = `绑定：${trackA.profile_name} (${trackA.profile_id})${trackA.breaker_active ? " · 🛡️已熔断" : ""}`;
  }
  if (trackB) {
    els.kpiBAccount.textContent = `绑定：${trackB.profile_name} (${trackB.profile_id})${trackB.breaker_active ? " · 🛡️已熔断" : ""}`;
  }

  const used = (trackA?.today_delivered || 0) + (trackB?.today_delivered || 0);
  const cap = (trackA?.daily_limit || 25) + (trackB?.daily_limit || 25);
  els.kpiQuota.textContent = `${used} / ${cap}`;
  els.kpiQuotaDetail.textContent = `A轨 ${trackA?.today_delivered || 0}/${trackA?.daily_limit || 25} · B轨 ${trackB?.today_delivered || 0}/${trackB?.daily_limit || 25}`;
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

function formatZoneBadge(zone) {
  if (zone === "RED") return `<span class="zone-pill zone-RED">⛔ RED</span>`;
  if (zone === "YELLOW") return `<span class="zone-pill zone-YELLOW">⚠️ YELLOW</span>`;
  if (zone === "SKIP") return `<span class="zone-pill zone-SKIP">🚫 SKIP</span>`;
  return `<span class="zone-pill zone-GREEN">✅ GREEN</span>`;
}

const STATUS_LABELS = {
  NEW: "待处理",
  SKIP: "已拦截跳过",
  PREPARED: "已预填待发",
  DELIVERED: "已投递",
  REPLIED: "HR已回复",
  INTERVIEW: "已约面试",
  REJECTED: "已婉拒/结束",
};

function renderJobsTable() {
  const jobs = (state.data?.jobs || []).filter((j) =>
    state.activeZone === "ALL" ? true : j.zone === state.activeZone
  );
  if (jobs.length === 0) {
    els.jobsTbody.innerHTML = `<tr><td colspan="7" class="empty-cell">当前筛选下暂无岗位数据。</td></tr>`;
    return;
  }

  const tracks = state.data.tracks || [];
  const trackMap = Object.fromEntries(tracks.map((t) => [t.track_key, t]));

  els.jobsTbody.innerHTML = jobs
    .map((j) => {
      const effectiveKey = j.manual_track || (j.recommended_track === "A轨_真实日期版" ? "A" : j.recommended_track === "B轨_绿区池" ? "B" : null);
      const trackInfo = effectiveKey ? trackMap[effectiveKey] : null;
      const trackLabel = j.zone === "SKIP"
        ? j.recommended_track
        : j.manual_track
          ? `人工定轨：${j.manual_track}轨 (${trackInfo?.profile_name || ""})`
          : trackInfo
            ? `${j.recommended_track} · ${trackInfo.profile_name}`
            : "⚠️ 先探底后定轨";
      const hasHistory = j.company_history?.length > 0;
      const statusText = STATUS_LABELS[j.status] || j.status;

      return `
        <tr>
          <th scope="row">
            <strong>${esc(j.job_title)}</strong>
            <span class="subline">${esc(j.company_name)} · ${esc(j.salary_range || "薪资未标")}</span>
          </th>
          <td>
            ${esc(j.scale || "规模未知")} / ${esc(j.financing || "融资未知")}
            <span class="subline">${esc(j.industry || "行业未知")} · ${esc(j.city || "")}</span>
          </td>
          <td>
            ${esc(j.recruiter_title || "未注明")}
            <span class="subline">${esc(j.recruiter_active || "活跃度未知")}</span>
          </td>
          <td>
            ${formatZoneBadge(j.zone)}
            <span class="subline">风险分：<strong>${esc(j.risk_score)}</strong></span>
          </td>
          <td>
            <span class="track-tag">${esc(trackLabel)}</span>
            ${hasHistory ? `<span class="subline" style="color: var(--red-text)">⚠ 同主体已有投递记录</span>` : ""}
          </td>
          <td>
            <strong>${esc(j.match_score)}%</strong>
            <span class="subline">${esc((j.match?.matched_keywords || []).slice(0, 3).join(" / ") || "基础匹配")}</span>
          </td>
          <td>
            <div class="row-actions">
              <button type="button" class="btn btn-primary btn-sm" data-open-job="${j.id}">评估改写 & 投递</button>
              <button type="button" class="btn btn-ghost btn-sm" data-ban-company="${esc(j.company_name)}">拉黑</button>
              <span class="subline">状态：${esc(statusText)}</span>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  els.jobsTbody.querySelectorAll("[data-open-job]").forEach((btn) => {
    btn.addEventListener("click", () => openJobModal(Number(btn.dataset.openJob)));
  });

  els.jobsTbody.querySelectorAll("[data-ban-company]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.banCompany;
      if (!confirm(`确定将「${name}」加入避坑黑名单吗？`)) return;
      await api("/api/blacklist", { method: "POST", body: JSON.stringify({ company_name: name, reason: "列表页快速拉黑" }) });
      await refreshState();
    });
  });
}

function renderResumes() {
  const { resumes, tracks } = state.data;
  const trackMap = Object.fromEntries(tracks.map((t) => [t.track_key, t]));

  els.resumesGrid.innerHTML = resumes
    .map((r) => {
      const tr = trackMap[r.track_key] || {};
      return `
        <article class="modern-card resume-card" data-resume-track="${esc(r.track_key)}">
          <div class="resume-card-head">
            <div>
              <h2 style="margin:0;font-size:1.05rem;">${esc(tr.track_label || r.track_key + "轨")}</h2>
              <p class="muted-note">绑定 Ego：<strong>${esc(tr.profile_name)} (${esc(tr.profile_id)})</strong> · 上次同步：${esc(r.synced_at ? fmtTime(r.synced_at) : "尚未同步")}</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-sync-resume="${esc(r.track_key)}">从 Ego 同步 Boss 简历</button>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>候选人名称</span>
              <input type="text" data-field="candidate_name" value="${esc(r.candidate_name)}">
            </label>
            <label class="field">
              <span>经验标签（如：真实日期版 / 两年经历版）</span>
              <input type="text" data-field="years_label" value="${esc(r.years_label)}">
            </label>
          </div>
          <label class="field">
            <span>个人优势摘要</span>
            <textarea rows="4" data-field="summary">${esc(r.summary)}</textarea>
          </label>
          <label class="field">
            <span>核心技能（英文逗号分隔）</span>
            <input type="text" data-field="skills" value="${esc((r.skills || []).join(", "))}">
          </label>
          <label class="field">
            <span>工作经历 JSON（含 company / role / period / content）</span>
            <textarea rows="5" data-field="experiences_json">${esc(JSON.stringify(r.experiences || [], null, 2))}</textarea>
          </label>
          <label class="field">
            <span>项目经历 JSON（含 name / role / period / content）</span>
            <textarea rows="5" data-field="projects_json">${esc(JSON.stringify(r.projects || [], null, 2))}</textarea>
          </label>
          <div class="modal-footer-actions">
            <a class="btn btn-ghost btn-sm" href="/resume-print.html?track=${esc(r.track_key)}" target="_blank">预览基础版 PDF</a>
            <button type="button" class="btn btn-primary btn-sm" data-save-resume="${esc(r.track_key)}">保存 ${esc(r.track_key)} 轨简历母版</button>
          </div>
        </article>
      `;
    })
    .join("");

  els.resumesGrid.querySelectorAll("[data-sync-resume]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.syncResume;
      btn.disabled = true;
      try {
        setWorkerBusy(true, `正在从 Ego 读取 ${key} 轨简历`);
        const res = await api(`/api/resumes/${key}/sync`, { method: "POST" });
        if (res.status === "VERIFICATION_REQUIRED") {
          showVerifyBanner(res);
        }
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
        const experiences = JSON.parse(card.querySelector('[data-field="experiences_json"]').value || "[]");
        const projects = JSON.parse(card.querySelector('[data-field="projects_json"]').value || "[]");
        const payload = {
          candidate_name: card.querySelector('[data-field="candidate_name"]').value.trim(),
          years_label: card.querySelector('[data-field="years_label"]').value.trim(),
          summary: card.querySelector('[data-field="summary"]').value.trim(),
          skills: card.querySelector('[data-field="skills"]').value.split(/[,，]+/).map((s) => s.trim()).filter(Boolean),
          experiences,
          projects,
        };
        await api(`/api/resumes/${key}`, { method: "POST", body: JSON.stringify(payload) });
        await refreshState();
        alert(`已保存 ${key} 轨简历母版`);
      } catch (err) {
        alert(`保存失败（请检查 JSON 格式）：${err.message}`);
      }
    });
  });
}

function renderFunnel() {
  const f = state.data?.funnel;
  if (!f) return;
  const renderCard = (label, data) => `
    <div class="funnel-card">
      <strong>${esc(label)}</strong>
      <div class="subline">岗位数：${esc(data.total)} · 预填/发送：${esc(data.prepared_or_sent)}</div>
      <div class="subline">实投：${esc(data.delivered)} · HR回复：${esc(data.replied)} (${esc(data.reply_rate)}%)</div>
      <div class="subline">约面：${esc(data.interviews)} (${esc(data.interview_rate)}%)</div>
    </div>
  `;
  els.funnelCards.innerHTML =
    renderCard("A轨_真实日期版", f.A) +
    renderCard("B轨_绿区池", f.B) +
    `<div class="funnel-card"><strong>反诈 / 黑名单拦截</strong><div class="subline">已跳过：${esc(f.skipped)} / ${esc(f.total_jobs)} 条</div></div>`;
}

function renderSettings() {
  const { tracks, settings } = state.data;
  const profilesList = state.egoProfiles.length
    ? state.egoProfiles
    : tracks.map((t) => ({ id: t.profile_id, name: t.profile_name }));

  els.tracksConfigList.innerHTML = tracks
    .map(
      (t) => `
      <div class="log-item" data-track-config="${esc(t.track_key)}">
        <div class="form-grid">
          <div class="field">
            <span>轨道 ${t.breaker_active ? '<strong style="color:var(--red-text)">(🛡今日熔断中)</strong>' : ""}</span>
            <input type="text" value="${esc(t.track_label)}" disabled>
          </div>
          <label class="field">
            <span>绑定 Ego Profile</span>
            <select data-track-profile="${esc(t.track_key)}">
              ${profilesList
                .map(
                  (p) =>
                    `<option value="${esc(p.id)}" data-name="${esc(p.name)}" ${p.id === t.profile_id ? "selected" : ""}>${esc(p.name)} (${esc(p.id)})</option>`
                )
                .join("")}
            </select>
          </label>
          <label class="field field-sm">
            <span>日投递上限</span>
            <input type="number" min="1" max="60" value="${esc(t.daily_limit)}" data-track-limit="${esc(t.track_key)}">
          </label>
          <div class="field" style="justify-content:flex-end;flex-direction:row;align-items:flex-end;gap:6px;">
            <button type="button" class="btn btn-secondary btn-sm" data-save-track="${esc(t.track_key)}">更新绑定</button>
            ${t.breaker_active ? `<button type="button" class="btn btn-ghost btn-sm" data-clear-breaker="${esc(t.track_key)}">解除熔断</button>` : ""}
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
        body: JSON.stringify({
          profile_id: sel.value,
          profile_name: opt?.dataset?.name || sel.value,
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

function renderBlacklist() {
  const items = state.data?.blacklist || [];
  if (items.length === 0) {
    els.blacklistItems.innerHTML = `<span class="muted-note">暂无黑名单公司。</span>`;
    return;
  }
  els.blacklistItems.innerHTML = items
    .map(
      (b) => `
      <span class="blacklist-pill">
        <span>${esc(b.company_name)}</span>
        <button type="button" data-del-blacklist="${b.id}" aria-label="移除 ${esc(b.company_name)}">×</button>
      </span>
    `
    )
    .join("");
  els.blacklistItems.querySelectorAll("[data-del-blacklist]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/blacklist/${btn.dataset.delBlacklist}`, { method: "DELETE" });
      await refreshState();
    });
  });
}

function renderDeliveryLogs() {
  const logs = state.data?.logs || [];
  if (logs.length === 0) {
    els.deliveryLogsList.innerHTML = `<p class="muted-note">暂无投递记录。</p>`;
    return;
  }
  els.deliveryLogsList.innerHTML = logs
    .map(
      (l) => `
      <div class="log-item">
        <strong>${esc(l.company_name)}</strong> · ${esc(l.track_key)}轨 (${esc(l.profile_id)}) · <span class="track-tag">${esc(l.status)}</span>
        <div class="subline">${esc(fmtTime(l.created_at))} — ${esc(l.detail)}</div>
        ${l.greeting_text ? `<div class="subline">话术：${esc(l.greeting_text)}</div>` : ""}
      </div>
    `
    )
    .join("");
}

async function openJobModal(jobId) {
  state.activeJobId = jobId;
  const job = await api(`/api/jobs/${jobId}`);
  const tracks = state.data.tracks || [];
  const effectiveKey = job.manual_track || (job.recommended_track === "A轨_真实日期版" ? "A" : job.recommended_track === "B轨_绿区池" ? "B" : "");
  const conflict = (job.company_history || []).find((h) => effectiveKey && h.track_key !== effectiveKey);

  els.jobModalTitle.textContent = `${job.job_title} · ${job.company_name}`;
  els.jobModalSub.textContent = `${job.salary_range || ""} | ${job.scale || "规模未知"} | ${job.financing || "融资未知"} | ${job.recruiter_title || ""} (${job.recruiter_active || "活跃度未知"})`;

  const snippets = job.intel?.snippets || [];
  const tailored = job.tailored_resume || {};
  const factGuard = tailored.fact_guard || { passed: true, issues: [] };

  els.jobModalBody.innerHTML = `
    <div class="modal-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <h3>1. 风控评估与联网背调证据</h3>
        ${formatZoneBadge(job.zone)}
      </div>
      <div><strong>风险总分：${esc(job.risk_score)} / 100</strong> · 建议：<code>${esc(job.recommended_track)}</code></div>
      <ul class="evidence-list">
        ${(job.evidence || []).map((ev) => `<li>${esc(ev)}</li>`).join("")}
      </ul>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <strong>联网背调摘要</strong>
        <button type="button" class="btn btn-secondary btn-sm" id="modal-refresh-intel">重新联网补查</button>
      </div>
      <p class="muted-note">${esc(job.intel?.summary || job.intel_summary || "尚未补查")}</p>
      ${
        snippets.length
          ? `<ul class="evidence-list">${snippets
              .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)}</a><br><span class="muted-note">${esc(s.snippet)}</span></li>`)
              .join("")}</ul>`
          : ""
      }
      <h3>原始 JD 描述</h3>
      <div class="jd-box">${esc(job.jd_text || "无 JD 文本")}</div>
    </div>

    <div class="modal-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <h3>2. 动态简历匹配与分号投递</h3>
        <span class="fact-badge ${factGuard.passed ? "zone-GREEN" : "zone-RED"}">
          ${factGuard.passed ? "🔒 事实锁校验通过" : "⚠ 事实锁告警"}
        </span>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>投递使用轨道 / Ego 账号</span>
          <select id="modal-track-select">
            <option value="">-- 请定轨（当前未定轨/跳过） --</option>
            ${tracks
              .map(
                (t) =>
                  `<option value="${esc(t.track_key)}" ${effectiveKey === t.track_key ? "selected" : ""}>${esc(t.track_label)} → ${esc(t.profile_name)} (${esc(t.profile_id)})</option>`
              )
              .join("")}
          </select>
        </label>
        <label class="field">
          <span>投后沟通状态标记</span>
          <select id="modal-status-select">
            ${Object.entries(STATUS_LABELS)
              .map(([k, v]) => `<option value="${esc(k)}" ${job.status === k ? "selected" : ""}>${esc(v)}</option>`)
              .join("")}
          </select>
        </label>
      </div>
      <div>
        <button type="button" class="btn btn-secondary btn-sm" id="modal-recalc-match">按所选轨道重算匹配、Diff 与话术</button>
      </div>

      ${
        job.blacklisted
          ? `<div class="conflict-alert">🚫 黑名单拦截：该公司已在避坑黑名单中（${esc(job.blacklisted.reason)}）。</div>`
          : ""
      }
      ${
        conflict
          ? `<div class="conflict-alert">⚠ 防撞车警告：该公司/关联主体此前已用 ${esc(conflict.track_key)}轨 (${esc(conflict.profile_id)}) 投递过，禁止再用另一账号重复投递！</div>`
          : ""
      }

      <div>
        <strong>人岗匹配度：${esc(job.match_score)}%</strong>
        <span class="subline">命中关键词：${esc((job.match?.matched_keywords || []).join("、") || "无")}</span>
        <span class="subline">${esc(tailored.gap_tips || "")}</span>
      </div>

      <details>
        <summary class="muted-note" style="cursor:pointer;">查看「原文优势 vs 动态优化侧重」Diff 对比</summary>
        <div class="diff-grid" style="margin-top:8px;">
          <div>
            <span class="subline">母版原文：</span>
            <div class="diff-box">${esc(tailored.original_summary || "无母版摘要")}</div>
          </div>
          <div>
            <span class="subline">动态适配后：</span>
            <div class="diff-box">${esc(tailored.tailored_summary || "")}</div>
          </div>
        </div>
      </details>

      <label class="field">
        <span>动态微调后的简历优势侧重点（用于导出定制附件 PDF）</span>
        <textarea id="modal-tailored-summary" rows="3">${esc(tailored.tailored_summary || "")}</textarea>
      </label>

      <label class="field">
        <span>专属打招呼话术（<strong id="greeting-len">${(job.custom_greeting || "").length}</strong> / 120 字）</span>
        <textarea id="modal-greeting" rows="2" maxlength="120">${esc(job.custom_greeting || "")}</textarea>
      </label>

      <div class="modal-footer-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="modal-export-pdf-file">生成真 PDF 附件并下载</button>
        <a class="btn btn-ghost btn-sm" href="/resume-print.html?jobId=${job.id}&track=${esc(effectiveKey || "B")}" target="_blank">网页打印预览</a>
        <button type="button" class="btn btn-secondary btn-sm" id="modal-save-patch">保存状态/话术</button>
        <button type="button" class="btn btn-primary btn-sm" id="modal-deliver-prefill" ${conflict || job.blacklisted ? "disabled" : ""}>在 Ego 预填话术（安全推荐）</button>
        <button type="button" class="btn btn-ghost btn-sm" id="modal-deliver-autosend" ${conflict || job.blacklisted ? "disabled" : ""}>直接自动发送</button>
      </div>
    </div>
  `;

  const greetingEl = document.getElementById("modal-greeting");
  const lenEl = document.getElementById("greeting-len");
  greetingEl.addEventListener("input", () => {
    lenEl.textContent = greetingEl.value.length;
  });

  document.getElementById("modal-refresh-intel").addEventListener("click", async () => {
    await api(`/api/jobs/${job.id}/intel`, { method: "POST" });
    await refreshState();
    await openJobModal(job.id);
  });

  document.getElementById("modal-recalc-match").addEventListener("click", async () => {
    const trackKey = document.getElementById("modal-track-select").value || undefined;
    await api(`/api/jobs/${job.id}/evaluate`, {
      method: "POST",
      body: JSON.stringify({ trackKey }),
    });
    await refreshState();
    await openJobModal(job.id);
  });

  document.getElementById("modal-export-pdf-file").addEventListener("click", async () => {
    const trackKey = document.getElementById("modal-track-select").value || effectiveKey || "B";
    try {
      setWorkerBusy(true, "正在渲染定制 PDF 简历...");
      const res = await api(`/api/jobs/${job.id}/pdf`, {
        method: "POST",
        body: JSON.stringify({ trackKey }),
      });
      window.open(res.download_url, "_blank");
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkerBusy(false);
    }
  });

  document.getElementById("modal-save-patch").addEventListener("click", async () => {
    const trackKey = document.getElementById("modal-track-select").value || null;
    const status = document.getElementById("modal-status-select").value;
    const tailoredSummary = document.getElementById("modal-tailored-summary").value.trim();
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
    alert("已保存状态、定轨与话术");
  });

  const handleDeliver = async (autoSend) => {
    const trackKey = document.getElementById("modal-track-select").value;
    if (!trackKey) {
      alert("请先选择使用 A轨 还是 B轨 账号后再投递！");
      return;
    }
    if (autoSend && !confirm("确认立即用对应账号自动点击发送消息吗？（建议优先用预填模式由你扫一眼发送）")) {
      return;
    }
    try {
      setWorkerBusy(true, `正在用 ${trackKey}轨 账号准备投递`);
      const res = await api(`/api/jobs/${job.id}/deliver`, {
        method: "POST",
        body: JSON.stringify({
          trackKey,
          greetingText: greetingEl.value.trim(),
          autoSend,
        }),
      });
      if (res.status === "VERIFICATION_REQUIRED") {
        showVerifyBanner(res);
      } else if (res.delivery?.status === "PREPARED_HANDOFF") {
        alert(`✅ ${res.delivery.message}\n请在 Ego 浏览器窗口确认发送（TaskSpace #${res.delivery.taskSpaceId}）。`);
      } else {
        alert("✅ 已完成投递！");
      }
      await refreshState();
      els.jobModal.close();
    } catch (err) {
      alert(err.message);
    } finally {
      setWorkerBusy(false);
    }
  };

  document.getElementById("modal-deliver-prefill").addEventListener("click", () => handleDeliver(false));
  document.getElementById("modal-deliver-autosend").addEventListener("click", () => handleDeliver(true));

  if (!els.jobModal.open) els.jobModal.showModal();
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
      els.updateBannerTitle.textContent = `🚀 发现新版本 v${info.latest_version}（当前 v${info.current_version}）`;
      els.updateBannerDesc.textContent = info.asset
        ? `可直接在应用内下载安装（${info.asset.name}）`
        : "GitHub Releases 已发布新版本，点击查看详情。";
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
    if (openModal) {
      els.updateStatusText.textContent = `检查更新出错：${err.message}`;
    }
  }
}

els.btnCheckUpdate.addEventListener("click", () => checkUpdates({ openModal: true }));
els.btnOpenUpdateModal.addEventListener("click", () => checkUpdates({ openModal: true }));
els.btnDismissUpdateBanner.addEventListener("click", () => {
  els.updateBanner.hidden = true;
});

els.btnApplyUpdate.addEventListener("click", async () => {
  const info = state.latestUpdate;
  if (!info?.asset?.download_url) return;
  els.btnApplyUpdate.disabled = true;
  els.updateProgressWrap.hidden = false;
  els.updateProgress.value = 0;
  els.updateProgressLabel.textContent = `正在下载 ${info.asset.name}...`;
  els.updateStatusText.textContent = "正在下载更新包，下载完成后将自动启动安装并重启桌面端...";
  try {
    const res = await api("/api/update/apply", {
      method: "POST",
      body: JSON.stringify({
        download_url: info.asset.download_url,
        file_name: info.asset.name,
      }),
    });
    els.updateStatusText.textContent = `✅ 更新包已准备就绪（模式：${res.mode}），应用即将重启完成安装...`;
  } catch (err) {
    els.updateStatusText.textContent = `更新失败：${err.message}`;
    els.btnApplyUpdate.disabled = false;
  }
});

// Actions
els.btnScrape.addEventListener("click", async () => {
  try {
    setWorkerBusy(true, "正在低速拟人抓取 Boss 岗位...");
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
    if (res.status === "VERIFICATION_REQUIRED") {
      showVerifyBanner({
        taskSpaceId: res.taskSpaceId,
        message: `抓取触发安全验证（已保存此前抓到的 ${res.savedCount} 条岗位），请在 Ego 完成滑块验证；为防封号已自动触发该账号当日熔断。`,
      });
    }
    await refreshState();
  } catch (err) {
    alert(err.message);
  } finally {
    setWorkerBusy(false);
  }
});

els.btnOpenImport.addEventListener("click", () => {
  els.importModal.showModal();
});

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
    els.liveLogLatest.textContent = "正在解析岗位并按条件执行联网背调补查...";
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
  alert("设置已保存");
});

els.verifyDoneBtn.addEventListener("click", async () => {
  if (state.pendingVerifySpaceId) {
    await api(`/api/ego/spaces/${state.pendingVerifySpaceId}/finish`, { method: "POST" }).catch(() => {});
  }
  state.pendingVerifySpaceId = null;
  els.verifyBanner.hidden = true;
});

els.verifyDismissBtn.addEventListener("click", () => {
  els.verifyBanner.hidden = true;
});

// SSE realtime updates
const evt = new EventSource("/api/events");
evt.addEventListener("log", (e) => {
  const data = JSON.parse(e.data);
  els.liveLogLatest.textContent = data.message;
});
evt.addEventListener("verification", (e) => {
  showVerifyBanner(JSON.parse(e.data));
});
evt.addEventListener("update-progress", (e) => {
  const p = JSON.parse(e.data);
  els.updateProgress.value = p.percent || 0;
  els.updateProgressLabel.textContent = `已下载 ${p.percent || 0}%`;
});

// Boot
await refreshState();
loadEgoProfiles();
if (state.data?.settings?.auto_check_update !== "false") {
  checkUpdates({ silent: true });
}
