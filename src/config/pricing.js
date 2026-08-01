export const PRICING = Object.freeze({
  creditToVnd: 1,
  maxMinutes: 90,
  originalPerMinute: 200,
  mutePerMinute: 200,
  basicMinimum: 500,
  subtitlePerMinute: 500,
  dubPerMinute: 1200,
  mixPerMinute: 1200,
  visualFilterPerMinute: 250,
});

export function formatCredits(value) {
  return `${Math.round(value).toLocaleString("vi-VN")} credit`;
}

export function creditsToVnd(value) {
  return Math.round((Number(value) || 0) * PRICING.creditToVnd);
}

export function formatVnd(value) {
  return `${creditsToVnd(value).toLocaleString("vi-VN")}\u0111`;
}

/**
 * Customer-facing processing estimate. This is a range rather than a
 * promise because download speed, queue depth and dialogue density vary.
 */
export function estimateProcessingTime(durationSeconds, mode, hardsub = false) {
  const sourceMinutes = Math.max(0, Number(durationSeconds) || 0) / 60;
  if (sourceMinutes <= 0) return null;

  const factors = {
    original: { low: 0.2, high: 0.5, setupLow: 1, setupHigh: 2 },
    mute: { low: 0.2, high: 0.5, setupLow: 1, setupHigh: 2 },
    subtitle: { low: 0.3, high: 0.65, setupLow: 1, setupHigh: 2 },
    dub: { low: 0.9, high: 1.5, setupLow: 2, setupHigh: 4 },
    mix: { low: 0.9, high: 1.5, setupLow: 2, setupHigh: 4 },
  };
  const selected = factors[mode] || factors.mix;
  const renderMultiplier = hardsub ? 1.1 : 1;
  const minMinutes = Math.max(
    1,
    Math.ceil((sourceMinutes * selected.low + selected.setupLow) * renderMultiplier),
  );
  const maxMinutes = Math.max(
    minMinutes + 1,
    Math.ceil((sourceMinutes * selected.high + selected.setupHigh) * renderMultiplier),
  );

  return {
    minMinutes,
    maxMinutes,
    label: `${minMinutes}\u2013${maxMinutes} ph\u00fat`,
  };
}

export function basicVideoPrice(durationSeconds) {
  const seconds = Math.max(0, Number(durationSeconds) || 0);
  return Math.max(
    PRICING.basicMinimum,
    Math.round((seconds / 60) * PRICING.mutePerMinute),
  );
}
