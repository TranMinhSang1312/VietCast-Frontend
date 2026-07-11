import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

/**
 * useStartProcessing
 *
 * Bridges React -> Electron preload -> main process worker.
 *
 * - Reads the JWT from AuthContext (NOT directly from localStorage here,
 *   so the same source of truth is used everywhere).
 * - Calls window.electronAPI.runWorker({ token, url, ... }).
 * - Subscribes to worker:stdout / worker:stderr / worker:exit events.
 *
 * Returns:
 *   { startProcessing, logs, isRunning, exitCode, reset }
 */
export function useStartProcessing() {
  const { token } = useAuth();

  const [logs, setLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [exitCode, setExitCode] = useState(null);
  const exitCodeRef = useRef(null);

  useEffect(() => {
    if (!window.electronAPI) return undefined;

    const offOut = window.electronAPI.onWorkerStdout((text) => {
      appendLogs(setLogs, "stdout", text);
    });
    const offErr = window.electronAPI.onWorkerStderr((text) => {
      appendLogs(setLogs, "stderr", text);
    });
    const offExit = window.electronAPI.onWorkerExit(({ code, signal }) => {
      setIsRunning(false);
      setExitCode(code ?? (signal ? 1 : 0));
      exitCodeRef.current = code ?? (signal ? 1 : 0);
      appendLogs(setLogs, "system", `[worker] exited code=${code} signal=${signal || "-"}`);
    });

    return () => { offOut(); offErr(); offExit(); };
  }, []);

  const startProcessing = useCallback(
    async (link, extra = {}) => {
      if (!window.electronAPI?.runWorker) {
        throw new Error("Electron bridge not available. Are you running outside Electron?");
      }
      if (!token) {
        throw new Error("Bạn chưa đăng nhập — không thể gửi lệnh xử lý video.");
      }
      if (!link || typeof link !== "string") {
        throw new Error("Link video không hợp lệ.");
      }

      setLogs([]);
      setExitCode(null);
      exitCodeRef.current = null;
      setIsRunning(true);
      appendLogs(setLogs, "system", `[ui] sending run-worker to main process: url=${link}`);

      try {
        const result = await window.electronAPI.runWorker({
          token,
          url: link,
          audioMode: extra.audioMode ?? "dub",
          keepTemp: !!extra.keepTemp,
          verbose: !!extra.verbose,
          workspace: extra.workspace,
          logFile: extra.logFile,
        });
        // result is also delivered via worker:exit, but keep this for callers
        // that want to await completion.
        return result;
      } catch (err) {
        setIsRunning(false);
        appendLogs(setLogs, "system", `[ui] spawn failed: ${err.message}`);
        throw err;
      }
    },
    [token],
  );

  const reset = useCallback(() => {
    setLogs([]);
    setExitCode(null);
    exitCodeRef.current = null;
  }, []);

  return { startProcessing, logs, isRunning, exitCode, reset };
}

function appendLogs(setLogs, stream, text) {
  const stamp = new Date().toISOString().slice(11, 19);
  setLogs((prev) => [...prev, { stream, text, stamp }]);
}