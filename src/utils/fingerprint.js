/**
 * Generate a lightweight, native, and stable browser fingerprint hash.
 * Combines browser attributes, screen metrics, timezone, and basic canvas rendering
 * into an FNV-1a 32-bit hex hash.
 */
export function getBrowserFingerprint() {
  const parts = [
    navigator.userAgent || "",
    navigator.language || "",
    navigator.languages ? navigator.languages.join(",") : "",
    navigator.platform || "",
    new Date().getTimezoneOffset(),
    screen.width + "x" + screen.height + "x" + screen.colorDepth,
    navigator.hardwareConcurrency || "unknown"
  ];

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("VietCast,fingerprint 123", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("VietCast,fingerprint 123", 4, 17);
      parts.push(canvas.toDataURL());
    }
  } catch (e) {
    // Ignore canvas security errors (e.g. if blocked by browser extensions or anti-fingerprinting)
  }

  const str = parts.join("||");
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash ^ str.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(16);
}
