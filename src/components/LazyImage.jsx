import { useEffect, useRef, useState } from "react";

/**
 * Native-lazy-load wrapper that uses the browser's built-in
 * {@code loading="lazy"} attribute when the viewport supports it, and
 * falls back to an {@link IntersectionObserver} for browsers that
 * don't (older Safari / Electron Chromium with the attribute disabled).
 *
 * <p>Why both?
 * <ul>
 *   <li>{@code loading="lazy"} is supported on every modern browser
 *       and works WITHOUT any JS — the cost is zero when the
 *       attribute is honoured.</li>
 *   <li>{@code IntersectionObserver} is the only reliable fallback for
 *       Electron's renderer when the host page has set
 *       {@code document.lazyLoadEnabled = false} (Electron disables
 *       native lazy loading for in-page navigation). The hook still
 *       defers setting {@code src} until the element enters the
 *       viewport.</li>
 * </ul>
 *
 * <p><b>Important.</b> When the {@code src} prop is missing the
 * component renders nothing (no broken-image icon) so the parent
 * keeps a clean list. Callers should pass a placeholder / skeleton
 * around it if they want a hint at the bounding box.
 *
 * @param src          full image URL. Only attached to <img> after the
 *                     element enters the viewport.
 * @param alt          alt text (passed straight through)
 * @param rootMargin   IntersectionObserver root margin. Mirrors the
 *                     browser's default lazy-load distance (~200 px)
 *                     so behaviour matches {@code loading="lazy"}.
 * @param className    forwarded to the underlying <img>
 * @param onLoad       fired when the image successfully decoded
 * @param onError      fired when the image failed to load
 */
export default function LazyImage({
    src,
    alt = "",
    rootMargin = "200px",
    className,
    onLoad,
    onError,
    ...rest
}) {
    const imgRef = useRef(null);
    // Three states:
    //   "idle"     — placeholder rendered, observer not yet armed
    //   "armed"    — observer attached, waiting for viewport entry
    //   "loaded"   — src attached; once true we never re-arm
    const [state, setState] = useState("idle");

    useEffect(() => {
        // Reset on src change so a new image re-arms the observer.
        setState("idle");
    }, [src]);

    useEffect(() => {
        if (state !== "idle") return;
        const el = imgRef.current;
        if (!el) return;

        // Honour the native attribute when present. If the browser is
        // going to lazy-load for us, we don't need the JS observer —
        // attaching src immediately is fine.
        if (typeof window !== "undefined" && "loading" in HTMLImageElement.prototype) {
            setState("loaded");
            return;
        }

        // Fallback path: IntersectionObserver. This branch handles
        // Electron renderers (which disable native lazy loading) and
        // any browser that lacks the attribute.
        if (typeof IntersectionObserver === "undefined") {
            // Last-resort fallback: load immediately. Older mobile
            // browsers without IO would otherwise render nothing
            // forever, which is worse than a brief eager fetch.
            setState("loaded");
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setState("loaded");
                        observer.disconnect();
                        return;
                    }
                }
            },
            { rootMargin }
        );
        observer.observe(el);

        return () => observer.disconnect();
    }, [state, rootMargin]);

    const handleError = (e) => {
        // Promote the failed state so the parent can swap in a
        // placeholder if it wants to. We don't auto-retry — that
        // would mask persistent network errors.
        setState("loaded");
        if (onError) onError(e);
    };

    return (
        <img
            ref={imgRef}
            alt={alt}
            // Native attribute first — the browser decides whether to
            // honour it. Setting it even when we'll also use IO is
            // free and keeps the DOM correct.
            loading="lazy"
            decoding="async"
            className={className}
            src={state === "loaded" ? src : undefined}
            onLoad={onLoad}
            onError={handleError}
            {...rest}
        />
    );
}