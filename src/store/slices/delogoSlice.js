import { createSlice } from "@reduxjs/toolkit";

export const DELOGO_PENDING_TASK_KEY = "vc_delogo_pending_task_id";

const createInitialState = () => ({
  selectedFile: null,
  videoObjectUrl: null,
  logoCoords: null,
  subMaskCoords: null,
  durationSeconds: 0,
  videoDimensions: { width: 0, height: 0 },
  isSubmitting: false,
  isUploading: false,
  uploadProgress: 0,
  uploadProgressMsg: "",
  error: null,
  taskInfo: {
    taskId: null,
    status: "IDLE",
    videoUrl: null,
  },
  notification: null,
});

const delogoSlice = createSlice({
  name: "delogo",
  initialState: createInitialState(),
  reducers: {
    setSelectedVideo: (state, action) => {
      state.selectedFile = action.payload.file;
      state.videoObjectUrl = action.payload.objectUrl;
      state.logoCoords = null;
      state.subMaskCoords = null;
      state.durationSeconds = 0;
      state.videoDimensions = { width: 0, height: 0 };
      state.error = null;
    },
    setLogoCoords: (state, action) => {
      state.logoCoords = action.payload;
    },
    setSubMaskCoords: (state, action) => {
      state.subMaskCoords = action.payload;
    },
    setVideoMetadata: (state, action) => {
      state.durationSeconds = action.payload.durationSeconds;
      state.videoDimensions = action.payload.videoDimensions;
    },
    beginDelogoSubmission: (state) => {
      state.isSubmitting = true;
      state.isUploading = true;
      state.uploadProgress = 0;
      state.uploadProgressMsg = "Đang chuẩn bị tải video...";
      state.error = null;
    },
    setDelogoUploadProgress: (state, action) => {
      if (typeof action.payload === "string") {
        state.uploadProgressMsg = action.payload;
        return;
      }
      state.uploadProgressMsg = action.payload?.message || "";
      if (Number.isFinite(action.payload?.progress)) {
        state.uploadProgress = Math.max(0, Math.min(100, action.payload.progress));
      }
      if (typeof action.payload?.isUploading === "boolean") {
        state.isUploading = action.payload.isUploading;
      }
    },
    setDelogoError: (state, action) => {
      state.error = action.payload || null;
    },
    setDelogoSubmissionStopped: (state) => {
      state.isSubmitting = false;
      state.isUploading = false;
      state.uploadProgress = 0;
      state.uploadProgressMsg = "";
    },
    setDelogoTaskProcessing: (state, action) => {
      state.taskInfo = {
        taskId: String(action.payload),
        status: "PROCESSING",
        videoUrl: null,
      };
      state.isSubmitting = true;
      state.isUploading = false;
      state.uploadProgress = 100;
      state.uploadProgressMsg = "";
      state.error = null;
    },
    resumeDelogoTask: (state, action) => {
      if (state.taskInfo.taskId) return;
      state.taskInfo = {
        taskId: String(action.payload),
        status: "PROCESSING",
        videoUrl: null,
      };
      state.isSubmitting = true;
      state.isUploading = false;
    },
    setDelogoTaskCompleted: (state, action) => {
      state.taskInfo = {
        taskId: String(action.payload.taskId),
        status: "COMPLETED",
        videoUrl: action.payload.videoUrl || null,
      };
      state.isSubmitting = false;
      state.isUploading = false;
      state.uploadProgressMsg = "";
      state.error = null;
      state.notification = {
        type: "success",
        title: "Video đã xử lý xong",
        message: "Video xóa logo của bạn đã sẵn sàng để tải xuống.",
      };
    },
    setDelogoTaskFailed: (state, action) => {
      state.taskInfo.status = "FAILED";
      state.isSubmitting = false;
      state.isUploading = false;
      state.uploadProgressMsg = "";
      state.error = action.payload;
      state.notification = {
        type: "error",
        title: "Chưa thể hoàn tất video",
        message: action.payload,
      };
    },
    dismissDelogoNotification: (state) => {
      state.notification = null;
    },
    resetDelogoState: () => createInitialState(),
  },
});

export const {
  setSelectedVideo,
  setLogoCoords,
  setSubMaskCoords,
  setVideoMetadata,
  beginDelogoSubmission,
  setDelogoUploadProgress,
  setDelogoError,
  setDelogoSubmissionStopped,
  setDelogoTaskProcessing,
  resumeDelogoTask,
  setDelogoTaskCompleted,
  setDelogoTaskFailed,
  dismissDelogoNotification,
  resetDelogoState,
} = delogoSlice.actions;

export default delogoSlice.reducer;
