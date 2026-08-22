import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import axios from "axios";
import { Loader2, CheckCircle2, Download, AlertCircle, Film, Coins, Subtitles, ExternalLink, ScanText } from "lucide-react";
import { MagicWand, SlidersHorizontal, Microphone, SpeakerSimpleX, ClosedCaptioning } from "@phosphor-icons/react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL_PROVIDER } from "../config";
import { recordUsageLog } from "../services/history";
import { PRICING, estimateProcessingTime, formatVnd } from "../config/pricing";
import {
  getVideoModePolicy,
  PRIMARY_VIDEO_MODE_IDS,
  SECONDARY_VIDEO_MODE_IDS,
} from "../config/videoModes";
import { getPublicTaskFailureMessage } from "../utils/taskMessages";
import { openVideoInline } from "../utils/mobileVideo";
import SubtitlePreviewDialog from "../components/tasks/SubtitlePreviewDialog";
import {
  VIDEO_TASK_STORAGE_KEY,
  getPipelineProgress,
  getPipelineStageLabel,
  publishActiveVideoTask,
  sameTaskId,
} from "../utils/videoTaskProgress";

const MODE_ICONS = Object.freeze({
  dub: MagicWand,
  mix: SlidersHorizontal,
  original: Microphone,
  mute: SpeakerSimpleX,
  subtitle: ClosedCaptioning,
});

const MODE_HIGHLIGHTS = Object.freeze({
  dub: {
    badge: "🔥 KHUYÊN DÙNG",
    badgeColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  mix: {
    badge: "⭐ NỔI BẬT",
    badgeColor: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
});

function toModeOption(id, isPrimary) {
  const policy = getVideoModePolicy(id);
  return {
    ...policy,
    ...MODE_HIGHLIGHTS[id],
    value: policy.id,
    icon: MODE_ICONS[id],
    isPrimary,
  };
}

const PRIMARY_AUDIO_MODES = PRIMARY_VIDEO_MODE_IDS.map((id) =>
  toModeOption(id, true));
const SECONDARY_AUDIO_MODES = SECONDARY_VIDEO_MODE_IDS.map((id) =>
  toModeOption(id, false));

// Whitelist kept in sync with backend VideoRequest.@Pattern on `voice`.
// Dynamic voice mapping per target language
const LANGUAGE_VOICE_MAP = {
  "Tiếng Việt": [
    { value: "gcp:vi-VN-Neural2-A", label: "Google Neural2 Nữ ⚡", provider: "Google AI", description: "Giọng nữ Google Neural2 cao cấp, đọc mượt & chuẩn Studio" },
    { value: "gcp:vi-VN-Neural2-D", label: "Google Neural2 Nam ⚡", provider: "Google AI", description: "Giọng nam Google Neural2 cao cấp, trầm ấm" },
    { value: "gcp:vi-VN-Wavenet-A", label: "Google WaveNet Nữ", provider: "Google AI", description: "Giọng nữ Google WaveNet chuẩn" },
    { value: "gcp:vi-VN-Wavenet-B", label: "Google WaveNet Nam", provider: "Google AI", description: "Giọng nam Google WaveNet chuẩn" },
  ],
  "English": [],
  "日本語": [],
  "한국어": [],
  "Español": [],
  "Français": [],
  "Deutsch": [],
  "中文": [],
};

const TRANSLATION_STYLES = [
  { value: "default", label: "✨ Mặc định", description: "Bám sát nội dung gốc, chuẩn mực & tự nhiên" },
  { value: "review_phim", label: "🍿 Review Phim", description: "Kịch tính, lôi cuốn, giọng văn giật gân" },
  { value: "co_trang", label: "⚔️ Cổ Trang / Kiếm Hiệp", description: "Văn phong Hán Việt cổ kính, huynh đệ, nương tử" },
  { value: "gioi_tre", label: "🤡 Giới Trẻ / TikTok", description: "Hài hước, cà khịa, bắt trend sôi động" },
  { value: "tong_tai", label: "🌹 Tổng Tài / Ngôn Tình", description: "Ngọt ngào, kịch tính, sến sẩm" },
  { value: "tieu_lam", label: "🤣 Tiếu Lâm / Hài Bựa", description: "Đời thường, gây cười, bất ngờ" },
  { value: "triet_ly", label: "🕯️ Tâm Trạng / Triết Lý", description: "Sâu lắng, đồng cảm, chữa lành" },
];


function supportsVoicePreview(voiceValue) {
  return voiceValue.startsWith("gcp:");
}

async function getVoicePreviewErrorMessage(error) {
  const payload = error?.response?.data;
  if (payload instanceof Blob) {
    try {
      const body = JSON.parse(await payload.text());
      if (typeof body?.message === "string" && body.message.trim()) {
        return body.message;
      }
    } catch {
      // The provider error was not JSON; use the customer-safe fallback below.
    }
  }
  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  return "Không thể tải giọng mẫu. Vui lòng thử lại sau.";
}

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;
const ACTIVE_TASK_STORAGE_KEY = VIDEO_TASK_STORAGE_KEY;
const TASK_RECOVERY_LOOKBACK_MS = 10 * 60 * 1000;

function extractUrl(raw) {
  if (!raw || !raw.trim()) return null;
  const match = raw.trim().match(/https?:\/\/\S+/);
  if (match) {
    // Share captions from Douyin/TikTok often append sentence punctuation
    // directly after the URL. Keep a legitimate trailing path slash, but
    // remove characters that cannot be part of the shared link.
    return match[0].replace(/[)\]}>.,;!?，。；！？、"'`]+$/u, "");
  }
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
  const { user, syncProfile } = useAuth();

  const [url, setUrl] = useState(() => localStorage.getItem("vc_url") || "");
  const [audioMode, setAudioMode] = useState(() => localStorage.getItem("vc_audioMode") || "mix");
  const [voice, setVoice] = useState(() => localStorage.getItem("vc_voice") || "gcp:vi-VN-Neural2-A");
  const [targetLanguage, setTargetLanguage] = useState(() => {
    return localStorage.getItem("vc_targetLanguage") || "Tiếng Việt";
  });
  const [translationStyle, setTranslationStyle] = useState(() => {
    return localStorage.getItem("vc_translationStyle") || "default";
  });
  const voiceOptions = LANGUAGE_VOICE_MAP[targetLanguage] || LANGUAGE_VOICE_MAP["Tiếng Việt"];
  const selectedVoice = voiceOptions.some((option) => option.value === voice)
    ? voice
    : (voiceOptions[0]?.value || "");
  const [sourceLanguage, setSourceLanguage] = useState(() => {
    return localStorage.getItem("vc_sourceLanguage") || "auto";
  });
  const [hardsub, setHardsub] = useState(
    () => localStorage.getItem("vc_hardsub") === "true",
  );
  const [visualOcr, setVisualOcr] = useState(
    () => localStorage.getItem("vc_visualOcr") === "true",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState(null);
  const [voicePreviewError, setVoicePreviewError] = useState(null);
  const voiceAudioRef = useRef(null);
  const voicePreviewUrlRef = useRef(null);
  const voicePreviewRequestRef = useRef(0);

  const stopVoicePreview = useCallback(() => {
    voicePreviewRequestRef.current += 1;
    if (voiceAudioRef.current) {
      const audio = voiceAudioRef.current;
      voiceAudioRef.current = null;
      // Clearing an audio source can emit a browser `error` event. Detach the
      // handlers first so a normal playback completion is not shown as a
      // provider/playback failure.
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (voicePreviewUrlRef.current) {
      URL.revokeObjectURL(voicePreviewUrlRef.current);
      voicePreviewUrlRef.current = null;
    }
    setPreviewingVoice(null);
  }, []);

  const handlePlayVoicePreview = useCallback(async (voiceValue, e) => {
    if (e) e.stopPropagation();
    if (previewingVoice === voiceValue) {
      stopVoicePreview();
      return;
    }
    stopVoicePreview();
    const requestId = voicePreviewRequestRef.current;
    setPreviewingVoice(voiceValue);
    setVoicePreviewError(null);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v1/tts/preview`,
        {
          params: { voice: voiceValue },
          responseType: "blob",
          timeout: 30000,
        },
      );
      if (requestId !== voicePreviewRequestRef.current) return;
      if (!response.data || response.data.size === 0) {
        throw new Error("empty audio");
      }
      const audioSource = URL.createObjectURL(response.data);
      voicePreviewUrlRef.current = audioSource;
      const audio = new Audio(audioSource);
      voiceAudioRef.current = audio;
      audio.onended = stopVoicePreview;
      audio.onerror = () => {
        setVoicePreviewError("Không thể phát giọng mẫu trên trình duyệt này.");
        stopVoicePreview();
      };
      await audio.play();
    } catch (previewError) {
      if (requestId !== voicePreviewRequestRef.current) return;
      const message = await getVoicePreviewErrorMessage(previewError);
      stopVoicePreview();
      setVoicePreviewError(message);
    }
  }, [previewingVoice, stopVoicePreview]);

  useEffect(() => () => stopVoicePreview(), [stopVoicePreview]);

  useEffect(() => {
    localStorage.setItem("vc_hardsub", hardsub ? "true" : "false");
  }, [hardsub]);
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
    localStorage.setItem("vc_voice", selectedVoice);
  }, [selectedVoice]);

  useEffect(() => {
    localStorage.setItem("vc_targetLanguage", targetLanguage);
  }, [targetLanguage]);

  useEffect(() => {
    localStorage.setItem("vc_sourceLanguage", sourceLanguage);
  }, [sourceLanguage]);

  useEffect(() => {
    localStorage.setItem("vc_visualOcr", String(visualOcr));
  }, [visualOcr]);

  useEffect(() => {
    publishActiveVideoTask(result);
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
    publishActiveVideoTask(null);
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

  const handleUrlPaste = useCallback(
    (e) => {
      const pastedText = e.clipboardData?.getData("text") || "";
      const pastedUrl = extractUrl(pastedText);
      if (!pastedUrl) return;

      // Display the actual URL instead of leaving the full social share
      // caption in the field. The same clean value is used by preview-cost
      // and by the eventual /process submission.
      e.preventDefault();
      handleUrlChange({
        target: { value: normalizePreviewUrl(pastedUrl) },
      });
    },
    [handleUrlChange],
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
        const options = LANGUAGE_VOICE_MAP[targetLanguage] || LANGUAGE_VOICE_MAP["Tiếng Việt"];
        setVoice(options[0]?.value || "");
        setResult(null);
        setError(null);
        setVideoReady(false);
        setVideoError(false);
        setProgress(0);
        setCostPreview(null);
        setCostPreviewLoading(false);
        setShowCreditWarning(false);
        setVoicePreviewError(null);
        stopVoicePreview();
        clearPollInterval();
    }, [clearPollInterval, stopVoicePreview, targetLanguage]);

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
                setError("Không thể tải tệp lúc này. Vui lòng thử lại sau.");
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
function computeInstantCostPreview(durationSeconds, mode, userBalance, hardsubFlag = false) {
  const seconds = Math.max(0, Number(durationSeconds) || 0);
  const minutes = seconds / 60;
  const policy = getVideoModePolicy(mode);
  const baseCost = Math.max(
    policy.minimumPrice,
    Math.round(minutes * policy.perMinuteRate),
  );

  let hardsubCost = 0;
  if (hardsubFlag && policy.supportsHardsub) {
    hardsubCost = Math.max(60, Math.round(minutes * 60));
  }

  const estimatedCost = (baseCost + hardsubCost) || PRICING.dubPerMinute;
  const currentBalance = Number(userBalance) || 0;
  const sufficient = currentBalance >= estimatedCost;

  return {
    durationSeconds: seconds,
    totalRequired: estimatedCost,
    estimatedCost,
    currentBalance: currentBalance,
    userBalance: currentBalance,
    sufficient,
    missingCredits: sufficient ? 0 : Math.max(0, Math.round(estimatedCost - currentBalance)),
    audioMode: mode,
  };
}

  const lastPreviewUrlRef = useRef("");
  const cachedDurationRef = useRef(null);
  const previewRequestIdRef = useRef(0);

  // Debounced fetch of the cost preview whenever the URL or audioMode change.
  // Optimization: If the video duration is already probed for this URL,
  // mode switching (e.g. "dub" <-> "mix" or "subtitle") instantly recalculates cost
  // client-side without making redundant preview-cost API calls to the server.
  useEffect(() => {
    const requestId = ++previewRequestIdRef.current;

    // If a task is active, processing, or completed (result is present),
    // do NOT fetch or compute cost preview to avoid confusing the user.
    if (result) {
      const handle = setTimeout(() => {
        if (requestId !== previewRequestIdRef.current) return;
        setCostPreview(null);
        setCostPreviewLoading(false);
        lastPreviewUrlRef.current = "";
        cachedDurationRef.current = null;
      }, 0);
      return () => clearTimeout(handle);
    }

    const cleanUrl = extractUrl(url);
    if (!cleanUrl) {
      const handle = setTimeout(() => {
        if (requestId !== previewRequestIdRef.current) return;
        setCostPreview(null);
        setCostPreviewLoading(false);
        lastPreviewUrlRef.current = "";
        cachedDurationRef.current = null;
      }, 0);
      return () => clearTimeout(handle);
    }

    const canonical = normalizePreviewUrl(cleanUrl);
    const userBalance = (Number(user?.creditBalance) || 0) + (Number(user?.bonusCreditBalance) || 0);

    if (canonical === lastPreviewUrlRef.current && cachedDurationRef.current !== null) {
      const instantPreview = computeInstantCostPreview(
        cachedDurationRef.current,
        audioMode,
        userBalance,
        hardsub
      );
      const handle = setTimeout(() => {
        if (requestId !== previewRequestIdRef.current) return;
        setCostPreview(instantPreview);
        setCostPreviewLoading(false);
      }, 0);
      return () => clearTimeout(handle);
    }

    const controller = new AbortController();
    const handle = setTimeout(() => {
      setCostPreviewLoading(true);
      axios
        .get(`${API_BASE_URL}/api/v1/videos/preview-cost`, {
          params: {
            url: canonical,
            audioMode,
            hardsub,
          },
          signal: controller.signal,
          timeout: 30000,
        })
        .then((res) => {
          if (requestId !== previewRequestIdRef.current) return;
          setCostPreview(res.data);
          if (res.data?.durationSeconds) {
            lastPreviewUrlRef.current = canonical;
            cachedDurationRef.current = res.data.durationSeconds;
          }
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          if (requestId !== previewRequestIdRef.current) return;
          setCostPreview(null);
        })
        .finally(() => {
          if (requestId !== previewRequestIdRef.current) return;
          setCostPreviewLoading(false);
        });
    }, 600);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [url, audioMode, hardsub, user?.creditBalance, user?.bonusCreditBalance, result]);

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
          publishActiveVideoTask(recovered);
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

        publishActiveVideoTask(null);
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

      if ((audioMode === "dub" || audioMode === "mix") && !selectedVoice) {
        setError("Ngôn ngữ này chưa có giọng AI để lồng tiếng. Vui lòng chọn Tiếng Việt hoặc dùng chế độ chỉ tạo phụ đề.");
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
        sourceLanguage,
        targetLanguage,
        hardsub: (audioMode === "dub" || audioMode === "mix") ? hardsub : false,
        submittedAt: new Date().toISOString(),
      };
      publishActiveVideoTask(pendingSubmission);
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
            sourceLanguage,
            translationStyle,
            // Only forward a voice value when the user picked an
            // AI-dub mode; otherwise the engine skips TTS anyway.
            voice: (audioMode === "dub" || audioMode === "mix") && selectedVoice ? selectedVoice : null,
            hardsub: (audioMode === "dub" || audioMode === "mix") ? hardsub : false,
            visualOcr: (audioMode === "dub" || audioMode === "mix" || audioMode === "subtitle") ? visualOcr : false,
          },
          { headers: { "Content-Type": "application/json" }, timeout: 30000 }
        );
        const acceptedResult = {
          ...data,
          url: data.url ?? cleanUrl,
          audioMode: data.audioMode ?? audioMode,
          voice: data.voice ?? selectedVoice,
          sourceLanguage: data.sourceLanguage ?? sourceLanguage,
          targetLanguage: data.targetLanguage ?? targetLanguage,
          hardsub: data.hardsub ?? pendingSubmission.hardsub,
          visualOcr: data.visualOcr ?? visualOcr,
          submittedAt: pendingSubmission.submittedAt,
        };
        // Persist synchronously: if navigation unmounts this component before
        // React applies setResult, the next mount still has the real taskId.
        publishActiveVideoTask(acceptedResult);
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
              publishActiveVideoTask(recovered);
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
              "Số dư hiện tại chưa đủ để xử lý video này. Vui lòng nạp thêm hoặc chọn video ngắn hơn."
          );
        } else {
          console.error("[video-submit] Không thể khởi tạo tác vụ", err);
          setError("Chưa thể bắt đầu xử lý video lúc này. Vui lòng thử lại sau ít phút.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [
      url,
      audioMode,
      selectedVoice,
      costPreview,
      refreshUserCredit,
      resetResultState,
      sourceLanguage,
      targetLanguage,
      translationStyle,
      hardsub,
      syncProfile,
    ],
  );

  useEffect(() => {
    const onBackgroundStatus = (event) => {
      const next = event.detail;
      if (!next?.taskId) return;
      setResult((prev) => {
        if (prev?.taskId && !sameTaskId(prev.taskId, next.taskId)) return prev;
        return { ...prev, ...next };
      });
      if (next.status === "COMPLETED") setProgress(100);
      else if (next.status === "FAILED") setProgress(0);
      else if (typeof next.progress === "number") {
        setProgress((prev) => Math.max(prev, next.progress));
      }
      if (next.status === "COMPLETED" || next.status === "FAILED") {
        refreshUserCredit();
        setVideoError(false);
      }
    };
    window.addEventListener("vietcast:video-task-status", onBackgroundStatus);
    return () => window.removeEventListener("vietcast:video-task-status", onBackgroundStatus);
  }, [refreshUserCredit]);
  // Completed task data is persisted so users can leave this page without
  // losing their result. Artifact URLs are now deliberately short-lived,
  // however, so a URL restored from localStorage may already be expired (or
  // may predate the private-bucket rollout). Refresh it once from the
  // ownership-checked status endpoint whenever a completed task is mounted.
  useEffect(() => {
    if (!result?.taskId || result.status !== "COMPLETED") return undefined;

    const taskId = result.taskId;
    let cancelled = false;

    const refreshArtifactUrls = async () => {
      try {
        const { data } = await axios.get(
          `${API_BASE_URL}/api/v1/videos/status/${taskId}`,
          { timeout: 10000 }
        );
        if (cancelled || (data.taskId && data.taskId !== taskId)) return;

        setResult((prev) => {
          if (!prev || prev.taskId !== taskId) return prev;
          return {
            ...prev,
            status: data.status ?? prev.status,
            videoUrl: data.videoUrl ?? null,
            srtUrl: data.srtUrl ?? null,
            message: data.message ?? prev.message,
          };
        });
        setVideoError(false);
      } catch (err) {
        // Keep the existing task card available. The authenticated download
        // endpoint still obtains a fresh URL independently, and a later page
        // visit will retry this refresh.
        console.warn("[artifact-refresh] could not refresh signed URLs", err?.message || err);
      }
    };

    refreshArtifactUrls();
    return () => {
      cancelled = true;
    };
  }, [result?.taskId, result?.status]);

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
    // Every query parameter is part of an AWS SigV4 presigned request.
    // Appending our old cache-buster after signing invalidates the request
    // and R2 correctly returns 403.
    if (result.videoUrl.includes("X-Amz-Signature=")) return result.videoUrl;
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
    <div className="relative flex w-full flex-col items-center overflow-x-clip bg-slate-950 px-3 py-5 font-sans text-zinc-100 sm:px-4 sm:py-12">
      {/* Ambient backgrounds */}
      <div className="absolute top-[-20%] right-[-10%] w-[720px] h-[720px] bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-25%] left-[-15%] w-[520px] h-[520px] bg-violet-600/8 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-6xl z-10">
        {/* Workspace Layout */}
        <div className="grid grid-cols-1 items-start gap-4 sm:gap-8 lg:grid-cols-12">
          {/* Left Column: Form Controls */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 backdrop-blur-xl sm:rounded-3xl sm:p-8 lg:col-span-7">
            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6" noValidate>
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
                  onPaste={handleUrlPaste}
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
                {!result && costPreviewLoading && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang tính chi phí xử lý video...</span>
                  </div>
                )}
                {!result && !costPreviewLoading && costPreview && (() => {
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
                  const durationForEstimate = Number(costPreview.durationSeconds) || (Number(costPreview.estimatedMinutes) || 0) * 60;
                  const processingEta = estimateProcessingTime(durationForEstimate, audioMode, hardsub);
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
                        <div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.14em] opacity-65">Chi phí dự kiến</div>
                              <div className="mt-0.5 text-base font-bold tabular-nums">{formatVnd(costPreview.totalRequired)}</div>
                              <div className="mt-0.5 text-[11px] opacity-70">Video dài khoảng {Math.max(1, Math.ceil(durationForEstimate / 60))} phút</div>
                            </div>
                            <div className="rounded-md bg-black/10 px-2.5 py-2">
                              <div className="text-[10px] uppercase tracking-[0.14em] opacity-65">Thời gian xử lý</div>
                              <div className="mt-0.5 font-mono text-sm font-semibold">{processingEta?.label || "Đang ước tính"}</div>
                              <div className="mt-0.5 text-[10px] opacity-60">Có thể thay đổi theo hàng chờ và lượng lời thoại.</div>
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] opacity-75">
                            Số dư hiện có: <b>{formatVnd(costPreview.currentBalance)}</b> <span className="opacity-60">({Math.round(Number(costPreview.currentBalance) || 0).toLocaleString("vi-VN")} credit)</span>
                          </div>
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
                            Nạp thêm {formatVnd(costPreview.missingCredits)} ngay
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

              {/* Audio mode selector */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-zinc-300">
                  Chế độ âm thanh
                </label>

                {/* Row 1: Primary Featured Modes (Lồng tiếng AI & Trộn âm thanh Side-by-Side) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PRIMARY_AUDIO_MODES.map((mode) => (
                    <AudioModeOption
                      key={mode.value}
                      mode={mode}
                      checked={audioMode === mode.value}
                      disabled={isLoading || isProcessing}
                      onSelect={handleModeChange}
                    />
                  ))}
                </div>

                {/* Row 2: Secondary Modes (3 Columns) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {SECONDARY_AUDIO_MODES.map((mode) => (
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="voice-select"
                      className="block text-sm font-semibold text-zinc-300"
                    >
                      Giọng đọc AI ({targetLanguage})
                    </label>
                    {supportsVoicePreview(selectedVoice) && (
                      <button
                        type="button"
                        onClick={(e) => handlePlayVoicePreview(selectedVoice, e)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition border border-indigo-500/30 cursor-pointer shadow-sm active:scale-95"
                      >
                        {previewingVoice === selectedVoice ? "⏹️ Đang phát..." : "🔊 Nghe thử giọng đã chọn"}
                      </button>
                    )}
                  </div>

                  <select
                    id="voice-select"
                    value={selectedVoice}
                    onChange={(e) => {
                      setVoice(e.target.value);
                    }}
                    disabled={isLoading || isProcessing}
                    className="w-full rounded-xl border border-white/[0.1] bg-slate-950/60 text-slate-100 p-3 text-sm font-medium focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30 transition cursor-pointer"
                  >
                    {voiceOptions.length === 0 && (
                      <option value="">
                        Chưa có giọng AI cho ngôn ngữ này
                      </option>
                    )}
                    {voiceOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} ({opt.provider || "AI"}) — {opt.description}
                      </option>
                    ))}
                  </select>
                  {voicePreviewError && (
                    <p className="text-xs text-rose-300" role="alert">
                      {voicePreviewError}
                    </p>
                  )}
                </div>
              )}

              {/* Source Language Selection (Speed Optimization Tip) */}
              <div>
                <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label htmlFor="source-lang" className="block text-sm font-semibold text-zinc-300">
                    Ngôn ngữ gốc của Video (Đầu vào)
                  </label>
                  <span className="text-[11px] text-amber-400 font-semibold bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20 flex items-center gap-1">
                    ⚡ Giúp AI bóc tách nhanh hơn 20-30%
                  </span>
                </div>
                <select
                  id="source-lang"
                  value={sourceLanguage}
                  onChange={(e) => {
                    setSourceLanguage(e.target.value);
                  }}
                  disabled={isLoading || isProcessing}
                  className="w-full rounded-xl border border-white/[0.1] bg-slate-950/60 text-slate-100 p-3 text-sm font-medium focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30 transition cursor-pointer"
                >
                  <option value="auto">🌐 Tự động nhận diện (Mặc định)</option>
                  <option value="zh">🇨🇳 Tiếng Trung (Trung Quốc)</option>
                  <option value="en">🇺🇸 Tiếng Anh (English)</option>
                  <option value="ja">🇯🇵 Tiếng Nhật (Japanese)</option>
                  <option value="ko">🇰🇷 Tiếng Hàn (Korean)</option>
                  <option value="fr">🇫🇷 Tiếng Pháp (French)</option>
                  <option value="de">🇩🇪 Tiếng Đức (German)</option>
                  <option value="ru">🇷🇺 Tiếng Nga (Russian)</option>
                  <option value="es">🇪🇸 Tiếng Tây Ban Nha (Spanish)</option>
                </select>
                {sourceLanguage !== "auto" && (
                  <p className="mt-2 text-xs text-emerald-400/90 flex items-center gap-1.5 font-medium bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                    💡 Đã chọn <b>{sourceLanguage.toUpperCase()}</b>: AI sẽ bỏ qua bước quét đoán ngôn ngữ, giúp lồng tiếng nhanh hơn và chuẩn 100%!
                  </p>
                )}
              </div>

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

              {/* Translation Style Selection */}
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-2 flex items-center justify-between">
                  <span>Phong cách dịch AI</span>
                  <span className="text-xs text-indigo-400 font-normal">Sắc thái & Văn phong</span>
                </label>
                <select
                  value={translationStyle}
                  onChange={(e) => {
                    setTranslationStyle(e.target.value);
                    localStorage.setItem("vc_translationStyle", e.target.value);
                  }}
                  disabled={isLoading || isProcessing}
                  className="w-full rounded-xl border border-white/[0.1] bg-slate-950/60 text-slate-100 p-3 text-sm font-medium focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30 transition cursor-pointer"
                >
                  {TRANSLATION_STYLES.map((style) => (
                    <option key={style.value} value={style.value}>
                      {style.label} — {style.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hardsub Toggle Switch - Only applicable for AI Dubbing and Mix modes */}
              {(audioMode === "dub" || audioMode === "mix") && (
                <div className="rounded-xl border border-white/[0.08] bg-slate-950/40 p-4 transition hover:border-white/[0.14]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Subtitles className="h-4 w-4 text-indigo-400" />
                        <span className="text-sm font-semibold text-slate-100">
                          In phụ đề lên Video (Hardsub)
                        </span>
                        <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-400 border border-indigo-500/20">
                          +60đ/phút (tối thiểu 60đ)
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Chèn phụ đề đúng ngôn ngữ đích trực tiếp lên video. Cỡ chữ và lề được tự động tối ưu cho cả video ngang lẫn video dọc. Nếu tắt, video chỉ có âm thanh lồng tiếng AI.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={hardsub}
                      disabled={isLoading || isProcessing}
                      onClick={() => {
                        setHardsub(!hardsub);
                      }}
                      className={[
                        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50",
                        hardsub ? "bg-indigo-500" : "bg-slate-700",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          hardsub ? "translate-x-5" : "translate-x-0",
                        ].join(" ")}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Visual OCR Toggle Switch */}
              {(audioMode === "dub" || audioMode === "mix" || audioMode === "subtitle") && (
                <div className="rounded-xl border border-white/[0.08] bg-slate-950/40 p-4 transition hover:border-white/[0.14]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ScanText className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm font-semibold text-slate-100">
                          Nhận diện chữ trên màn hình (Google Vision OCR)
                        </span>
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                          Khuyên dùng cho Douyin / TikTok
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Sử dụng Google Vision OCR để nhận diện chính xác từng dòng phụ đề chữ Hán trên màn hình video (rất hữu ích cho video có thuật ngữ chuyên môn hoặc video không có tiếng nói rõ).
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={visualOcr}
                      disabled={isLoading || isProcessing}
                      onClick={() => {
                        setVisualOcr(!visualOcr);
                      }}
                      className={[
                        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50",
                        visualOcr ? "bg-emerald-500" : "bg-slate-700",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          visualOcr ? "translate-x-5" : "translate-x-0",
                        ].join(" ")}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Action */}
              {!isProcessing && (() => {
                // Compute "is this button allowed to start the submit"
                // here so it stays co-located with the rendering, but
                // we keep the breakdown above as the user-visible
                // source of truth.
                const previewFailedBalance =
                  costPreview && costPreview.sufficient === false;
                const voiceUnavailable =
                  (audioMode === "dub" || audioMode === "mix") && !selectedVoice;
                const isDisabled =
                  isLoading ||
                  previewFailedBalance ||
                  costPreviewLoading ||
                  voiceUnavailable;
                return (
                  <>
                    <button
                      type="submit"
                      disabled={isDisabled}
                      title={
                        previewFailedBalance
                          ? "Số dư chưa đủ. Vui lòng nạp thêm trước khi bắt đầu."
                          : voiceUnavailable
                          ? "Ngôn ngữ này chưa có giọng AI để lồng tiếng."
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
                        "w-full inline-flex items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-base font-bold transition-ultra cursor-pointer shadow-lg select-none hover-lift " +
                        (previewFailedBalance
                          ? "bg-rose-500/80 hover:bg-rose-500 text-white border border-rose-400/50 shadow-rose-500/20"
                          : isDisabled
                          ? "bg-slate-800 text-slate-400 opacity-50 cursor-not-allowed"
                          : "shimmer-btn bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 text-slate-950 shadow-[0_18px_50px_-15px_rgba(16,185,129,0.6)] hover:shadow-[0_22px_60px_-10px_rgba(16,185,129,0.8)] active:scale-[0.97]")
                      }
                    >
                      {isLoading || costPreviewLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>{costPreviewLoading && !isLoading ? "Đang tính chi phí..." : "Đang phân tích..."}</span>
                        </>
                      ) : voiceUnavailable ? (
                        <>
                          <AlertCircle className="w-5 h-5" />
                          <span>Chưa có giọng AI cho ngôn ngữ này</span>
                        </>
                      ) : previewFailedBalance ? (
                        <>
                          <AlertCircle className="w-5 h-5" />
                          <span>Số dư chưa đủ để bắt đầu</span>
                        </>
                      ) : (
                        <>
                          <MagicWand size={22} weight="fill" />
                          <span>{audioMode === "subtitle" ? "Bắt đầu tạo phụ đề" : audioMode === "original" ? "Bắt đầu tải video" : audioMode === "mute" ? "Bắt đầu tạo video câm" : "Bắt đầu xử lý video"}</span>
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
                        Nạp thêm {formatVnd(costPreview.missingCredits)} ngay
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
                videoReady={videoReady}
                videoError={videoError}
                videoSrc={videoSrc}
                placeholderMessage={placeholderMessage}
                onReset={handleReset}
                onVideoReady={() => setVideoReady(true)}
                onVideoError={() => setVideoError(true)}
                onVideoLoadStart={() => {
                  setVideoReady(false);
                  setVideoError(false);
                }}
                onDownload={handleDownload}
                onOpenVideo={() => openVideoInline(result.videoUrl)}
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
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
                  Số dư chưa đủ để xử lý video này
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Vui lòng nạp thêm đúng số tiền còn thiếu hoặc chọn video ngắn hơn.
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
                  {formatVnd(costPreview.totalRequired)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Hiện có:</span>
                <span className="font-semibold text-emerald-300">
                  {formatVnd(costPreview.currentBalance)}
                </span>
              </div>
              <div className="border-t border-white/[0.06] pt-2 flex justify-between">
                <span className="text-rose-200 font-semibold">Thiếu:</span>
                <span className="font-mono text-rose-200 font-bold">
                  {formatVnd(costPreview.missingCredits)}
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
                <span>Nạp {formatVnd(costPreview.missingCredits)} ngay</span>
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
  const isPrimary = mode.isPrimary;

  return (
    <label
      className={`relative cursor-pointer rounded-2xl border p-4 transition-ultra hover-lift flex items-start gap-3 select-none ${
        checked
          ? isPrimary
            ? "border-indigo-400/90 bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-indigo-950/50 shadow-[0_0_30px_-5px_rgba(99,102,241,0.45)] ring-1 ring-indigo-400/50 scale-[1.01]"
            : "border-indigo-400 bg-indigo-500/15 shadow-[0_8px_30px_-10px_rgba(99,102,241,0.45)] ring-1 ring-indigo-400/30 scale-[1.01]"
          : isPrimary
          ? "border-indigo-500/30 bg-slate-900/60 hover:border-indigo-400/60 hover:bg-white/[0.04] shadow-[0_4px_20px_-10px_rgba(99,102,241,0.2)]"
          : "border-white/[0.08] bg-slate-900/40 hover:border-white/[0.16] hover:bg-white/[0.03]"
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
        className={`shrink-0 mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center transition-ultra ${
          checked
            ? "bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 text-white shadow-lg shadow-indigo-500/40 scale-110"
            : isPrimary
            ? "bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30"
            : "bg-slate-950 text-slate-400 ring-1 ring-white/[0.1]"
        }`}
      >
        <Icon size={22} weight={checked ? "fill" : "duotone"} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`font-bold text-xs sm:text-sm ${checked ? "text-white" : "text-slate-100"}`}>
              {mode.label}
            </span>
            {mode.badge && (
              <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-full border tracking-wider uppercase ${mode.badgeColor}`}>
                {mode.badge}
              </span>
            )}
          </div>
          <span
            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-ultra ${
              checked ? "border-indigo-400 bg-indigo-500/30" : "border-slate-700"
            }`}
          >
            {checked && <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_2px_rgba(129,140,248,0.9)]" />}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed font-medium">{mode.description}</p>
      </div>
    </label>
  );
});

function useElapsedTime(submittedAt, isProcessing) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isProcessing || !submittedAt) return undefined;
    const start = new Date(submittedAt).getTime();
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsedSeconds(diff);
    };
    const initialTimer = setTimeout(update, 0);
    const timer = setInterval(update, 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
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
  videoReady,
  videoError,
  videoSrc,
  placeholderMessage,
  onReset,
  onVideoReady,
  onVideoError,
  onVideoLoadStart,
  onDownload,
  onOpenVideo,
}) {
  const modePolicy = getVideoModePolicy(result.audioMode);
  const output = {
    ...modePolicy,
    label: modePolicy.resultLabel,
  };
  const isCompleted = result.status === "COMPLETED";
  const isFailed = result.status === "FAILED";
  const missingExpectedOutput = isCompleted
    && ((output.video && !result.videoUrl) || (output.srt && !result.srtUrl));
  const elapsedText = useElapsedTime(result.submittedAt, isProcessing);
  const pipeline = getPipelineProgress({ ...result, progress });
  const stageLabel = getPipelineStageLabel({ ...result, progress });
  const [subtitlePreviewOpen, setSubtitlePreviewOpen] = useState(false);

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 backdrop-blur-xl sm:rounded-3xl sm:p-6">
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
                {stageLabel}
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
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {pipeline.steps.map((step, index) => {
                const completed = index < pipeline.completedCount;
                const active = index === pipeline.activeIndex;
                const tone = completed
                  ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                  : active
                    ? "border-indigo-400/25 bg-indigo-500/10 text-indigo-100"
                    : "border-white/[0.05] bg-white/[0.02] text-zinc-500";
                return (
                  <div
                    key={step.key}
                    className={"flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] transition-colors " + tone}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current/30 font-mono text-[10px]">
                      {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <span className="truncate">{step.label}</span>
                  </div>
                );
              })}
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
                key={videoSrc}
                controls
                playsInline
                preload="metadata"
                src={videoSrc}
                onLoadStart={onVideoLoadStart}
                onLoadedMetadata={onVideoReady}
                onCanPlay={onVideoReady}
                onLoadedData={onVideoReady}
                onError={onVideoError}
                className="block h-full w-full object-contain"
              />
              {!videoReady && !videoError && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 select-none">
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
              <p className="text-sm text-zinc-300">Trình phát nhúng không mở được video này.</p>
              <button
                type="button"
                onClick={onOpenVideo}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/15 active:scale-[0.98]"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Mở video trực tiếp</span>
              </button>
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

        {isFailed && (
          <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/[0.05] px-4 py-3 text-xs leading-relaxed text-rose-200">
            {getPublicTaskFailureMessage(result.message)}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5">
          {output.srt && result.srtUrl && isCompleted && (
            <div className="flex flex-1 gap-2.5">
              <button
                type="button"
                onClick={() => setSubtitlePreviewOpen(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-400/20 text-indigo-100 text-sm font-semibold active:scale-[0.98] transition cursor-pointer"
              >
                <Subtitles className="w-4 h-4" />
                <span>Xem phụ đề</span>
              </button>
              <button
                type="button"
                onClick={() => onDownload(result.taskId, "srt")}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-slate-200 text-sm font-semibold active:scale-[0.98] transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Tải SRT</span>
              </button>
            </div>
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
        {subtitlePreviewOpen && (
          <SubtitlePreviewDialog
            taskId={result.taskId}
            open
            onClose={() => setSubtitlePreviewOpen(false)}
          />
        )}
      </div>

    </div>
  );
});

const VideoPlaceholder = memo(function VideoPlaceholder({ message = "Đang render video..." }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-950 p-4 text-center select-none">
      <Loader2 className="w-7 h-7 animate-spin text-indigo-400 mb-3" />
      <p className="text-sm font-semibold text-slate-200">{message}</p>
      <p className="text-xs text-slate-500 mt-1.5 font-medium">Kết quả sẽ hiển thị ngay khi xử lý hoàn tất.</p>
    </div>
  );
});
