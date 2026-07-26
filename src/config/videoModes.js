import { PRICING } from "./pricing";

/**
 * Frontend mirror of backend VideoModePolicy.
 *
 * Keep rendering decisions and instant price previews dependent on this
 * registry instead of scattering audio-mode string comparisons across pages.
 * The backend remains authoritative for the actual charge.
 */
export const VIDEO_MODE_POLICIES = Object.freeze({
  original: Object.freeze({
    id: "original",
    label: "Giữ tiếng gốc",
    resultLabel: "Video giữ tiếng gốc",
    output: "Video",
    video: true,
    srt: false,
    supportsVisualFilters: true,
    supportsHardsub: false,
    usesAiVoice: false,
    perMinuteRate: PRICING.originalPerMinute,
    minimumPrice: PRICING.basicMinimum,
    description: `${PRICING.originalPerMinute} credit/phút, tối thiểu ${PRICING.basicMinimum} credit.`,
  }),
  mute: Object.freeze({
    id: "mute",
    label: "Video câm",
    resultLabel: "Video không âm thanh",
    output: "Video không âm thanh",
    video: true,
    srt: false,
    supportsVisualFilters: true,
    supportsHardsub: false,
    usesAiVoice: false,
    perMinuteRate: PRICING.mutePerMinute,
    minimumPrice: PRICING.basicMinimum,
    description: `${PRICING.mutePerMinute} credit/phút, tối thiểu ${PRICING.basicMinimum} credit. Bỏ âm thanh.`,
  }),
  subtitle: Object.freeze({
    id: "subtitle",
    label: "Chỉ tạo phụ đề",
    resultLabel: "Phụ đề SRT tiếng Việt",
    output: "File SRT tiếng Việt",
    video: false,
    srt: true,
    supportsVisualFilters: false,
    supportsHardsub: false,
    usesAiVoice: false,
    perMinuteRate: PRICING.subtitlePerMinute,
    minimumPrice: PRICING.subtitlePerMinute,
    description: `${PRICING.subtitlePerMinute} credit/phút, tối thiểu ${PRICING.subtitlePerMinute} credit. Nhận file SRT.`,
  }),
  dub: Object.freeze({
    id: "dub",
    label: "Lồng tiếng AI",
    resultLabel: "Video lồng tiếng + SRT",
    output: "Video và SRT",
    video: true,
    srt: true,
    supportsVisualFilters: true,
    supportsHardsub: true,
    usesAiVoice: true,
    perMinuteRate: PRICING.dubPerMinute,
    minimumPrice: PRICING.dubPerMinute,
    description: `${PRICING.dubPerMinute} credit/phút, tối thiểu ${PRICING.dubPerMinute} credit. Giọng Việt bản ngữ truyền cảm và file SRT song ngữ.`,
  }),
  mix: Object.freeze({
    id: "mix",
    label: "Trộn âm thanh gốc & AI",
    resultLabel: "Video trộn âm + SRT",
    output: "Video và SRT",
    video: true,
    srt: true,
    supportsVisualFilters: true,
    supportsHardsub: true,
    usesAiVoice: true,
    perMinuteRate: PRICING.mixPerMinute,
    minimumPrice: PRICING.mixPerMinute,
    description: `${PRICING.mixPerMinute} credit/phút, tối thiểu ${PRICING.mixPerMinute} credit. Giữ 30% nhạc nền gốc và thêm 120% giọng AI.`,
  }),
});

export const PRIMARY_VIDEO_MODE_IDS = Object.freeze(["dub", "mix"]);
export const SECONDARY_VIDEO_MODE_IDS = Object.freeze([
  "original",
  "mute",
  "subtitle",
]);

export function getVideoModePolicy(mode) {
  return VIDEO_MODE_POLICIES[mode] ?? VIDEO_MODE_POLICIES.mix;
}
