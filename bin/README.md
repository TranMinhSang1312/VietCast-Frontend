# `bin/`

This folder holds the **PyInstaller-built worker** (`main.exe` on Windows,
`main.bin` on Linux/macOS) plus the **FFmpeg sidecar** (`ffmpeg.exe` /
`ffmpeg`).

electron-builder copies everything in this folder into the installer as
**`extraResources`** (see `package.json -> build.extraResources`). Files
end up at `<install-dir>/resources/bin/` for the user.

### Build the worker

```bash
# From the workspace root (one level above this folder):
build_exe.bat        # Windows: produces main.exe
```

Then drop ffmpeg.exe next to it:

```bash
copy public\ffmpeg.exe bin\ffmpeg.exe
```

### Why not `public/`?

`public/` is bundled into Vite's `dist/` and copied into the renderer
folder. Anything inside ends up in **app.asar**, which is a read-only
virtual filesystem and **cannot be spawned**. The worker binary must
live outside asar.

### Why not `assets/`?

Same reason. Files under `src/assets/` flow through Vite's build and end
up inlined into the JS bundle (or hashed in `dist/`). They are not
available to `child_process.spawn`.

### Path resolution in main.js

```js
const RESOURCE_BIN_DIR = isDev
  ? path.join(__dirname, '..', 'bin')
  : path.join(process.resourcesPath, 'bin');
```

- **dev**: `vietcast-frontend/bin/` (this folder).
- **prod**: `<install-dir>/resources/bin/` (unpacked by
  electron-builder's `extraResources` config).