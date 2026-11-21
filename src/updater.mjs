import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { PROJECT_ROOT } from "./db.mjs";

export function getCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"));
    return pkg.version || "0.3.0";
  } catch {
    return "0.3.0";
  }
}

export function compareSemver(a = "0.0.0", b = "0.0.0") {
  const pa = String(a).replace(/^v/i, "").split(/[-+]/)[0].split(".").map((n) => Number(n) || 0);
  const pb = String(b).replace(/^v/i, "").split(/[-+]/)[0].split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export async function checkGithubUpdate(repo = "ShawnLi-code/boss-ai-router") {
  const currentVersion = getCurrentVersion();
  const cleanRepo = String(repo || "ShawnLi-code/boss-ai-router").trim();
  const apiUrl = `https://api.github.com/repos/${cleanRepo}/releases/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `boss-ai-router/${currentVersion}`,
      },
    });

    if (res.status === 404) {
      return {
        ok: true,
        repo: cleanRepo,
        current_version: currentVersion,
        latest_version: currentVersion,
        has_update: false,
        no_release_yet: true,
        release_url: `https://github.com/${cleanRepo}/releases`,
        message: "GitHub 仓库尚无正式 Release（推送 v* 标签触发 CI 构建后即可自动检测更新）",
      };
    }

    if (!res.ok) {
      throw new Error(`GitHub API HTTP ${res.status}`);
    }

    const rel = await res.json();
    const latestVersion = String(rel.tag_name || rel.name || currentVersion).replace(/^v/i, "");
    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
    const assets = Array.isArray(rel.assets) ? rel.assets : [];

    // 优先选 Windows NSIS 安装包，其次便携版 .exe，其次 .msi
    const preferredAsset =
      assets.find((a) => /-setup\.exe$/i.test(a.name)) ||
      assets.find((a) => /boss-ai-router.*\.exe$/i.test(a.name)) ||
      assets.find((a) => /\.msi$/i.test(a.name)) ||
      assets[0] ||
      null;

    return {
      ok: true,
      repo: cleanRepo,
      current_version: currentVersion,
      latest_version: latestVersion,
      has_update: hasUpdate,
      no_release_yet: false,
      release_name: rel.name || `v${latestVersion}`,
      release_notes: (rel.body || "").slice(0, 1500),
      published_at: rel.published_at || "",
      release_url: rel.html_url || `https://github.com/${cleanRepo}/releases`,
      asset: preferredAsset
        ? {
            name: preferredAsset.name,
            size: preferredAsset.size,
            download_url: preferredAsset.browser_download_url,
          }
        : null,
      message: hasUpdate
        ? `发现新版本 v${latestVersion}（当前 v${currentVersion}）`
        : `当前已是最新版本 v${currentVersion}`,
    };
  } catch (err) {
    return {
      ok: false,
      repo: cleanRepo,
      current_version: currentVersion,
      has_update: false,
      error: err.message,
      message: `检查更新失败：${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadAndPrepareUpdate(downloadUrl, fileName, onProgress = () => {}) {
  if (!downloadUrl || !/^https:\/\/(github\.com|objects\.githubusercontent\.com)\//i.test(downloadUrl)) {
    throw new Error("仅允许从 GitHub Releases 官方域名下载更新包");
  }
  const safeName = path.basename(String(fileName || "boss-ai-router-update.exe")).replace(/[^a-zA-Z0-9._-]/g, "_");
  const updateDir = path.join(os.tmpdir(), "boss-ai-router-updates");
  fs.mkdirSync(updateDir, { recursive: true });
  const targetPath = path.join(updateDir, safeName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(downloadUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": `boss-ai-router/${getCurrentVersion()}` },
    });
    if (!res.ok) throw new Error(`下载更新包失败：HTTP ${res.status}`);

    const total = Number(res.headers.get("content-length") || 0);
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const pct = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 50;
      onProgress({ received, total, percent: pct });
    }

    const buf = Buffer.concat(chunks);
    if (buf.length < 1024) throw new Error("下载的更新包体积异常，已中止安装");
    if (/\.exe$/i.test(safeName) && buf.subarray(0, 2).toString("ascii") !== "MZ") {
      throw new Error("下载文件不是有效的 Windows 可执行文件");
    }

    fs.writeFileSync(targetPath, buf);
    onProgress({ received: buf.length, total: buf.length, percent: 100 });
    return { path: targetPath, size: buf.length, name: safeName };
  } finally {
    clearTimeout(timer);
  }
}

export function launchUpdateInstaller(downloadedPath, targetExePath = "") {
  if (process.platform !== "win32") {
    throw new Error("当前应用内自动安装仅支持 Windows 桌面端");
  }
  const ext = path.extname(downloadedPath).toLowerCase();
  if (/-setup\.exe$/i.test(downloadedPath) || ext === ".msi") {
    const cmd = ext === ".msi" ? "msiexec" : downloadedPath;
    const args = ext === ".msi" ? ["/i", downloadedPath] : [];
    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    return { mode: "installer", path: downloadedPath };
  }

  // 便携版 boss-ai-router.exe 自替换脚本
  const exePath = targetExePath || path.join(PROJECT_ROOT, "src-tauri", "target", "release", "boss-ai-router.exe");
  const batPath = path.join(path.dirname(downloadedPath), "apply-update.cmd");
  const script = [
    "@echo off",
    "timeout /t 2 /nobreak >nul",
    `move /y "${downloadedPath}" "${exePath}" >nul`,
    `start "" "${exePath}"`,
    'del "%~f0"',
  ].join("\r\n");
  fs.writeFileSync(batPath, script, "utf8");
  const child = spawn("cmd.exe", ["/c", batPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return { mode: "portable_replace", path: exePath };
}
