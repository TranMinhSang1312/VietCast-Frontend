import { useEffect, useState, useCallback, useRef } from "react";
import { Download, AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { API_BASE_URL_PROVIDER } from "../config";
import { handleApiError, ApiError } from "../utils/apiError";

/**
 * Forced update modal driven by {@code GET /api/v1/system/version}.
 *
 * Drop this near the root of the React tree (e.g. inside <App>). It:
 *   1. On mount, fetches the version metadata from the backend.
 *   2. Compares the server's `min_required_version` against the
 *      build-time constant {@code VITE_APP_VERSION} (inlined by Vite).
 *   3. When the running app is STRICTLY OLDER than the minimum required
 *      version, it renders a full-screen, non-dismissible modal that
 *      blocks the rest of the UI and offers a single "Tải bản cập nhật"
 *      button pointing at the server-provided {@code download_url}.
 *
 * Non-blocking cases (current >= min, network down, malformed payload):
 *   - No modal is shown.
 *   - A small breadcrumb is logged to the console for diagnosis.
 *
 * SemVer comparison is intentionally minimal — we treat "1.2" / "1.2.0"
 * / "1.2.0-rc1" as comparable by padding missing components with zeros
 * and stripping a single pre-release suffix.
 */
export default function VersionCheckModal() {
  /** Build-time constant injected by Vite (see vite.config.js). */
  const currentVersion = import.meta.env.VITE_APP_VERSION || "0.0.0";

  // Lifecycle states:
  //   "idle"      : not yet started
  //   "loading"   : fetch in flight
  //   "ok"        : fetched successfully, version acceptable
  //   "blocking"  : fetched successfully, app is too old → show modal
  //   "error"     : network / 5xx — do not block the user
  const [phase, setPhase] = useState("idle");
  const [versionMeta, setVersionMeta] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Prevent concurrent fetches in StrictMode (dev double-invoke).
  const cancelledRef = useRef(false);

  const fetchVersion = useCallback(async () => {
    setPhase("loading");
    setErrorMsg(null);

    // Resolve the API base once. In Electron this hits the runtime
    // config (env var driven); in browser it falls back to the Vite
    // constant. If neither is set we fall back to the production
    // backend hardcoded in src/config.js (NEVER localhost).
    const base = API_BASE_URL_PROVIDER.sync
      || (await API_BASE_URL_PROVIDER.load().catch(() => null))?.apiBaseUrl
      || API_BASE_URL_PROVIDER.sync;

    const url = (base || "").replace(/\/+$/, "") + "/api/v1/system/version";

    try {
      const res = await fetch(url, { method: "GET", headers: { "Accept": "application/json" } });
      if (!res.ok) {
        // Build a minimal axios-shaped error so handleApiError can
        // translate it the same way it does for axios calls.
        const text = await res.text().catch(() => "");
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = text; }
        throw new ApiError(handleApiError({
          response: { status: res.status, data: body },
          message: `HTTP ${res.status} ${res.statusText}`,
        }));
      }
      const data = await res.json();
      if (cancelledRef.current) return;

      // Normalize the response. The backend may use either camelCase
      // (SystemVersionResponse.java) or the snake_case spec from the
      // requirements — accept both.
      const minRequired =
        data.minRequiredVersion ?? data.min_required_version ?? "";
      const latest = data.latestVersion ?? data.latest_version ?? "";
      const downloadUrl = data.downloadUrl ?? data.download_url ?? "";
      const forceUpdate = Boolean(data.forceUpdate ?? data.force_update);

      const meta = {
        latestVersion: latest,
        minRequiredVersion: minRequired,
        forceUpdate,
        downloadUrl,
        releaseNotes: data.releaseNotes ?? data.release_notes ?? "",
        checkedAt: data.checkedAt ?? data.checked_at ?? null,
      };
      setVersionMeta(meta);

      const isOutdated = compareVersions(currentVersion, meta.minRequiredVersion) < 0;
      if (isOutdated || meta.forceUpdate) {
        setPhase("blocking");
      } else {
        setPhase("ok");
      }
    } catch (err) {
      if (cancelledRef.current) return;
      // Diagnostic log uses the original axios error; the user-visible
      // message comes from the central interceptor (already Vietnamese).
      // eslint-disable-next-line no-console
      console.warn("[VersionCheck] failed to fetch version:", err?.raw || err);
      setErrorMsg(err?.message || "Không thể kiểm tra phiên bản, vui lòng thử lại sau.");
      setPhase("error");
    }
  }, [currentVersion]);

  useEffect(() => {
    cancelledRef.current = false;
    fetchVersion();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchVersion]);

  // Only the "blocking" phase renders anything — every other phase
  // returns null so the rest of the app stays interactive.
  if (phase !== "blocking") return null;

  const downloadUrl = versionMeta?.downloadUrl || "https://api.vietcast.com/download";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-check-title"
      // Block backdrop clicks & Escape by NOT exposing any dismiss
      // handler. The user MUST update to proceed.
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 backdrop-blur-md"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md mx-4 rounded-2xl bg-slate-900 border border-amber-500/30 shadow-2xl shadow-amber-500/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 bg-gradient-to-br from-amber-500/10 to-transparent">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 id="version-check-title" className="text-base font-semibold text-slate-100">
              Bản cập nhật bắt buộc
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Phiên bản {currentVersion} không còn được hỗ trợ
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-200 leading-relaxed">
            Phiên bản đã cũ. Vui lòng cập nhật để tiếp tục sử dụng.
          </p>

          {/* Version comparison card */}
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Phiên bản hiện tại</span>
              <span className="font-mono text-slate-200">v{currentVersion}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Phiên bản tối thiểu</span>
              <span className="font-mono text-amber-300">v{versionMeta?.minRequiredVersion || "—"}</span>
            </div>
            {versionMeta?.latestVersion && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Phiên bản mới nhất</span>
                <span className="font-mono text-emerald-300">v{versionMeta.latestVersion}</span>
              </div>
            )}
          </div>

          {/* Release notes (collapsed if empty) */}
          {versionMeta?.releaseNotes && (
            <details className="rounded-xl bg-slate-950/40 border border-slate-800 px-3 py-2 group">
              <summary className="cursor-pointer text-xs text-slate-300 select-none">
                Ghi chú phát hành
              </summary>
              <p className="mt-2 text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">
                {versionMeta.releaseNotes}
              </p>
            </details>
          )}

          {/* Error breadcrumb (only if download URL was missing) */}
          {!versionMeta?.downloadUrl && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Server không trả về link tải. Đang dùng URL mặc định.</span>
            </div>
          )}
        </div>

        {/* Footer (single action — no Cancel) */}
        <div className="px-5 py-4 border-t border-slate-800 bg-slate-950/40">
          <a
            href={downloadUrl}
            // Open in default browser (Electron will hand the URL to
            // the OS via shell.openExternal — but since this is a
            // plain <a>, the OS will pick it up natively).
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-950 bg-gradient-to-br from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 transition shadow-lg shadow-amber-500/30"
          >
            <Download className="w-4 h-4" />
            <span>Tải bản cập nhật</span>
          </a>
          <button
            type="button"
            onClick={fetchVersion}
            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Kiểm tra lại</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Strict SemVer-ish comparison: returns -1 / 0 / 1.
 *
 * Tolerates:
 *   - missing patch / minor ("1.2" → "1.2.0")
 *   - pre-release suffix ("1.2.0-rc1" → compared on "1.2.0")
 *   - leading "v" ("v1.2.0" → "1.2.0")
 *
 * Any unparseable component is treated as 0.
 */
function compareVersions(a, b) {
  const norm = (v) =>
    String(v || "")
      .trim()
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((p) => {
        const n = parseInt(p, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      });
  const pa = norm(a);
  const pb = norm(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}