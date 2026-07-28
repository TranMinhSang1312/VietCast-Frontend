const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile/i;

export function shouldOpenVideoInline() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const isTouchMac = /Macintosh/i.test(navigator.userAgent)
    && navigator.maxTouchPoints > 1;
  const hasMobileUserAgent = MOBILE_USER_AGENT.test(navigator.userAgent)
    || isTouchMac;
  const hasMobileViewport = window.matchMedia?.("(max-width: 767px)").matches;
  const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches;

  return hasMobileUserAgent || Boolean(hasMobileViewport && hasCoarsePointer);
}

export function openVideoInline(videoUrl) {
  if (!videoUrl || typeof document === "undefined") return false;

  const link = document.createElement("a");
  link.href = videoUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}
