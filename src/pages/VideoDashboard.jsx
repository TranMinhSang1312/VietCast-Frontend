import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import axios from "axios";
import { Loader2, Wand2, Mic, Subtitles, CheckCircle2, Download, AlertCircle, Film, Languages, Coins } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL_PROVIDER } from "../config";
import { recordUsageLog } from "../services/history";
import WatermarkRemover from "../components/watermark/WatermarkRemover";
import { PRICING } from "../config/pricing";

const AUDIO_MODES = [
  {
    value: "dub",
    label: "Lồng tiếng AI",
    description: `${PRICING.dubPerMinute} credit/phút, tối thiểu ${PRICING.dubPerMinute} credit. Gồm giọng Việt và SRT song ngữ.`,
    icon: Wand2,
  },
  {
    value: "original",
    label: "Giữ tiếng gốc",
    description: `${PRICING.originalPerMinute} credit/phút, tối thiểu ${PRICING.basicMinimum} credit.`,
    icon: Mic,
  },
  {
    value: "mute",
    label: "Video câm",
    description: `${PRICING.mutePerMinute} credit/phút, tối thiểu ${PRICING.basicMinimum} credit. Bỏ âm thanh và không tạo SRT.`,
    icon: Film,
  },
  {
    value: "subtitle",
    label: "Chỉ tạo phụ đề",
    description: `${PRICING.subtitlePerMinute} credit/phút, tối thiểu ${PRICING.subtitlePerMinute} credit. Nhận file SRT tiếng Việt.`,
    icon: Languages,
  },
  {
    value: "mix",
    label: "Trộn âm thanh gốc & AI",
    description: `${PRICING.mixPerMinute} credit/phút, tối thiểu ${PRICING.mixPerMinute} credit. Giữ nhạc nền và thêm giọng Việt.`,
    icon: Subtitles,
  },
];

const MODE_OUTPUTS = Object.freeze({
  original: { label: "Video giữ tiếng gốc", video: true, srt: false },
  mute: { label: "Video không âm thanh", video: true, srt: false },
  subtitle: { label: "Phụ đề SRT tiếng Việt", video: false, srt: true },
  dub: { label: "Video lồng tiếng + SRT", video: true, srt: true },
  mix: { label: "Video trộn âm + SRT", video: true, srt: true },
});

function outputForMode(mode) {
  return MODE_OUTPUTS[mode] ?? MODE_OUTPUTS.mix;
}

function progressLabel(mode, progress, targetLanguage = "Tiếng Việt") {
  if (progress < 10) return "ĐANG TẢI VIDEO TỪ NGUỒN...";
  if (mode === "original" || mode === "mute") {
    return progress < 90 ? "ĐANG XỬ LÝ VIDEO..." : "ĐANG TẢI KẾT QUẢ LÊN...";
  }
  if (progress < 35) return "ĐANG TRÍCH XUẤT ÂM THANH...";
  if (progress < 70) return mode === "subtitle" ? "ĐANG NHẬN DẠNG LỜI NÓI..." : `ĐANG DỊCH SANG ${(targetLanguage || "TIẾNG VIỆT").toUpperCase()}...`;
  if (mode === "subtitle") return "ĐANG HOÀN THIỆN FILE SRT...";
  return progress < 90 ? "ĐANG TỔNG HỢP GIỌNG ĐỌC AI..." : "ĐANG RENDER VIDEO CUỐI CÙNG...";
}

// Whitelist kept in sync with backend VideoRequest.@Pattern on `voice`.
// Dynamic voice mapping per target language
const LANGUAGE_VOICE_MAP = {
  "Tiếng Việt": [
    { value: "vi-VN-NamMinhNeural", label: "Nam Minh (nam, mặc định)", description: "Giọng nam miền Bắc tự nhiên, truyền cảm" },
    { value: "vi-VN-HoaiMyNeural", label: "Hoài My (nữ)", description: "Giọng nữ miền Bắc truyền cảm, ấm áp" },
  ],
  "English": [
    { value: "en-US-ChristopherNeural", label: "Christopher (nam)", description: "Giọng nam Mỹ tự nhiên, chuẩn tin tức" },
    { value: "en-US-JennyNeural", label: "Jenny (nữ)", description: "Giọng nữ Mỹ truyền cảm, rõ ràng" },
  ],
  "日本語": [
    { value: "ja-JP-KeitaNeural", label: "Keita 啓太 (nam)", description: "Giọng nam Nhật Bản chuẩn" },
    { value: "ja-JP-NanamiNeural", label: "Nanami 七海 (nữ)", description: "Giọng nữ Nhật Bản ngọt ngào" },
  ],
  "한국어": [
    { value: "ko-KR-InJoonNeural", label: "InJoon 인준 (nam)", description: "Giọng nam Hàn Quốc tự nhiên" },
    { value: "ko-KR-SunHiNeural", label: "SunHi 선희 (nữ)", description: "Giọng nữ Hàn Quốc truyền cảm" },
  ],
  "Español": [
    { value: "es-ES-AlvaroNeural", label: "Alvaro (nam)", description: "Giọng nam Tây Ban Nha" },
    { value: "es-ES-ElviraNeural", label: "Elvira (nữ)", description: "Giọng nữ Tây Ban Nha" },
  ],
  "Français": [
    { value: "fr-FR-HenriNeural", label: "Henri (nam)", description: "Giọng nam Pháp" },
    { value: "fr-FR-DeniseNeural", label: "Denise (nữ)", description: "Giọng nữ Pháp" },
  ],
  "Deutsch": [
    { value: "de-DE-ConradNeural", label: "Conrad (nam)", description: "Giọng nam Đức" },
    { value: "de-DE-KatjaNeural", label: "Katja (nữ)", description: "Giọng nữ Đức" },
  ],
  "中文": [
    { value: "zh-CN-YunjianNeural", label: "Yunjian 云健 (nam)", description: "Giọng nam Trung Quốc chuẩn" },
    { value: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao 晓晓 (nữ)", description: "Giọng nữ Trung Quốc nhẹ nhàng" },
  ],
};

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;
const ACTIVE_TASK_STORAGE_KEY = "vc_active_task";
const TASK_RECOVERY_LOOKBACK_MS = 10 * 60 * 1000;

function extractUrl(raw) {
  if (!raw || !raw.trim()) return null;
  const match = raw.trim().match(/https?:\/\/\S+/);
  if (match) return match[0].replace(/\/+$/, "");
  return null;
}

/**
 * Mirror of the backend {@code normalizeVideoUrl}: drop the YouTube
 * share-tracker {@code si=...} parameter so two requests with /watch?v=X
 * and /watch?v=X&si=Y produce the same preview / dedup key.
 */
function normalizePreviewUrl(raw) {
  if (!raw) return raw;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const isYoutube = lower.includes("youtube.com") || lower.includes("youtu.be");
  if (!isYoutube) return trimmed;
  const stripped = trimmed.replace(/([?&])si=[A-Za-z0-9_-]+/g, "");
  return stripped.replace(/[?&]$/, "");
}

function toDashboardResult(task, fallback) {
  const taskId = task?.taskId ?? task?.id;
  if (taskId === null || taskId === undefined || taskId === "") return null;

  const status = task.status === "PENDING" ? "PROCESSING" : task.status;
  return {
    ...fallback,
    taskId: String(taskId),
    status: status || "PROCESSING",
    url: task.originalUrl ?? fallback?.url ?? null,
    audioMode: task.audioMode ?? fallback?.audioMode ?? null,
    videoUrl: task.videoUrl ?? task.resultUrl ?? null,
    srtUrl: task.srtUrl ?? null,
    message: task.message ?? task.note ?? fallback?.message ?? null,
    progress: typeof task.progress === "number" ? task.progress : 0,
  };
}

function taskMatchesSubmission(task, submission) {
  if (!task || !submission?.url) return false;
  const sameUrl = normalizePreviewUrl(task.originalUrl) === normalizePreviewUrl(submission.url);
  const sameMode = !task.audioMode || !submission.audioMode || task.audioMode === submission.audioMode;
  if (!sameUrl || !sameMode) return false;

  const submittedAt = Date.parse(submission.submittedAt);
  const createdAt = Date.parse(task.createdAt);
  const lowerBound = Number.isFinite(submittedAt)
    ? submittedAt - 15_000
    : Date.now() - TASK_RECOVERY_LOOKBACK_MS;
  return !Number.isFinite(createdAt) || createdAt >= lowerBound;
}

async function recoverSubmittedTask(submission, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data } = await axios.get(`${API_BASE_URL}/api/v1/tasks`, { timeout: 10000 });
    const tasks = Array.isArray(data) ? data : [];
    const match = tasks.find((task) => taskMatchesSubmission(task, submission));
    if (match) return toDashboardResult(match, submission);

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return null;
}

export default function VideoDashboard() {
  const { user, updateCreditBalance, syncProfile } = useAuth();
  const [url, setUrl] = useState(() => localStorage.getItem("vc_url") || "");
  const [audioMode, setAudioMode] = useState(() => localStorage.getItem("vc_audioMode") || "mix");
  const [voice, setVoice] = useState(() => localStorage.getItem("vc_voice") || "vi-VN-NamMinhNeural");
  const [targetLanguage, setTargetLanguage] = useState(() => localStorage.getItem("vc_targetLanguage") || "Tiếng Việt");
  const [logoCoordinates, setLogoCoordinates] = useState(() => localStorage.getItem("vc_logoCoordinates") || "");
  const [subtitleMask, setSubtitleMask] = useState(() => localStorage.getItem("vc_subtitleMask") || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_TASK_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [progress, setProgress] = useState(() => {
    const saved = localStorage.getItem("vc_active_progress");
    return saved ? Number(saved) : 0;
  });

  // ----- Cost preview state -----
  // `costPreview` is null until the user pastes a valid URL and the
  // debounced preview call returns. It carries the breakdown the
  // server computed so the renderer can:
  //   - display the mode-aware, per-second total inline below the
  //     input box
  //   - disable the submit button when sufficient=false
  //   - populate the "Nạp thêm ngay" deep-link with the missing amount
  // `costPreviewLoading` is true while the debounced call is in
  // flight, used to render a small spinner inside the URL field.
  const [costPreview, setCostPreview] = useState(null);
  const [costPreviewLoading, setCostPreviewLoading] = useState(false);
  // `showCreditWarning` flips on when the user clicks the disabled
  // submit button (or when balance changed underneath them) so we can
  // pop the warning dialog with the missing-credits number.
  const [showCreditWarning, setShowCreditWarning] = useState(false);

  // Crop modal states
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropType, setCropType] = useState("logo"); // "logo" | "subtitle"

  const pollIntervalRef = useRef(null);
  const usageLoggedTaskIdRef = useRef(null);
  const recoveryAttemptedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("vc_url", url);
  }, [url]);

  useEffect(() => {
    localStorage.setItem("vc_audioMode", audioMode);
  }, [audioMode]);

  useEffect(() => {
    localStorage.setItem("vc_voice", voice);
  }, [voice]);

  useEffect(() => {
    localStorage.setItem("vc_targetLanguage", targetLanguage);
  }, [targetLanguage]);

  useEffect(() => {
    localStorage.setItem("vc_logoCoordinates", logoCoordinates);
  }, [logoCoordinates]);

  useEffect(() => {
    localStorage.setItem("vc_subtitleMask", subtitleMask);
  }, [subtitleMask]);

  useEffect(() => {
    if (result) {
      localStorage.setItem(ACTIVE_TASK_STORAGE_KEY, JSON.stringify(result));
    } else {
      localStorage.removeItem(ACTIVE_TASK_STORAGE_KEY);
    }
  }, [result]);

  useEffect(() => {
    localStorage.setItem("vc_active_progress", String(progress));
  }, [progress]);

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const resetResultState = useCallback(() => {
    localStorage.removeItem(ACTIVE_TASK_STORAGE_KEY);
    setResult(null);
    setProgress(0);
    setVideoReady(false);
    setVideoError(false);
    clearPollInterval();
  }, [clearPollInterval]);

  const handleUrlChange = useCallback(
    (e) => {
      const next = e.target.value;
      if (result && next !== url) {
        // If a render is in flight, ask first — calling resetResultState
        // here would silently clear the UI without informing the user,
        // and the backend job would keep running unattached until it
        // /completes into a row nobody is polling any more.
        const confirmed =
          result.status === "PROCESSING"
            ? window.confirm(
                "Bạn đang có tác vụ đang xử lý. Đổi URL sẽ huỷ tác vụ hiện tại và tạo tác vụ mới. Tiếp tục?"
              )
            : true;
        if (confirmed) {
          resetResultState();
        } else {
          // User opted out — revert the input to the previous URL so the
          // browser does not visually show "ghost" draft text.
          e.target.value = url;
          return;
        }
      }
      setUrl(next);
      if (error) setError(null);
    },
    [result, url, error, resetResultState],
  );

  const handleModeChange = useCallback(
    (mode) => {
      setAudioMode(mode);
      if (error) setError(null);
      if (result && mode !== audioMode) {
        resetResultState();
      }
    },
    [result, audioMode, error, resetResultState],
  );

const handleReset = useCallback(() => {
        setUrl("");
        setAudioMode("mix");
        setVoice("vi-VN-NamMinhNeural");
        setLogoCoordinates("");
        setSubtitleMask("");
        setResult(null);
        setError(null);
        setVideoReady(false);
        setVideoError(false);
        setProgress(0);
        setCostPreview(null);
        setCostPreviewLoading(false);
        setShowCreditWarning(false);
        clearPollInterval();
    }, [clearPollInterval]);

    // Force-download via the backend's presigned-R2 endpoint. We do NOT
    // link straight to the public R2 URL because (a) browsers ignore
    // `download` on cross-origin links and (b) R2 serves the file with
    // `inline` disposition by default — clicking would auto-play the
    // MP4 in a new tab instead of saving it.
    const handleDownload = useCallback(async (taskId, type) => {
        if (!taskId) return;
        try {
            const resp = await axios.get(
                `${API_BASE_URL}/api/v1/videos/${taskId}/download`,
                { params: { type } }
            );
            const { downloadUrl, filename } = resp.data || {};
            if (!downloadUrl) {
                throw new Error("Backend did not return a downloadUrl");
            }
            const a = document.createElement("a");
            a.href = downloadUrl;
            if (filename) a.download = filename;
            a.rel = "noopener";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            // 422 UNSUPPORTED_URL means the row predates this column —
            // fall back to opening the public URL so the user can still
            // get the file inline.
            const code = err.response?.data?.code;
            const status = err.response?.status;
            const msg = err.response?.data?.message;
            const fallback = type === "srt" ? result?.srtUrl : result?.videoUrl;
            if (code === "FILE_EXPIRED" || status === 410) {
                setError(msg || "Tệp này đã hết hạn lưu trữ 7 ngày trên hệ thống. Vui lòng thực hiện lại tác vụ nếu cần.");
            } else if (code === "UNSUPPORTED_URL" && fallback) {
                window.open(fallback, "_blank", "noopener");
            } else {
                console.error("[download] failed", err);
                setError(msg || err.message || "Không thể tải file. Vui lòng thử lại.");
            }
        }
    }, [result]);

  // Debounced fetch of the cost preview whenever the URL or audioMode
  // change. We deliberately keep audioMode in the dependency list so
  // toggling "Lồng tiếng AI" → "Giữ tiếng gốc" recomputes without the
  // user having to re-paste the URL.
  //
  // Latency model: typing the last char of a YouTube URL fires the
  // effect; the 600ms debounce absorbs "still typing" keystrokes. Worst
  // case is one round-trip per settled URL = ~10s when yt-dlp times
  // out (matches the server timeout). We surface that with a spinner
function computeInstantCostPreview(durationSeconds, mode, logoCoords, subMask, userBalance) {
  const seconds = Math.max(0, Number(durationSeconds) || 0);
  const minutes = seconds / 60;

  let ratePerMin = 800;
  let minCost = 800;
  if (mode === "original" || mode === "mute") {
    ratePerMin = 200;
    minCost = 500;
  } else if (mode === "subtitle") {
    ratePerMin = 500;
    minCost = 500;
  } else if (mode === "dub" || mode === "mix") {
    ratePerMin = 800;
    minCost = 800;
  }

  const baseCost = Math.max(minCost, Math.round(minutes * ratePerMin));

  const hasLogo = mode !== "subtitle" && Boolean(logoCoords && logoCoords.trim());
  const hasSubMask = mode !== "subtitle" && Boolean(subMask && subMask.trim());
  let visualFilterCost = 0;
  if (hasLogo || hasSubMask) {
    visualFilterCost = Math.round(minutes * 250);
  }

  const estimatedCost = baseCost + visualFilterCost;
  const currentBalance = Number(userBalance) || 0;
  const sufficient = currentBalance >= estimatedCost;

  return {
    durationSeconds: seconds,
    estimatedCost,
    userBalance: currentBalance,
    sufficient,
    missingCredits: sufficient ? 0 : Math.round(estimatedCost - currentBalance),
    audioMode: mode,
  };
}

  const lastPreviewUrlRef = useRef("");
  const cachedDurationRef = useRef(null);

  // Debounced fetch of the cost preview whenever the URL or audioMode change.
  // Optimization: If the video duration is already probed for this URL,
  // mode switching (e.g. "dub" <-> "mix" or "subtitle") instantly recalculates cost
  // client-side without making redundant preview-cost API calls to the server.
  useEffect(() => {
    const cleanUrl = extractUrl(url);
    if (!cleanUrl) {
      setCostPreview(null);
      setCostPreviewLoading(false);
      lastPreviewUrlRef.current = "";
      cachedDurationRef.current = null;
      return;
    }

    const canonical = normalizePreviewUrl(cleanUrl);
    const userBalance = (Number(user?.creditBalance) || 0) + (Number(user?.bonusCreditBalance) || 0);

    if (canonical === lastPreviewUrlRef.current && cachedDurationRef.current !== null) {
      const instantPreview = computeInstantCostPreview(
        cachedDurationRef.current,
        audioMode,
        logoCoordinates,
        subtitleMask,
        userBalance
      );
      setCostPreview(instantPreview);
      setCostPreviewLoading(false);
      return;
    }

    const handle = setTimeout(() => {
      const controller = new AbortController();
      setCostPreviewLoading(true);
      axios
        .get(`${API_BASE_URL}/api/v1/videos/preview-cost`, {
          params: {
            url: canonical,
            audioMode,
            logoCoordinates: audioMode === "subtitle" ? null : (logoCoordinates || null),
            subtitleMask: audioMode === "subtitle" ? null : (subtitleMask || null),
          },
          signal: controller.signal,
          timeout: 15000,
        })
        .then((res) => {
          setCostPreview(res.data);
          if (res.data?.durationSeconds) {
            lastPreviewUrlRef.current = canonical;
            cachedDurationRef.current = res.data.durationSeconds;
          }
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          setCostPreview(null);
        })
        .finally(() => {
          setCostPreviewLoading(false);
        });
      return () => controller.abort();
    }, 600);
    return () => clearTimeout(handle);
  }, [url, audioMode, logoCoordinates, subtitleMask, user?.creditBalance, user?.bonusCreditBalance]);

  const refreshUserCredit = useCallback(async () => {
    try {
      await syncProfile();
    } catch {
      /* ignore */
    }
  }, [syncProfile]);

  // A submit can finish after the user navigates to History. React then
  // discards the state update from the unmounted dashboard, while the
  // optimistic PROCESSING object remains in localStorage without a taskId.
  // Reconcile that object against the authoritative task list on remount.
  useEffect(() => {
    if (!result || result.taskId || result.status !== "PROCESSING") return;
    if (recoveryAttemptedRef.current) return;
    recoveryAttemptedRef.current = true;

    let cancelled = false;
    const pending = result;

    recoverSubmittedTask(pending)
      .then((recovered) => {
        if (recovered) {
          localStorage.setItem(ACTIVE_TASK_STORAGE_KEY, JSON.stringify(recovered));
          if (!cancelled) {
            setResult(recovered);
            setProgress(
              recovered.status === "COMPLETED"
                ? 100
                : recovered.status === "FAILED"
                  ? 0
                  : recovered.progress || 0,
            );
            setError(null);
            refreshUserCredit();
          }
          return;
        }

        localStorage.removeItem(ACTIVE_TASK_STORAGE_KEY);
        if (!cancelled) {
          setResult(null);
          setProgress(0);
          // Gracefully clear draft without showing a false-alarm error banner
          setError(null);
        }
      })
      .catch(() => {
        // Keep the pending object so the next page visit can retry recovery;
        // a temporary history/API outage must not destroy the task handle.
        recoveryAttemptedRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [result, refreshUserCredit]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      const raw = url.trim();
      if (!raw) {
        setError("Vui lòng nhập URL video.");
        return;
      }

      const cleanUrl = extractUrl(raw);
      if (!cleanUrl) {
        setError("Không tìm thấy đường dẫn video hợp lệ trong nội dung bạn dán.");
        return;
      }

      // Pre-flight balance guard.
      // The cost preview has been refreshing on every URL change
      // (debounced 600ms). If it has come back as `sufficient=false`
      // we MUST block the submit:
      //   - a 40-minute clip routed into the queue burns an engine
      //     worker slot for 10+ minutes,
      //   - the engine reports a longer or equal duration at the end,
      //   - the post-hoc charge then throws InsufficientCreditException
      //     and the user effectively gets a free render.
      // The backend re-checks on POST /process — this is purely UX.
      if (costPreview && costPreview.sufficient === false) {
        setShowCreditWarning(true);
        return;
      }

      setIsLoading(true);
      setError(null);
      recoveryAttemptedRef.current = false;
      const pendingSubmission = {
        status: "PROCESSING",
        url: cleanUrl,
        audioMode,
        submittedAt: new Date().toISOString(),
      };
      localStorage.setItem(ACTIVE_TASK_STORAGE_KEY, JSON.stringify(pendingSubmission));
      setResult(pendingSubmission);
      setVideoReady(false);
      setVideoError(false);

      try {
        const { data } = await axios.post(
          `${API_BASE_URL}/api/v1/videos/process`,
          {
            url: cleanUrl,
            audioMode,
            targetLanguage,
            // Only forward a voice value when the user picked an
            // AI-dub mode; otherwise the engine skips TTS anyway.
            voice: (audioMode === "dub" || audioMode === "mix") && voice ? voice : null,
            logoCoordinates: audioMode === "subtitle" ? null : (logoCoordinates.trim() || null),
            subtitleMask: audioMode === "subtitle" ? null : (subtitleMask.trim() || null)
          },
          { headers: { "Content-Type": "application/json" }, timeout: 30000 }
        );
        const acceptedResult = {
          ...data,
          url: data.url ?? cleanUrl,
          audioMode: data.audioMode ?? audioMode,
          voice: data.voice ?? voice,
          submittedAt: pendingSubmission.submittedAt,
        };
        // Persist synchronously: if navigation unmounts this component before
        // React applies setResult, the next mount still has the real taskId.
        localStorage.setItem(ACTIVE_TASK_STORAGE_KEY, JSON.stringify(acceptedResult));
        setResult(acceptedResult);
        refreshUserCredit();
      } catch (err) {
        const status = err?.response?.status || err?.status;
        const code = err?.response?.data?.code || err?.code;
        const backendMessage = err?.response?.data?.message;

        // A timeout/network disconnect is ambiguous: the backend may have
        // accepted and even completed the task after the browser stopped
        // waiting. Recover it before showing an error or clearing the UI.
        if (!err?.response || code === "ECONNABORTED") {
          try {
            const recovered = await recoverSubmittedTask(pendingSubmission);
            if (recovered) {
              localStorage.setItem(ACTIVE_TASK_STORAGE_KEY, JSON.stringify(recovered));
              setResult(recovered);
              setProgress(
                recovered.status === "COMPLETED"
                  ? 100
                  : recovered.status === "FAILED"
                    ? 0
                    : recovered.progress || 0,
              );
              setError(null);
              refreshUserCredit();
              return;
            }
          } catch {
            // Fall through to the normal connection error after recovery
            // attempts are exhausted.
          }
        }

        resetResultState();
        if (code === "VIDEO_TOO_LONG" || status === 413) {
          // Cap enforcement surface. The preview may have failed
          // (yt-dlp timeout) so the user saw no banner, but /process
          // resolves the duration fresh and rejects here. Show the
          // backend's message verbatim so the user sees the actual
          // length + cap.
          setError(
            backendMessage ||
              "Video vượt quá giới hạn 90 phút. Vui lòng cắt video trước khi xử lý."
          );
        } else if (status === 402 || status === 403 || code === "INSUFFICIENT_CREDIT") {
          try {
            await syncProfile();
          } catch {
            /* ignore */
          }
          setError(
            backendMessage ||
              "Bạn không đủ credit để xử lý video. Vui lòng click nút 'Nạp tiền' ở góc trên bên phải để nạp thêm credit."
          );
        } else {
          setError(backendMessage || err?.message || "Không thể kết nối tới máy chủ. Vui lòng thử lại sau.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [url, audioMode, voice, logoCoordinates, subtitleMask, costPreview, updateCreditBalance, refreshUserCredit, resetResultState],
  );

  useEffect(() => {
    if (!result?.taskId) return;
    if (result.status !== "PROCESSING") return;

    const taskId = result.taskId;
    // Snapshot the starting status so a transient COMPLETED→PROCESSING
    // flicker (e.g. retry/rollback) doesn't tear down the polling
    // interval and freeze the UI on the last value seen. We gate the
    // poll on a stable taskId only, and the poll itself decides when
    // to stop based on the latest server status.

    const fetchStatus = async () => {
      try {
        const { data } = await axios.get(
          `${API_BASE_URL}/api/v1/videos/status/${taskId}`,
          { timeout: 10000 }
        );
        if (data.taskId && data.taskId !== taskId) {
          return;
        }
        setResult((prev) => ({
          ...prev,
          taskId: data.taskId ?? prev.taskId,
          status: data.status,
          videoUrl: data.videoUrl ?? null,
          srtUrl: data.srtUrl ?? null,
          message: data.message ?? prev.message,
        }));

        const serverProgress = typeof data.progress === "number" ? data.progress : 0;
        if (data.status === "COMPLETED") {
          setProgress(100);
        } else if (data.status === "FAILED") {
          setProgress(0);
        } else {
          setProgress((prev) => (serverProgress > prev ? serverProgress : prev));
        }

        if (data.status === "COMPLETED" || data.status === "FAILED") {
          clearPollInterval();
          refreshUserCredit();
        }
      } catch (err) {
        if (err.response?.status === 404) {
          clearPollInterval();
          // Server restarted or the task row was evicted — show the
          // error AND clear the right-hand panel so the user does not
          // see "Tác vụ đang xử lý" + taskId ghosted next to a
          // "Không tìm thấy tác vụ" banner.
          resetResultState();
          setError("Không tìm thấy tác vụ. Có thể server đã khởi động lại.");
        }
      }
    };

    fetchStatus();
    pollIntervalRef.current = setInterval(fetchStatus, 2000);

    // Pause polling when the tab is hidden — saves backend cycles and
    // avoids waking the user's laptop. Resume on visibility change.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !pollIntervalRef.current) {
        fetchStatus();
        pollIntervalRef.current = setInterval(fetchStatus, 2000);
      } else if (document.visibilityState !== "visible" && pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearPollInterval();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // Depend ONLY on taskId — depending on status caused the interval
    // to be torn down + recreated on every status tick (C-1 race).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.taskId]);

  useEffect(() => {
    if (!result?.taskId) return;
    if (result.status !== "COMPLETED" && result.status !== "FAILED") return;
    if (usageLoggedTaskIdRef.current === result.taskId) return;

    usageLoggedTaskIdRef.current = result.taskId;
    recordUsageLog({
      taskId: result.taskId,
      url: result.url ?? null,
      audioMode: result.audioMode ?? null,
      status: result.status,
      note: result.message ?? null,
    }).catch((err) => console.error("[history] recordUsageLog failed:", err));
  }, [result?.taskId, result?.status, result?.url, result?.audioMode, result?.message]);

  useEffect(() => {
    if (isLoading && usageLoggedTaskIdRef.current) {
      usageLoggedTaskIdRef.current = null;
    }
  }, [isLoading]);

  const isProcessing = result?.status === "PROCESSING";

  const videoSrc = useMemo(() => {
    if (!result?.videoUrl) return undefined;
    const sep = result.videoUrl.includes("?") ? "&" : "?";
    return `${result.videoUrl}${sep}t=${result.taskId}`;
  }, [result?.videoUrl, result?.taskId]);

  const placeholderMessage = useMemo(() => {
    if (isProcessing && result?.audioMode === "subtitle") return "Đang tạo phụ đề tiếng Việt…";
    if (isProcessing && (result?.audioMode === "original" || result?.audioMode === "mute")) {
      return "Đang tải và xử lý video…";
    }
    if (isProcessing) return "Đang lồng tiếng và render video…";
    if (result?.status === "FAILED") return "Quá trình xử lý thất bại.";
    if (result?.audioMode === "subtitle") return "Phụ đề đã sẵn sàng để tải xuống.";
    return "Đang tải video lên máy chủ…";
  }, [isProcessing, result?.audioMode, result?.status]);

  return (
    <div className="w-full flex flex-col items-center bg-slate-950 font-sans text-zinc-100 px-4 py-8 sm:py-12 relative overflow-x-hidden">
      {/* Ambient backgrounds */}
      <div className="absolute top-[-20%] right-[-10%] w-[720px] h-[720px] bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-25%] left-[-15%] w-[520px] h-[520px] bg-violet-600/8 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-6xl z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-white/[0.06] mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Languages className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white leading-tight">VietCast</h1>
              <p className="text-xs text-slate-500 font-mono">Workspace</p>
            </div>
          </div>
          <div className="text-center md:text-left select-none">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tighter text-zinc-100">
              Lồng tiếng Video AI
            </h2>
          </div>
        </header>

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form Controls */}
          <section className="lg:col-span-7 rounded-3xl border border-white/[0.06] bg-white/[0.025] backdrop-blur-xl p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* URL input */}
              <div>
                <label htmlFor="video-url" className="block text-sm font-semibold text-zinc-300 mb-2">
                  Đường dẫn Video <span className="text-zinc-500 font-normal">(TikTok / YouTube / Douyin)</span>
                </label>
                <input
                  id="video-url"
                  type="url"
                  inputMode="url"
                  placeholder="Dán link video tại đây..."
                  value={url}
                  onChange={handleUrlChange}
                  disabled={isLoading || isProcessing}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-white/[0.06] text-zinc-100 placeholder:text-slate-600 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 focus:outline-none transition disabled:opacity-50 disabled:cursor-not-allowed text-base font-mono"
                />

                {/* ----- Cost preview panel -----
                    Renders inline below the URL field the moment the
                    debounced preview call returns. Three states:
                      (1) costPreviewLoading=true → spinner + "Đang tính..."
                      (2) costPreview null (failed) → nothing — the
                          user can still submit, the server re-checks.
                      (3) costPreview.sufficient=true → green-ish
                          breakdown: "X phút × Y credit = Z credit"
                      (4) costPreview.sufficient=false → red-ish
                          breakdown + the "Không đủ credit" caption
                          that links into the topup modal.
                    We surface the breakdown BEFORE the user can click
                    submit, so a clip whose estimate exceeds the balance shows the
                    red breakdown immediately rather than waiting for
                    /process to 403 them after the engine has already
                    started chewing on it. */}
                {costPreviewLoading && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang tính chi phí xử lý video...</span>
                  </div>
                )}
                {!costPreviewLoading && costPreview && (() => {
                  // Three mutually-exclusive visual states:
                  //   ① overCap=true              → red banner, no pricing shown
                  //   ② overCap=false, !sufficient → red pricing + topup CTA
                  //   ③ overCap=false,  sufficient → green pricing
                  //
                  // flatBilled remains on the wire for compatibility, but
                  // every active mode now uses a per-second rate plus its
                  // mode-specific minimum.
                  const overCap = costPreview.overCap === true;
                  const sufficient = costPreview.sufficient === true;
                  let themeClass;
                  if (overCap) {
                    themeClass = "bg-amber-500/5 border-amber-500/30 text-amber-100";
                  } else if (sufficient) {
                    themeClass = "bg-emerald-500/5 border-emerald-500/20 text-emerald-200";
                  } else {
                    themeClass = "bg-rose-500/5 border-rose-500/30 text-rose-200";
                  }
                  return (
                    <div className={"mt-2 rounded-lg border px-3 py-2.5 text-xs " + themeClass}>
                      {overCap ? (
                        // Refusal banner — no pricing math shown because
                        // the user can't fix this with credits, only with
                        // a shorter video.
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="font-semibold flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Vượt quá {costPreview.maxMinutes ?? 90} phút
                          </span>
                          <span className="font-mono text-[11px]">
                            Video: ~{costPreview.estimatedMinutes} phút
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="font-semibold">
                            {costPreview.durationSeconds
                              ? `Thời lượng: ${costPreview.durationSeconds} giây — Chi phí: ${Math.round(costPreview.totalRequired).toLocaleString("vi-VN")} credit`
                              : `Ước tính: ${Math.round(costPreview.totalRequired).toLocaleString("vi-VN")} credit`}
                          </span>
                          <span className="font-mono text-[11px]">
                            Bạn có: {Math.round(costPreview.currentBalance).toLocaleString("vi-VN")}
                          </span>
                        </div>
                      )}
                      {costPreview.hint && (
                        <p className="mt-1 text-[11px] opacity-80">{costPreview.hint}</p>
                      )}
                      {!sufficient && !overCap && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCreditWarning(true);
                            }}
                            className="px-3 py-1.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-100 text-xs font-semibold hover:bg-rose-500/30 active:scale-[0.98] transition"
                          >
                            Nạp thêm {Math.round(costPreview.missingCredits).toLocaleString("vi-VN")} credit ngay
                          </button>
                          <span className="text-[11px] opacity-70">
                            hoặc chọn video ngắn hơn.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Advanced Crop Tools (Logo & Subtitles) */}
              {audioMode !== "subtitle" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/40 border border-white/[0.06]">
                  <div>
                    <span className="block text-sm font-semibold text-slate-200">Xóa Logo cứng (Delogo)</span>
                    <span className="text-xs text-slate-500 font-mono mt-0.5 block">
                      {logoCoordinates ? `Đã chọn: ${logoCoordinates}` : "Chưa chọn khung"}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {logoCoordinates && (
                      <button
                        type="button"
                        onClick={() => setLogoCoordinates("")}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/20 active:scale-[0.98] transition select-none"
                      >
                        Xóa
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isLoading || isProcessing}
                      onClick={() => {
                        setCropType("logo");
                        setIsCropOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 text-xs font-semibold hover:bg-white/[0.08] active:scale-[0.98] transition select-none"
                    >
                      Vẽ khung
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/40 border border-white/[0.06]">
                  <div>
                    <span className="block text-sm font-semibold text-slate-200">Đè phụ đề gốc</span>
                    <span className="text-xs text-slate-500 font-mono mt-0.5 block">
                      {subtitleMask ? `Đã chọn: ${subtitleMask}` : "Chưa chọn khung"}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {subtitleMask && (
                      <button
                        type="button"
                        onClick={() => setSubtitleMask("")}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/20 active:scale-[0.98] transition select-none"
                      >
                        Xóa
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isLoading || isProcessing}
                      onClick={() => {
                        setCropType("subtitle");
                        setIsCropOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 text-xs font-semibold hover:bg-white/[0.08] active:scale-[0.98] transition select-none"
                    >
                      Vẽ khung
                    </button>
                  </div>
                </div>
              </div>
              )}

              {/* Audio mode selector */}
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-3">
                  Chế độ âm thanh
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AUDIO_MODES.map((mode) => (
                    <AudioModeOption
                      key={mode.value}
                      mode={mode}
                      checked={audioMode === mode.value}
                      disabled={isLoading || isProcessing}
                      onSelect={handleModeChange}
                    />
                  ))}
                </div>
              </div>

              {/* Voice Selection */}
              {(audioMode === "dub" || audioMode === "mix") && (
                <div className="space-y-2">
                  <label
                    htmlFor="voice-select"
                    className="block text-sm font-semibold text-zinc-300 mb-3"
                  >
                    Giọng đọc bản ngữ ({targetLanguage})
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(LANGUAGE_VOICE_MAP[targetLanguage] || LANGUAGE_VOICE_MAP["Tiếng Việt"]).map((opt) => {
                      const checked = voice === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={isLoading || isProcessing}
                          onClick={() => setVoice(opt.value)}
                          className={[
                            "relative text-left rounded-xl border p-3 transition select-none",
                            "active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed",
                            checked
                              ? "border-indigo-400 bg-indigo-500/10 ring-1 ring-indigo-400/30 shadow-[0_8px_30px_-12px_rgba(99,102,241,0.4)]"
                              : "border-white/[0.06] bg-slate-950/40 hover:border-white/[0.12] hover:bg-white/[0.03]",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-100">
                              {opt.label}
                            </span>
                            <span
                              className={[
                                "h-4 w-4 rounded-full border flex items-center justify-center",
                                checked
                                  ? "border-indigo-400 bg-indigo-500"
                                  : "border-slate-600 bg-transparent",
                              ].join(" ")}
                              aria-hidden="true"
                            >
                              {checked && (
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              )}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                            {opt.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Target Language Selection */}
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-2">
                  Ngôn ngữ đích (Dịch & Lồng tiếng)
                </label>
                <select
                  value={targetLanguage}
                  onChange={(e) => {
                    const newLang = e.target.value;
                    setTargetLanguage(newLang);
                    const opts = LANGUAGE_VOICE_MAP[newLang] || LANGUAGE_VOICE_MAP["Tiếng Việt"];
                    setVoice(opts[0].value);
                  }}
                  disabled={isLoading || isProcessing}
                  className="w-full rounded-xl border border-white/[0.1] bg-slate-950/60 text-slate-100 p-3 text-sm font-medium focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30 transition cursor-pointer"
                >
                  <option value="Tiếng Việt">🇻🇳 Tiếng Việt (Vietnamese)</option>
                  <option value="English">🇺🇸 English (Tiếng Anh)</option>
                  <option value="日本語">🇯🇵 日本語 (Tiếng Nhật)</option>
                  <option value="한국어">🇰🇷 한국어 (Tiếng Hàn)</option>
                  <option value="Español">🇪🇸 Español (Tiếng Tây Ban Nha)</option>
                  <option value="Français">🇫🇷 Français (Tiếng Pháp)</option>
                  <option value="Deutsch">🇩🇪 Deutsch (Tiếng Đức)</option>
                  <option value="中文">🇨🇳 中文 (Tiếng Trung)</option>
                </select>
              </div>

              {/* Submit Action */}
              {!isProcessing && (() => {
                // Compute "is this button allowed to start the submit"
                // here so it stays co-located with the rendering, but
                // we keep the breakdown above as the user-visible
                // source of truth.
                const previewFailedBalance =
                  costPreview && costPreview.sufficient === false;
                const isDisabled =
                  isLoading ||
                  previewFailedBalance ||
                  costPreviewLoading;
                return (
                  <>
                    <button
                      type="submit"
                      disabled={isDisabled}
                      title={
                        previewFailedBalance
                          ? "Bạn không đủ credit. Vui lòng nạp thêm trước khi bắt đầu."
                          : costPreviewLoading
                          ? "Đang tính chi phí..."
                          : undefined
                      }
                      onClick={(e) => {
                        // Click on a disabled button is a no-op for
                        // most browsers, but the safety-net path is
                        // to flip the warning dialog open if the
                        // user clicks anyway (e.g. via Enter key).
                        if (previewFailedBalance) {
                          e.preventDefault();
                          setShowCreditWarning(true);
                        }
                      }}
                      className={
                        "w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-4 text-base font-semibold text-white shadow-[0_18px_60px_-18px_rgba(244,63,94,0.55)] active:scale-[0.98] transition select-none " +
                        (previewFailedBalance
                          ? "bg-rose-500/80 hover:bg-rose-500 border border-rose-400/50"
                          : "bg-emerald-400 hover:bg-emerald-300 text-slate-950")
                      }
                    >
                      {isLoading || costPreviewLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>{costPreviewLoading && !isLoading ? "Đang tính chi phí..." : "Đang phân tích..."}</span>
                        </>
                      ) : previewFailedBalance ? (
                        <>
                          <AlertCircle className="w-5 h-5" />
                          <span>Không đủ credit để bắt đầu</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-5 h-5" />
                          <span>Bắt đầu xử lý video</span>
                        </>
                      )}
                    </button>
                    {previewFailedBalance && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreditWarning(true);
                        }}
                        className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-rose-100 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition"
                      >
                        Nạp thêm {Math.round(costPreview.missingCredits).toLocaleString("vi-VN")} credit ngay
                      </button>
                    )}
                  </>
                );
              })()}

              {/* Error */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-4 rounded-xl bg-rose-950/30 border border-rose-900/40 text-rose-200"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
                  <div className="text-sm leading-normal">
                    <div className="font-semibold mb-0.5">Yêu cầu thất bại</div>
                    {error}
                  </div>
                </div>
              )}
            </form>
          </section>

          {/* Right Column: Visual Result / Preview */}
          <section className="lg:col-span-5 flex flex-col">
            {result ? (
              <ResultPanel
                result={result}
                isProcessing={isProcessing}
                progress={progress}
                targetLanguage={targetLanguage}
                videoReady={videoReady}
                videoError={videoError}
                videoSrc={videoSrc}
                placeholderMessage={placeholderMessage}
                onReset={handleReset}
                onVideoReady={() => setVideoReady(true)}
                onVideoError={() => setVideoError(true)}
                onDownload={handleDownload}
              />
            ) : (
              <div className="h-full min-h-[300px] border border-dashed border-white/[0.08] rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-white/[0.025] backdrop-blur-md select-none">
                <div className="w-12 h-12 rounded-xl bg-slate-950 ring-1 ring-white/[0.06] flex items-center justify-center text-slate-400 mb-4">
                  <Film className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Bản xem trước video</h3>
                <p className="text-xs text-slate-500 mt-1.5 max-w-[250px] mx-auto leading-relaxed font-medium">
                  Vui lòng nhập đường dẫn video bên trái để bắt đầu quá trình dịch và lồng tiếng.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Crop Modal */}
      {isCropOpen && (
        <WatermarkRemover
          videoSrc={url || ""}
          title={cropType === "logo" ? "Vẽ khung xóa Logo cứng" : "Vẽ khung đè phụ đề gốc"}
          description={
            cropType === "logo"
              ? "Kéo chuột để vẽ một ô vuông bao quanh Logo cứng. Hệ thống sẽ che Logo này bằng thuật toán FFmpeg delogo. Lưu ý: Bạn cần dùng đường dẫn video trực tiếp (ví dụ link đuôi .mp4) để tải được khung hình vẽ."
              : "Kéo chuột để vẽ một ô chữ nhật dài che phụ đề gốc. Hệ thống sẽ bôi mờ phụ đề cũ và đè phụ đề tiếng Việt mới lên trên. Lưu ý: Bạn cần dùng đường dẫn video trực tiếp (ví dụ link đuôi .mp4) để tải được khung hình vẽ."
          }
          onConfirm={(coords) => {
            if (cropType === "logo") {
              setLogoCoordinates(coords);
            } else {
              setSubtitleMask(coords);
            }
            setIsCropOpen(false);
          }}
          onCancel={() => setIsCropOpen(false)}
        />
      )}

      {/* Insufficient-credit warning popup.
          Triggered when the user tries to submit a render whose cost
          (computed by GET /preview-cost) exceeds their balance. The
          modal gives two actions:
            (1) Open the topup modal with the exact missing-credit
                amount pre-filled — the AppShell is listening for
                'vietcast:open-topup' on window, so we dispatch rather
                than thread a context through nested lazy chunks.
            (2) Dismiss + edit the URL. We deliberately do NOT auto-
                redirect because the user may have multiple tabs that
                started a draft simultaneously. */}
      {showCreditWarning && costPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="credit-warning-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreditWarning(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-rose-500/30 shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-300 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 id="credit-warning-title" className="text-base font-semibold text-rose-100">
                  Không đủ credit để xử lý video này
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Hệ thống sẽ không gửi video vào hàng đợi để tránh lãng phí tài nguyên engine.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreditWarning(false)}
                className="text-slate-500 hover:text-white p-1 -m-1"
                aria-label="Đóng"
              >
                <span className="sr-only">Đóng</span>
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </div>

            <div className="rounded-xl bg-slate-950 border border-white/[0.06] p-4 mb-4 text-sm space-y-2">
              {costPreview.estimatedMinutes && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Thời lượng ước tính:</span>
                  <span className="font-semibold text-zinc-200">~{costPreview.estimatedMinutes} phút</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Cần thanh toán:</span>
                <span className="font-semibold text-zinc-200">
                  {Math.round(costPreview.totalRequired).toLocaleString("vi-VN")} credit
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Hiện có:</span>
                <span className="font-semibold text-emerald-300">
                  {Math.round(costPreview.currentBalance).toLocaleString("vi-VN")} credit
                </span>
              </div>
              <div className="border-t border-white/[0.06] pt-2 flex justify-between">
                <span className="text-rose-200 font-semibold">Thiếu:</span>
                <span className="font-mono text-rose-200 font-bold">
                  {Math.round(costPreview.missingCredits).toLocaleString("vi-VN")} credit
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  // Open the global topup modal with the missing amount
                  // pre-filled. AppShell handles the event.
                  window.dispatchEvent(
                    new CustomEvent("vietcast:open-topup", {
                      detail: { prefillAmount: costPreview.missingCredits },
                    })
                  );
                  setShowCreditWarning(false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-sm font-semibold active:scale-[0.98] transition"
              >
                <Coins className="w-4 h-4" />
                <span>Nạp {Math.round(costPreview.missingCredits).toLocaleString("vi-VN")} credit ngay</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreditWarning(false)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold active:scale-[0.98] transition"
              >
                Đổi video khác
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components

const AudioModeOption = memo(function AudioModeOption({ mode, checked, disabled, onSelect }) {
  const Icon = mode.icon;
  return (
    <label
      className={`relative cursor-pointer rounded-xl border p-4 transition flex items-start gap-3 select-none ${
        checked
          ? "border-indigo-400 bg-indigo-500/10 shadow-[0_8px_30px_-12px_rgba(99,102,241,0.4)]"
          : "border-white/[0.06] bg-slate-950/40 hover:border-white/[0.12]"
      } ${disabled ? "opacity-40 pointer-events-none" : "active:scale-[0.98]"}`}
    >
      <input
        type="radio"
        name="audioMode"
        value={mode.value}
        checked={checked}
        onChange={() => onSelect(mode.value)}
        disabled={disabled}
        className="sr-only"
      />
      <div
        className={`shrink-0 mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center ${
          checked
            ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/30"
            : "bg-slate-950 text-slate-400 ring-1 ring-white/[0.08]"
        }`}
      >
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm text-slate-100">{mode.label}</span>
          <span
            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
              checked ? "border-indigo-400" : "border-slate-700"
            }`}
          >
            {checked && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1 leading-normal font-medium">{mode.description}</p>
      </div>
    </label>
  );
});

function useElapsedTime(submittedAt, isProcessing) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isProcessing || !submittedAt) {
      setElapsedSeconds(0);
      return;
    }
    const start = new Date(submittedAt).getTime();
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsedSeconds(diff);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [submittedAt, isProcessing]);

  if (!isProcessing || elapsedSeconds <= 0) return null;
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return `${mm}:${ss}`;
}

const ResultPanel = memo(function ResultPanel({
  result,
  isProcessing,
  progress,
  targetLanguage = "Tiếng Việt",
  videoReady,
  videoError,
  videoSrc,
  placeholderMessage,
  onReset,
  onVideoReady,
  onVideoError,
  onDownload,
}) {
  const output = outputForMode(result.audioMode);
  const isCompleted = result.status === "COMPLETED";
  const isFailed = result.status === "FAILED";
  const missingExpectedOutput = isCompleted
    && ((output.video && !result.videoUrl) || (output.srt && !result.srtUrl));
  const elapsedText = useElapsedTime(result.submittedAt, isProcessing);

  return (
    <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] backdrop-blur-xl p-6 flex flex-col h-full justify-between">
      <div>
        <div className="flex items-start justify-between gap-3 mb-6 select-none">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              {result.audioMode === "subtitle" ? (
                <Subtitles className="w-4.5 h-4.5 text-emerald-400" />
              ) : (
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-200">
                {isCompleted ? "Tác vụ đã hoàn thành" : isFailed ? "Tác vụ thất bại" : "Tác vụ đang xử lý"}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                {output.label}
                {result.taskId ? (
                  <> · Task <span className="text-emerald-400">#{result.taskId}</span></>
                ) : (
                  <span className="text-indigo-300"> · Đang gửi yêu cầu…</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-slate-400 hover:text-white underline underline-offset-4 decoration-white/[0.08] transition"
          >
            Tạo task khác
          </button>
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="mb-6 select-none">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-1.5">
              <span>
                {progressLabel(result.audioMode, progress, result?.targetLanguage || targetLanguage || "Tiếng Việt")}
              </span>
              <div className="flex items-center gap-2.5">
                {elapsedText && (
                  <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    ⏱️ {elapsedText}
                  </span>
                )}
                <span className="text-zinc-200">{progress}%</span>
              </div>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${progress}% hoàn thành`}
              className="bg-white/[0.04] h-1.5 w-full rounded-full overflow-hidden"
            >
              <div
                className="bg-indigo-500 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Output preview. Subtitle-only jobs intentionally do not show an
            empty video player because their product is the SRT file. */}
        {output.video ? (
          <div className="rounded-xl overflow-hidden bg-black border border-white/[0.06] aspect-video relative">
          {videoSrc && isCompleted ? (
            <>
              <video
                controls
                preload="metadata"
                poster=""
                src={videoSrc}
                onLoadedData={onVideoReady}
                onError={onVideoError}
                className={`w-full h-full object-contain ${videoReady ? "block" : "hidden"}`}
              />
              {!videoReady && !videoError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3 select-none">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-xs text-zinc-500 font-mono tracking-wider">ĐANG TẢI BẢN XEM TRƯỚC...</span>
                </div>
              )}
            </>
          ) : (
            <VideoPlaceholder message={placeholderMessage} />
          )}
          
          {videoError && result.videoUrl && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center">
              <AlertCircle className="w-6 h-6 text-yellow-400 mb-2" />
              <p className="text-sm text-zinc-355">Không thể phát trực tiếp video. Hãy thử tải về máy của bạn.</p>
            </div>
          )}
          </div>
        ) : (
          <div className="min-h-56 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] px-6 py-8 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-950 ring-1 ring-emerald-400/25 flex items-center justify-center">
              {isProcessing ? (
                <Loader2 className="w-6 h-6 animate-spin text-emerald-300" />
              ) : (
                <Subtitles className="w-6 h-6 text-emerald-300" />
              )}
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">
              {isCompleted ? "File phụ đề đã sẵn sàng" : isFailed ? "Không tạo được phụ đề" : "Đang tạo phụ đề tiếng Việt"}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
              {isCompleted
                ? "Tác vụ này chỉ xuất SRT nên không có video xem trước. Bạn có thể tải file và ghép vào trình phát hoặc phần mềm dựng phim."
                : isFailed
                ? "Credit đã trừ sẽ được hoàn theo chính sách tác vụ thất bại."
                : "Hệ thống đang nhận dạng, dịch và đóng gói file SRT; không chạy bước tạo giọng hay render video."}
            </p>
          </div>
        )}
      </div>

      {/* Action Actions */}
      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-white/[0.06] select-none text-sm">
          <span className="text-slate-400 font-mono uppercase tracking-wider text-xs">Trạng thái:</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                result.status === "COMPLETED"
                  ? "bg-emerald-400"
                  : result.status === "FAILED"
                  ? "bg-red-400"
                  : "bg-amber-400 animate-pulse"
              }`}
            />
            <span className="font-semibold font-mono text-xs">
              {result.status === "COMPLETED" ? "HOÀN TẤT" : result.status === "FAILED" ? "THẤT BẠI" : "ĐANG CHẠY"}
            </span>
          </span>
        </div>

        {missingExpectedOutput && (
          <div role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3 text-xs text-amber-200">
            Tác vụ đã hoàn thành nhưng máy chủ chưa trả đủ file đầu ra. Hãy mở Lịch sử tác vụ và thử tải lại sau ít phút.
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5">
          {output.srt && result.srtUrl && isCompleted && (
            <button
              type="button"
              onClick={() => onDownload(result.taskId, "srt")}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4.5 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-slate-200 text-sm font-semibold active:scale-[0.98] transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tải phụ đề SRT</span>
            </button>
          )}
          {output.video && result.videoUrl && isCompleted && (
            <button
              type="button"
              onClick={() => onDownload(result.taskId, "video")}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4.5 py-3 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-sm font-semibold shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98] transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tải Video</span>
            </button>
          )}
        </div>

        {isCompleted && (
          <p className="mt-3 text-[11px] text-slate-400/80 text-center select-none font-sans">
            💡 Tệp kết quả (Video & SRT) được tự động lưu trữ trong <strong>7 ngày</strong> trên hệ thống. Hãy tải về máy cá nhân của bạn.
          </p>
        )}
      </div>

      {result.message && (
        <p className="mt-4 text-xs text-zinc-500 italic text-center select-none">{result.message}</p>
      )}
    </div>
  );
});

const VideoPlaceholder = memo(function VideoPlaceholder({ message = "Đang render video..." }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-950 p-4 text-center select-none">
      <Loader2 className="w-7 h-7 animate-spin text-indigo-400 mb-3" />
      <p className="text-sm font-semibold text-slate-200">{message}</p>
      <p className="text-xs text-slate-500 mt-1.5 font-medium">Kết quả sẽ hiển thị ngay khi pipeline hoàn thành.</p>
    </div>
  );
});
