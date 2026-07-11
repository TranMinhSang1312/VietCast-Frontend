const { contextBridge, ipcRenderer } = require('electron');

// ---------------------------------------------------------------------------
// Whitelist of IPC channels the renderer is allowed to talk to.
// Renderer code can ONLY invoke channels in this set — anything else is
// rejected by the preload bridge and never reaches the main process.
// ---------------------------------------------------------------------------
const INVOKE_CHANNELS = Object.freeze({
  RUN_WORKER: 'run-video',          // -> ipcMain.handle('run-video', ...)
  GET_WORKSPACE: 'get-workspace',
  GET_OUTPUT: 'get-output',
  GET_RUNTIME_CONFIG: 'get-runtime-config',
  REVEAL_IN_FOLDER: 'reveal-in-folder',
  RESOLVE_OUTPUT: 'resolve-output',
});

const ON_CHANNELS = Object.freeze({
  WORKER_STDOUT: 'worker:stdout',
  WORKER_STDERR: 'worker:stderr',
  WORKER_EXIT: 'worker:exit',
  PROGRESS: 'progress',
});

function invoke(channel, payload) {
  if (!Object.values(INVOKE_CHANNELS).includes(channel)) {
    return Promise.reject(new Error(`Channel "${channel}" is not allowed.`));
  }
  return ipcRenderer.invoke(channel, payload);
}

function on(channel, callback) {
  if (!Object.values(ON_CHANNELS).includes(channel)) {
    throw new Error(`Channel "${channel}" is not allowed.`);
  }
  // Strip the IpcRendererEvent so the renderer never sees native internals.
  const wrapped = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, wrapped);
  // Return an unsubscribe function so React effects can clean up.
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ---- Whitelisted IPC invokers ----
  runWorker:        (params) => invoke(INVOKE_CHANNELS.RUN_WORKER, params),
  getWorkspace:     () => invoke(INVOKE_CHANNELS.GET_WORKSPACE),
  getOutput:        () => invoke(INVOKE_CHANNELS.GET_OUTPUT),
  getRuntimeConfig: () => invoke(INVOKE_CHANNELS.GET_RUNTIME_CONFIG),
  revealInFolder:   (taskId) => invoke(INVOKE_CHANNELS.REVEAL_IN_FOLDER, taskId),
  resolveOutput:    (taskId) => invoke(INVOKE_CHANNELS.RESOLVE_OUTPUT, taskId),

  // ---- Whitelisted event subscribers (return unsubscribe fn) ----
  onWorkerStdout: (cb) => on(ON_CHANNELS.WORKER_STDOUT, cb),
  onWorkerStderr: (cb) => on(ON_CHANNELS.WORKER_STDERR, cb),
  onWorkerExit:   (cb) => on(ON_CHANNELS.WORKER_EXIT, cb),
  onProgress:     (cb) => on(ON_CHANNELS.PROGRESS, cb),
});