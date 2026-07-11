import { useState } from "react";
import { useStartProcessing } from "../hooks/useStartProcessing";

/**
 * Example usage of useStartProcessing.
 * Drop this into a page (e.g. VideoDashboard) or call the hook directly.
 */
export default function ProcessingPanel() {
  const [link, setLink] = useState("");
  const { startProcessing, logs, isRunning, exitCode } = useStartProcessing();

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await startProcessing(link, { audioMode: "dub", verbose: true });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Dán link video (Douyin / TikTok / YouTube)"
          disabled={isRunning}
        />
        <button type="submit" disabled={isRunning || !link}>
          {isRunning ? "Đang xử lý..." : "Bắt đầu lồng tiếng"}
        </button>
      </form>

      {exitCode !== null && (
        <p>{exitCode === 0 ? "✅ Hoàn thành" : `❌ Lỗi (exit=${exitCode})`}</p>
      )}

      <pre>
        {logs.map((l, i) => (
          <div key={i} data-stream={l.stream}>
            [{l.stamp}] {l.text}
          </div>
        ))}
      </pre>
    </div>
  );
}