import { useEffect, useState } from "react";
import axios from "axios";
import { Check, Copy, Loader2, Subtitles, X } from "lucide-react";
import { API_BASE_URL_PROVIDER } from "../../config";

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Copy command was rejected");
}

export default function SubtitlePreviewDialog({ taskId, open, onClose }) {
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !taskId) return undefined;

    const controller = new AbortController();

    axios.get(
      API_BASE_URL + "/api/v1/videos/" + taskId + "/subtitle-content",
      { signal: controller.signal },
    ).then((response) => {
      setContent(response.data?.content || "");
      setFilename(response.data?.filename || ("phude_viet_" + taskId + ".srt"));
    }).catch((requestError) => {
      if (requestError.code === "ERR_CANCELED") return;
      const status = requestError.response?.status;
      setError(
        status === 410
          ? "T\u1EC7p ph\u1EE5 \u0111\u1EC1 \u0111\u00E3 h\u1EBFt h\u1EA1n l\u01B0u tr\u1EEF."
          : "Kh\u00F4ng th\u1EC3 m\u1EDF ph\u1EE5 \u0111\u1EC1 l\u00FAc n\u00E0y. Vui l\u00F2ng th\u1EED l\u1EA1i sau.",
      );
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => controller.abort();
  }, [open, taskId]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        fallbackCopy(content);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        fallbackCopy(content);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setError("Tr\u00ECnh duy\u1EC7t kh\u00F4ng cho ph\u00E9p sao ch\u00E9p. B\u1EA1n v\u1EABn c\u00F3 th\u1EC3 ch\u1ECDn n\u1ED9i dung th\u1EE7 c\u00F4ng.");
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="subtitle-preview-title"
        className="flex max-h-[88dvh] w-full max-w-3xl flex-col rounded-t-3xl border border-white/[0.08] bg-[#090d21] shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10">
              <Subtitles className="h-5 w-5 text-emerald-300" />
            </span>
            <div className="min-w-0">
              <h2 id="subtitle-preview-title" className="font-bold text-white">{"N\u1ED9i dung ph\u1EE5 \u0111\u1EC1"}</h2>
              <p className="truncate text-xs text-slate-400">{filename || "\u0110ang t\u1EA3i file SRT..."}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={"\u0110\u00F3ng xem ph\u1EE5 \u0111\u1EC1"}
            className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-300" />
              <span className="text-sm">{"\u0110ang m\u1EDF ph\u1EE5 \u0111\u1EC1..."}</span>
            </div>
          ) : error ? (
            <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200">
              {error}
            </div>
          ) : (
            <pre className="min-h-64 whitespace-pre-wrap break-words rounded-2xl border border-white/[0.06] bg-slate-950/70 p-4 font-mono text-[13px] leading-6 text-slate-200 sm:p-5">
              {content || "File ph\u1EE5 \u0111\u1EC1 kh\u00F4ng c\u00F3 n\u1ED9i dung."}
            </pre>
          )}
        </div>

        <footer className="flex items-center justify-end border-t border-white/[0.07] px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={handleCopy}
            disabled={loading || !content}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "\u0110\u00E3 sao ch\u00E9p" : "Sao ch\u00E9p n\u1ED9i dung"}
          </button>
        </footer>
      </section>
    </div>
  );
}
