export const PRICING = Object.freeze({
  creditToVnd: 1,
  maxMinutes: 90,
  originalPerMinute: 200,
  mutePerMinute: 200,
  basicMinimum: 500,
  subtitlePerMinute: 500,
  dubPerMinute: 800,
  mixPerMinute: 800,
  visualFilterPerMinute: 250,
});

export function formatCredits(value) {
  return `${Math.round(value).toLocaleString("vi-VN")} credit`;
}

export function basicVideoPrice(durationSeconds) {
  const seconds = Math.max(0, Number(durationSeconds) || 0);
  return Math.max(
    PRICING.basicMinimum,
    Math.round((seconds / 60) * PRICING.mutePerMinute),
  );
}
