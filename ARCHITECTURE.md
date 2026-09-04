# VietCast Frontend Architecture

The frontend uses feature pages over shared configuration and API adapters.

## Dependency direction

```text
Pages / components
    ↓
Mode and pricing policies + hooks
    ↓
API services / axios
    ↓
Backend
```

## Video mode policy

`src/config/videoModes.js` is the single frontend registry for:

- mode labels and descriptions;
- per-minute and minimum price used by instant previews;
- whether the result contains video and/or SRT;
- support for visual filters, hardsub and AI voice controls.

The backend remains authoritative for actual billing. Frontend values exist to
give immediate feedback while the debounced cost-preview API is pending.

When a mode changes, edit the registry first. Pages may provide icons or visual
badges, but must not recreate pricing/output maps.

## Main boundaries

- `pages/VideoDashboard.jsx`: submit/poll/result user flow.
- `pages/VideoHistory.jsx`: history and retry presentation.
- `services/`: HTTP adapters and response normalization.
- `store/`: durable client state.
- `config/pricing.js`: global numeric pricing constants.
- `config/videoModes.js`: per-mode Strategy registry.

## Video source boundary

`VideoDashboard` presents link and device-upload tabs but submits both through
the same processing contract. Device files use `services/videoUpload.js` to
request a short-lived upload ticket and stream directly from the browser to R2
with progress and cancellation. Only after the upload succeeds does the page
publish an active task and call `/api/v1/videos/process`, avoiding phantom
processing cards when a user closes the page during upload.
