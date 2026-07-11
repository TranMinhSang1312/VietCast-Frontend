const { app, BrowserWindow, ipcMain, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// Resource paths — dev vs prod
// ---------------------------------------------------------------------------
// In dev (npm run dev:electron): the Python source lives in the sibling
//                                 repo folder `VietCast-Engine/main.py`.
//                                 `vietcast-frontend/bin/` is reserved
//                                 for the PyInstaller-built `main.exe`
//                                 + the `ffmpeg.exe` sidecar (those are
//                                 what ships in the installer).
// In prod (electron-builder):    files live in process.resourcesPath/bin
//                                 because of the `extraResources` config
//                                 in package.json — they are NOT packed
//                                 into app.asar (asar would block spawn).
//
// Crucially: the worker spawns a separate process and Python's import
// machinery reads from the filesystem, NOT from asar. Putting binaries
// in extraResources keeps them unpacked and accessible.
const FRONTEND_ROOT = path.join(__dirname, '..');                  // <repo>/vietcast-frontend
const WORKSPACE_ROOT = path.join(FRONTEND_ROOT, '..');             // <repo>
const ENGINE_SRC_DIR = path.join(WORKSPACE_ROOT, 'VietCast-Engine');// <repo>/VietCast-Engine
const FRONTEND_BIN_DIR = path.join(FRONTEND_ROOT, 'bin');         // <repo>/vietcast-frontend/bin
const FRONTEND_PUBLIC_DIR = path.join(FRONTEND_ROOT, 'public');    // <repo>/vietcast-frontend/public

const RESOURCE_BIN_DIR = isDev
  ? FRONTEND_BIN_DIR
  : path.join(process.resourcesPath, 'bin');

// In dev we run the Python source directly (faster dev loop, no need
// to PyInstaller between every edit). In prod we run the bundled exe
// that the user installed.
const WORKER_BIN_NAME = isDev
  ? (process.platform === 'win32' ? 'main.py' : 'main.py')
  : (process.platform === 'win32' ? 'main.exe' : 'main');

const FFMPEG_BIN_NAME = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

/**
 * Resolve the worker entry-point. Order of preference in dev:
 *   1. <repo>/vietcast-frontend/bin/main.py    — pre-staged (rare in dev)
 *   2. <repo>/VietCast-Engine/main.py          — single source of truth
 *
 * In prod we expect <resources>/bin/main.exe (PyInstaller output).
 * Returns null when nothing matches; callers translate that into a
 * friendly Vietnamese error message.
 */
function resolveWorkerSource() {
  const candidates = isDev
    ? [path.join(FRONTEND_BIN_DIR, 'main.py'),
       path.join(ENGINE_SRC_DIR, 'main.py')]
    : [path.join(RESOURCE_BIN_DIR, WORKER_BIN_NAME),
       path.join(FRONTEND_BIN_DIR, WORKER_BIN_NAME)];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Resolve the ffmpeg sidecar. Order of preference:
 *   1. <repo>/vietcast-frontend/bin/ffmpeg[.exe]      — dev/prod sidecar
 *   2. <repo>/vietcast-frontend/public/ffmpeg[.exe]    — public/ fallback
 *   3. <repo>/VietCast-Engine/ffmpeg[.exe]            — engine checkout
 *   4. system PATH (resolved by Node at spawn time)
 *
 * Returns { path, source } so we can warn loudly when we fall through
 * to PATH (it could match an old/wrong version).
 */
function resolveFfmpegSource() {
  const candidates = [
    { path: path.join(FRONTEND_BIN_DIR, FFMPEG_BIN_NAME), label: 'vietcast-frontend/bin' },
    { path: path.join(FRONTEND_PUBLIC_DIR, FFMPEG_BIN_NAME), label: 'vietcast-frontend/public' },
    { path: path.join(ENGINE_SRC_DIR, FFMPEG_BIN_NAME), label: 'VietCast-Engine' },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.path)) return { path: c.path, source: c.label };
  }
  return { path: FFMPEG_BIN_NAME, source: 'system PATH (UNVERIFIED)' };
}

let mainWindow = null;

// ---------------------------------------------------------------------------
// Custom protocol: vietcast://video/<taskId> → <userData>/bin/output/...
// ---------------------------------------------------------------------------
// Browsers (and therefore Electron's renderer) refuse to render file:// URLs
// from a renderer for security reasons — that's why `<video src="file:///…">`
// silently fails and the UI is stuck on the "Đang render video…" spinner even
// though the pipeline completed successfully.
//
// We register a privileged scheme `vietcast` that maps back to absolute paths
// inside our writable userData directory. The scheme is registered as
// `standard` + `secure` + `supportFetchAPI` + `bypassCSP` so the React app can
// pass it to <video src=…> AND <a href=… download> without security prompts.
//
// Why a custom protocol rather than reading the file in main and returning a
// Buffer: a 50 MB MP4 in memory just to display a frame is wasteful, and the
// browser's <video> element issues HTTP range requests when the user seeks.
// A protocol handler serves those ranges directly from disk via the standard
// file stream pipeline — same speed as a real HTTP server.
const VIETCAST_SCHEME = 'vietcast';

// Must be called BEFORE app.whenReady() per Electron's docs.
protocol.registerSchemesAsPrivileged([
  { scheme: VIETCAST_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

/**
 * Translate a vietcast:// request URL into an absolute path on disk.
 *
 * Supported URL shapes:
 *   vietcast://video/<taskId>          → <userData>/bin/output/video_hoanthien_<taskId>.mp4
 *   vietcast://subtitle/<taskId>       → <userData>/bin/output/phude_<taskId>.srt
 *
 * Returns null when the URL doesn't match (the protocol handler then sends a
 * 404-style response so the browser shows a clean error).
 *
 * SECURITY: we deliberately do NOT accept a full path in the URL — only an
 * opaque taskId. This stops a malicious renderer (or a compromised dep) from
 * asking the main process to serve arbitrary files like
 * `vietcast://video/C:/Users/.../Documents/secret.txt`. The taskId is a UUID
 * minted on the main process (see processVideo) so only files we ourselves
 * produced are reachable.
 */
function resolveVietcastUrl(requestUrl) {
  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${VIETCAST_SCHEME}:`) return null;

  const host = parsed.hostname;     // "video" | "subtitle" | ...
  const taskId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
  if (!taskId || !/^[A-Za-z0-9_-]+$/.test(taskId)) {
    // taskIds from crypto.randomUUID() are hex + hyphens; reject anything
    // containing path separators or other shell-meaningful chars.
    return null;
  }

  const outputDir = path.join(app.getPath('userData'), 'bin', 'output');
  let resolved;
  switch (host) {
    case 'video':
      resolved = path.join(outputDir, `video_hoanthien_${taskId}.mp4`);
      break;
    case 'subtitle':
      resolved = path.join(outputDir, `phude_${taskId}.srt`);
      break;
    default:
      return null;
  }
  // Defense-in-depth: even though the regex above blocks `..`, the WHATWG
  // URL parser silently collapses path-segments like `/../../etc` BEFORE
  // our regex sees them. So after we build the path, verify it still
  // lives inside the output directory. If anything tries to walk up out
  // of `output/`, refuse the request.
  const rel = path.relative(outputDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return resolved;
}

function registerVietcastProtocol() {
  // protocol.handle() is the Electron 25+ API; falls back to registerStreamProtocol
  // for older versions. Both behave the same for our use case — stream the file
  // from disk into the renderer's fetch() / <video> / <a download>.
  if (typeof protocol.handle === 'function') {
    protocol.handle(VIETCAST_SCHEME, async (request) => {
      const absolutePath = resolveVietcastUrl(request.url);
      if (!absolutePath) {
        return new Response('Bad vietcast:// request', { status: 400 });
      }
      if (!fs.existsSync(absolutePath)) {
        return new Response(`File not found: ${absolutePath}`, { status: 404 });
      }
      // file:// URL with the resolved absolute path. Electron's net module
      // pipes this through its built-in HTTP-style handler that supports
      // Range requests, which is exactly what <video> needs for seeking.
      const fileUrl = `file://${absolutePath.replace(/\\/g, '/')}`;
      return await fetch(fileUrl);
    });
  } else {
    protocol.registerStreamProtocol(VIETCAST_SCHEME, (request, callback) => {
      const absolutePath = resolveVietcastUrl(request.url);
      if (!absolutePath || !fs.existsSync(absolutePath)) {
        return callback({ statusCode: 404 });
      }
      callback({ path: absolutePath });
    });
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // vite build -> dist/
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  registerVietcastProtocol();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

/**
 * Default base URL of the VietCast backend.
 *
 * Same idea as `PROD_API_BASE_URL` in src/config.js — we expose a
 * single hard-coded fallback that the worker & the renderer can both
 * agree on without having to read from extra env vars at runtime.
 *
 * The renderer prefers `__VITE_API_BASE_URL__` (baked at build time)
 * and falls back to `process.env.VIETCAST_API_BASE_URL` (set by the
 * installer), so this constant is mostly belt-and-braces — the worker
 * uses it via the `--backend-url` argv we thread down here, and any
 * code path that reads the URL from the Electron host gets a sane
 * default rather than an empty string / localhost.
 */
const DEFAULT_API_BASE_URL = 'https://vietcast-backend.onrender.com';
const DEFAULT_WS_BASE_URL  = 'wss://vietcast-backend.onrender.com';

/**
 * Runtime configuration exposed to the renderer.
 *
 * In dev:    reads from process.env (fallback: localhost dev server).
 * In prod:   reads from process.env VIETCAST_API_BASE_URL /
 *            VIETCAST_WS_BASE_URL, baked at build/package time.
 *            Falls back to the Render-hosted production service so a
 *            fresh install (no env vars set) still has a working API.
 *
 * We do NOT hardcode URLs into the JS bundle — they travel as env vars
 * so the same installer can target staging / production / on-prem.
 */
function buildRuntimeConfig() {
  const fromEnv = (k, fallback) => {
    const v = process.env[k];
    return v && v.length ? v : fallback;
  };
  const isDev = !app.isPackaged;
  return {
    apiBaseUrl: fromEnv('VIETCAST_API_BASE_URL', isDev ? 'http://localhost:8080' : DEFAULT_API_BASE_URL),
    wsBaseUrl:  fromEnv('VIETCAST_WS_BASE_URL',  isDev ? 'ws://localhost:8080'   : DEFAULT_WS_BASE_URL),
    env:        isDev ? 'development' : 'production',
    platform:   process.platform,
    appVersion: app.getVersion(),
  };
}

function registerIpcHandlers() {
  ipcMain.handle('get-runtime-config', () => buildRuntimeConfig());

  ipcMain.handle('get-workspace', () => {
    return path.join(app.getPath('userData'), 'workspace');
  });

  ipcMain.handle('get-output', () => {
    return path.join(app.getPath('userData'), 'output');
  });

  ipcMain.handle('run-video', async (_event, params) => {
    return processVideo(params || {});
  });

  // Open the OS file explorer with the file selected. The renderer can ONLY
  // request this with a taskId (same security boundary as the protocol handler
  // above) — we never accept a free-form path so a compromised renderer can't
  // shell.openPath() to arbitrary system locations.
  ipcMain.handle('reveal-in-folder', (_event, taskId) => {
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(taskId)) {
      throw new Error('Invalid taskId');
    }
    const outputDir = path.join(app.getPath('userData'), 'bin', 'output');
    const filePath = path.join(outputDir, `video_hoanthien_${taskId}.mp4`);
    if (!fs.existsSync(filePath)) {
      // Fall back to opening the output dir even if the file isn't there yet —
      // happens when the user clicks the button mid-processing.
      if (fs.existsSync(outputDir)) {
        shell.openPath(outputDir);
        return { ok: true, path: outputDir, fallback: true };
      }
      throw new Error(`Output not found: ${filePath}`);
    }
    shell.showItemInFolder(filePath);
    return { ok: true, path: filePath };
  });

  // Return absolute paths the renderer needs to build vietcast:// URLs.
  // Useful for callers that want to assemble URLs themselves rather than
  // letting the protocol handler do the lookup.
  ipcMain.handle('resolve-output', (_event, taskId) => {
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(taskId)) {
      throw new Error('Invalid taskId');
    }
    const outputDir = path.join(app.getPath('userData'), 'bin', 'output');
    return {
      videoPath: path.join(outputDir, `video_hoanthien_${taskId}.mp4`),
      srtPath: path.join(outputDir, `phude_${taskId}.srt`),
    };
  });
}

// ---------------------------------------------------------------------------
// Binary staging
// ---------------------------------------------------------------------------
/**
 * Stage the worker source and the ffmpeg sidecar into userData/bin so
 * the spawned child process can rely on a stable, writable working
 * directory. In dev we copy `main.py` (just text), in prod the
 * PyInstaller-built `main.exe`.
 *
 * Throws with a Vietnamese-friendly message when a required binary is
 * missing so the renderer can show something the user can act on.
 *
 * Returns absolute paths to the staged binaries plus metadata about
 * where they came from (useful for the catch-all error message).
 */
async function ensureBinariesStaged() {
  const userDataBin = path.join(app.getPath('userData'), 'bin');
  fs.mkdirSync(userDataBin, { recursive: true });

  // ---- Worker ----
  const workerSrc = resolveWorkerSource();
  if (!workerSrc) {
    const where = isDev
      ? `${FRONTEND_BIN_DIR}/main.py hoặc ${ENGINE_SRC_DIR}/main.py`
      : `${RESOURCE_BIN_DIR}/main.exe`;
    const hint = isDev
      ? 'Trong thư mục VietCast-Engine có sẵn main.py; nhưng main.js không tìm thấy nó. Hãy kiểm tra lại cấu trúc repo.'
      : 'Vui lòng build worker trước bằng build_exe.bat ở workspace root, sau đó gói lại installer.';
    throw new Error(
      `Không tìm thấy file xử lý video. Mong đợi ở: ${where}. ${hint}`
    );
  }

  // The worker is staged under its own name (main.py in dev,
  // main.exe in prod) so the Python interpreter sees it as expected.
  // In prod the staged copy is what we spawn; in dev we keep the copy
  // for diagnostics but actually run the original at workerSrc so the
  // `src/` import resolver finds the engine source tree.
  const stagedWorkerName = isDev ? 'main.py' : 'main.exe';
  const workerDst = path.join(userDataBin, stagedWorkerName);
  await copyIfMissing(workerSrc, workerDst, 'worker');

  // ---- FFmpeg ----
  const ffmpeg = resolveFfmpegSource();
  const ffmpegDst = path.join(userDataBin, FFMPEG_BIN_NAME);
  // If ffmpeg came from a checked-in folder, copy it into userData so
  // the worker has a writable location. If it came from system PATH
  // we don't need to copy — just resolve via PATH at spawn time.
  if (ffmpeg.source !== 'system PATH (UNVERIFIED)') {
    try {
      await copyIfMissing(ffmpeg.path, ffmpegDst, 'ffmpeg sidecar');
    } catch (err) {
      // Non-fatal: still allow the worker to spawn if ffmpeg is on
      // PATH; the worker will pick whichever it finds.
      console.warn(`[vietcast] ffmpeg not staged: ${err.message}`);
    }
  }
  const ffmpegStaged = fs.existsSync(ffmpegDst) ? ffmpegDst : ffmpeg.path;

  // Ensure the worker binary is executable on POSIX (no-op on Windows).
  try {
    fs.chmodSync(workerDst, 0o755);
    if (fs.existsSync(ffmpegDst)) fs.chmodSync(ffmpegDst, 0o755);
  } catch (_) {
    /* best-effort */
  }

  return {
    workerDst,
    ffmpegDst: ffmpegStaged,
    userDataBin,
    workerSrc,
    ffmpegSource: ffmpeg.source,
  };
}

async function copyIfMissing(src, dst, label = 'binary') {
  if (fs.existsSync(dst)) return;

  if (!fs.existsSync(src)) {
    throw new Error(
      `Không tìm thấy ${label} tại ${src}. Vui lòng kiểm tra cấu hình build.`
    );
  }

  await fs.promises.copyFile(src, dst);
  console.log(`[vietcast] staged ${label}: ${src} -> ${dst}`);
}

// ---------------------------------------------------------------------------
// processVideo — spawn the worker, forward logs back to the renderer
// ---------------------------------------------------------------------------
/**
 * Run the VietCast worker against the given params.
 *
 * params: {
 *   token:      string (JWT),
 *   url:        string (video URL),
 *   workspace?: string (optional custom workspace dir),
 *   audioMode?: 'dub' | 'original' | 'mute' | 'mix',
 *   keepTemp?:  boolean,
 *   verbose?:   boolean,
 *   logFile?:   string,
 * }
 *
 * Resolves with { code: number, stdout: string, stderr: string }.
 */
function processVideo(params) {
  // We mint the taskId on the main process so the renderer doesn't
  // have to coordinate — same id is forwarded to the worker (so the
  // output file lands at the predictable path) and returned to the
  // renderer so it can locate the file once the worker exits.
  const taskId =
    params.taskId ||
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  return new Promise(async (resolve, reject) => {
    let staged;
    try {
      staged = await ensureBinariesStaged();
    } catch (err) {
      return reject(err);
    }

    // `workerDst` is the staged copy in userData/bin (used only in
    // prod where the bundled exe is what we spawn). In dev we skip
    // it and run the original script via `workerSrc`, which lives
    // inside the engine source tree where `src/` is importable.
    const { workerDst, ffmpegDst, userDataBin, workerSrc } = staged;

    // Where the spawned process should "live" matters:
    //
    //   - In prod (PyInstaller build) `main.exe` carries the source
    //     modules in its bundle, so cwd= userData/bin is fine.
    //
    //   - In dev we run the Python entry point directly, and `main.py`
    //     does `from src import ...`. Python resolves those modules
    //     relative to cwd (and the script's own dir is implicitly on
    //     sys.path), so cwd MUST be the engine directory so `src/` is
    //     importable. userData/bin gets the staged `main.py` copy but
    //     is NOT the live source tree.
    const workerCwd = isDev ? ENGINE_SRC_DIR : userDataBin;

    // Build argv in the order the Python worker expects (see main._parse_args).
    // `--ffmpeg-path` is now MANDATORY in prod so the worker never falls
    // back to a system PATH that may point to an old/wrong ffmpeg.
    // `--task-id` is also passed so the worker can name its output
    // file `video_hoanthien_<taskId>.mp4` consistently.
    //
    // `--backend-url` is threaded down from the renderer (which knows
    // the URL the user logged in against) so the worker always hits
    // the same backend the rest of the app talks to. Falls back to
    // the prod Render service when the renderer didn't pass one.
    const argv = ['--token', String(params.token || '')];

    if (params.url) argv.push('--url', String(params.url));
    argv.push('--task-id', taskId);
    if (params.workspace) argv.push('--workspace', String(params.workspace));
    if (params.audioMode) argv.push('--audio-mode', String(params.audioMode));
    if (params.keepTemp) argv.push('--keep-temp');
    if (params.verbose) argv.push('--verbose');
    if (params.logFile) argv.push('--log-file', String(params.logFile));
    argv.push('--ffmpeg-path', ffmpegDst);   // always pass; resolved binary

    // Resolve the backend URL once, reuse for both argv and env so the
    // worker's sources of truth stay in lockstep.
    const backendUrl = String(
      params.backendUrl
      || process.env.VIETCAST_API_BASE_URL
      || DEFAULT_API_BASE_URL
    ).replace(/\/+$/, '');
    argv.push('--backend-url', backendUrl);

    // In dev: spawn python with main.py.
    // In prod: spawn the packaged main.exe (main.bin on POSIX).
    //
    // IMPORTANT: in dev the script we pass to Python must live in the
    // engine source directory — `main.py` does `from src import ...`
    // so the import resolver looks for a sibling `src/` folder. The
    // userData/bin/main.py copy is therefore ignored in dev; we spawn
    // the original at ${ENGINE_SRC_DIR}/main.py instead. Using the
    // staged copy would require copying the entire src/ tree, which
    // we deliberately do not.
    let command, commandArgs;
    if (isDev) {
      // Prefer 'python' on PATH; fall back to 'py' (Windows launcher).
      // Override via VIETCAST_PYTHON env var if you need a specific build.
      command = process.env.VIETCAST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
      const scriptSrc = workerSrc; // resolved earlier; lives in ENGINE_SRC_DIR
      commandArgs = [scriptSrc, ...argv];
    } else {
      command = workerDst;
      commandArgs = argv;
    }

    // Provide a clean, ASCII-only env to the worker.
    // - PYTHONUNBUFFERED   : flush stdout/stderr line-by-line.
    // - PYTHONIOENCODING   : utf-8 (Vietnamese text in stdout).
    // - VIETCAST_FFMPEG    : belt-and-braces env override for the worker.
    // - VIETCAST_BACKEND_URL: same URL as --backend-url, exposed as an
    //                          env var so any module that already reads
    //                          it directly (rather than via _ctx) still
    //                          sees the right value.
    // - PATH               : keep the user shell's PATH only — we no
    //                        longer rely on it for ffmpeg, but other
    //                        tools (whisper, edge-tts) still need it.
    const workerEnv = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      VIETCAST_FFMPEG: ffmpegDst,
      VIETCAST_BACKEND_URL: backendUrl,
    };

    console.log(`[vietcast] spawning: ${command} ${commandArgs.map(quoteArg).join(' ')}`);
    console.log(`[vietcast] worker env: VIETCAST_BACKEND_URL=${backendUrl} VIETCAST_FFMPEG=${ffmpegDst}`);

    let child;
    try {
      child = spawn(command, commandArgs, {
        cwd: workerCwd,
        env: workerEnv,
        windowsHide: true,
      });
    } catch (err) {
      // If the failure is "spawn python ENOENT", it means `python` is
      // not on PATH. Surface a useful hint.
      if (err && /ENOENT/.test(err.message || '')) {
        const hint = isDev
          ? 'Không tìm thấy Python trên PATH. Hãy cài Python 3.10+ rồi thử lại, hoặc đặt biến môi trường VIETCAST_PYTHON trỏ tới python.exe.'
          : 'Không tìm thấy worker binary. Vui lòng build lại installer bằng build_exe.bat.';
        return reject(new Error(`${hint} (${err.message})`));
      }
      return reject(err);
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(`[worker stdout] ${text}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('worker:stdout', text);
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(`[worker stderr] ${text}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('worker:stderr', text);
      }
    });

    child.on('error', (err) => {
      console.error(`[vietcast] failed to spawn worker: ${err.message}`);
      reject(err);
    });

    child.on('close', (code, signal) => {
      console.log(`[vietcast] worker exited code=${code} signal=${signal || '-'}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('worker:exit', { code, signal, taskId });
      }
      // Compose the resolved payload. Including taskId + videoPath lets
      // the renderer skip the file-system poll it was doing before.
      const outputDir = path.join(userDataBin, 'output');
      resolve({
        taskId,
        code: code ?? (signal ? 1 : 0),
        stdout,
        stderr,
        signal,
        videoPath: path.join(outputDir, `video_hoanthien_${taskId}.mp4`),
        srtPath: path.join(outputDir, `phude_${taskId}.srt`),
      });
    });
  });
}

function quoteArg(arg) {
  if (/[\s"']/.test(arg)) return `"${arg.replace(/"/g, '\\"')}"`;
  return arg;
}

// Expose for tests / external callers.
module.exports = { processVideo, ensureBinariesStaged, RESOURCE_BIN_DIR };