const state = {
  data: null,
  egoProfiles: [],
  activeZone: "ALL",
  activeJobId: null,
  pendingVerifySpaceId: null,
};

const els = {
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
  scrapeMax: document.getElementById("scrape-max"),
  scrapeProfile: document.getElementById("scrape-profile"),
  btnScrape: document.getElementById("btn-scrape"),
  btnOpenImport: document.getElementById("btn-open-import"),
  jobsTbody: document.getElementById("jobs-tbody"),
  liveLogLatest: document.getElementById("live-log-latest"),
  resumesGrid: document.getElementById("resumes-grid"),
  btnSwapTracks: document.getElementById("btn-swap-tracks"),
  tracksConfigList: document.getElementById("tracks-config-list"),
  settingsForm: document.getElementById("settings-form"),
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
  els.verifyTitle.textContent = `⚠️ 安全验证 / 登录介入提醒（TaskSpace #${payload.taskSpaceId ?? "-"}）`;
  els.verifyDesc.textContent = payload.message || "Boss直聘触发了安全验证或登录提示，已将 Ego 标签页控制权交给你，请处理完后点击右侧按钮关闭占位空间。";
  els.verifyBanner.hidden = false;
}

// Tabs (accessible keyboard + aria-selected)
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

// Light dismiss fallback for <dialog closedby="any">
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

// Theme toggle
els.themeToggleBtn.addEventListener("click", () => {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme");
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const next = current ? (current === "dark" ? "light" : "dark") : (prefersDark ? "light" : "dark");
  root.setAttribute("data-theme", next);
});

// Zone filters
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
  renderSettings();
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

  if (trackA) els.kpiAAccount.textContent = `绑定：${trackA.profile_name} (${trackA.profile_id})`;
  if (trackB) els.kpiBAccount.textContent = `绑定：${trackB.profile_name} (${trackB.profile_id})`;

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
  return `<span class="zone-pill zone-GREEN">✅ GREEN</span>`;
}

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
      const trackLabel = j.manual_track
        ? `人工定轨：${j.manual_track}轨 (${trackInfo?.profile_name || ""})`
        : trackInfo
          ? `${j.recommended_track} · ${trackInfo.profile_name}`
          : "⚠️ 先探底后定轨";
      const hasHistory = j.company_history?.length > 0;
      const statusText = j.status === "DELIVERED" ? "已投递" : j.status === "PREPARED" ? "已预填" : "待处理";

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
          <td>${esc(j.recruiter_title || "未注明")}</td>
          <td>
            ${formatZoneBadge(j.zone)}
            <span class="subline">风险分：<strong>${esc(j.risk_score)}</strong></span>
          </td>
          <td>
            <span class="track-tag">${esc(trackLabel)}</span>
            ${hasHistory ? `<span class="subline" style="color: var(--red-text)">⚠ 同公司已有投递记录</span>` : ""}
          </td>
          <td>
            <strong>${esc(j.match_score)}%</strong>
            <span class="subline">${esc((j.match?.matched_keywords || []).slice(0, 3).join(" / ") || "基础匹配")}</span>
          </td>
          <td>
            <div class="row-actions">
              <button type="button" class="btn btn-primary btn-sm" data-open-job="${j.id}">评估改写 & 投递</button>
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
        } else {
          await refreshState();
        }
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
            <span>轨道</span>
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
          <div class="field" style="justify-content:flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" data-save-track="${esc(t.track_key)}">更新绑定</button>
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

  const form = els.settingsForm;
  form.delay_min_ms.value = settings.delay_min_ms || "4500";
  form.delay_max_ms.value = settings.delay_max_ms || "8500";
  form.auto_web_search.value = settings.auto_web_search || "true";
  form.llm_base_url.value = settings.llm_base_url || "";
  form.llm_model.value = settings.llm_model || "";
  form.llm_api_key.value = settings.llm_api_key || "";
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
  els.jobModalSub.textContent = `${job.salary_range || ""} | ${job.scale || "规模未知"} | ${job.financing || "融资未知"} | ${job.recruiter_title || ""}`;

  const snippets = job.intel?.snippets || [];
  const tailored = job.tailored_resume || {};

  els.jobModalBody.innerHTML = `
    <div class="modal-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <h3>1. 风控评估与联网背调证据</h3>
        ${formatZoneBadge(job.zone)}
      </div>
      <div><strong>风险总分：${esc(job.risk_score)} / 100</strong> · 系统建议：<code>${esc(job.recommended_track)}</code></div>
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
      <h3>2. 动态简历匹配与分号投递</h3>
      <div class="form-grid">
        <label class="field">
          <span>投递使用轨道 / Ego 账号</span>
          <select id="modal-track-select">
            <option value="">-- 请定轨（当前为 YELLOW 待探底） --</option>
            ${tracks
              .map(
                (t) =>
                  `<option value="${esc(t.track_key)}" ${effectiveKey === t.track_key ? "selected" : ""}>${esc(t.track_label)} → ${esc(t.profile_name)} (${esc(t.profile_id)})</option>`
              )
              .join("")}
          </select>
        </label>
        <div class="field" style="justify-content:flex-end;">
          <button type="button" class="btn btn-secondary btn-sm" id="modal-recalc-match">按所选轨道重算匹配与话术</button>
        </div>
      </div>

      ${
        conflict
          ? `<div class="conflict-alert">⚠ 防撞车警告：该公司此前已用 ${esc(conflict.track_key)}轨 (${esc(conflict.profile_id)}) 投递过，禁止再用另一账号重复投递！</div>`
          : ""
      }

      <div>
        <strong>人岗匹配度：${esc(job.match_score)}%</strong>
        <span class="subline">命中关键词：${esc((job.match?.matched_keywords || []).join("、") || "无")}</span>
        <span class="subline">${esc(tailored.gap_tips || "")}</span>
      </div>

      <label class="field">
        <span>动态微调后的简历优势侧重点（用于导出定制附件 PDF）</span>
        <textarea id="modal-tailored-summary" rows="3">${esc(tailored.tailored_summary || "")}</textarea>
      </label>

      <label class="field">
        <span>专属打招呼话术（<strong id="greeting-len">${(job.custom_greeting || "").length}</strong> / 120 字）</span>
        <textarea id="modal-greeting" rows="2" maxlength="120">${esc(job.custom_greeting || "")}</textarea>
      </label>

      <div class="modal-footer-actions">
        <a class="btn btn-ghost btn-sm" href="/resume-print.html?jobId=${job.id}&track=${esc(effectiveKey || "B")}" target="_blank">预览 / 导出定制简历 PDF</a>
        <button type="button" class="btn btn-secondary btn-sm" id="modal-save-patch">保存话术与定轨</button>
        <button type="button" class="btn btn-primary btn-sm" id="modal-deliver-prefill" ${conflict ? "disabled" : ""}>在 Ego 打开对应账号并预填话术（安全推荐）</button>
        <button type="button" class="btn btn-ghost btn-sm" id="modal-deliver-autosend" ${conflict ? "disabled" : ""}>直接自动发送</button>
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

  document.getElementById("modal-save-patch").addEventListener("click", async () => {
    const trackKey = document.getElementById("modal-track-select").value || null;
    await api(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        manual_track: trackKey,
        custom_greeting: greetingEl.value.trim(),
      }),
    });
    await refreshState();
    alert("已保存定轨与专属话术");
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

// Actions
els.btnScrape.addEventListener("click", async () => {
  try {
    setWorkerBusy(true, "正在低速拟人抓取 Boss 岗位...");
    const res = await api("/api/jobs/scrape", {
      method: "POST",
      body: JSON.stringify({
        query: els.scrapeQuery.value.trim() || "AI测试",
        city: els.scrapeCity.value,
        maxJobs: Number(els.scrapeMax.value) || 8,
        profileId: els.scrapeProfile.value,
      }),
    });
    if (res.status === "VERIFICATION_REQUIRED") {
      showVerifyBanner({
        taskSpaceId: res.taskSpaceId,
        message: `抓取触发安全验证（已保存此前抓到的 ${res.savedCount} 条岗位），请在 Ego 完成滑块验证。`,
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
        job_title: "AI测试工程师（RAG/Agent）",
        company_name: "星云智算信息科技有限公司",
        scale: "100-499人",
        financing: "A轮",
        industry: "企业服务",
        recruiter_title: "HRBP",
        salary_range: "14-20K",
        jd_text: "负责RAG知识库检索准确率评测及Pytest接口自动化测试。",
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

// Boot: render SQLite state immediately, load Ego profiles asynchronously
await refreshState();
loadEgoProfiles();
