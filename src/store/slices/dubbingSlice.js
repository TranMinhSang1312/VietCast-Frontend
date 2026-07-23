import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../../config";

export const PENDING_TASK_KEY = "vc_pending_task_id";

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------
const initialState = {
  formConfig: {
    url: "",
    audioMode: "mix",
    voice: "",
    targetLanguage: "Tiếng Việt",
    logoCoordinates: null,
  },
  taskInfo: {
    taskId: null,
    status: "IDLE", // Enum: IDLE | PROCESSING | COMPLETED | FAILED
    progress: 0,
    resultData: null,
    errorMessage: null,
  },
};

// ---------------------------------------------------------------------------
// Async Thunk — Recovery Mechanism
// ---------------------------------------------------------------------------
export const recoverPendingTask = createAsyncThunk(
  "dubbing/recoverPendingTask",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const pendingTaskId = localStorage.getItem(PENDING_TASK_KEY);
      if (!pendingTaskId) {
        return null;
      }

      const API_BASE_URL = API_BASE_URL_PROVIDER?.sync || "";
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/tasks/${pendingTaskId}`);

      const taskData = data?.task || data?.data || data;
      if (!taskData) {
        localStorage.removeItem(PENDING_TASK_KEY);
        dispatch(resetDubbingState());
        return null;
      }

      const status = (taskData.status || "").toUpperCase();

      // Hydrate formConfig if backend returned original configuration
      if (taskData.url || taskData.audioMode || taskData.voice || taskData.targetLanguage) {
        dispatch(
          setFormConfig({
            url: taskData.url || "",
            audioMode: taskData.audioMode || "mix",
            voice: taskData.voice || "",
            targetLanguage: taskData.targetLanguage || "Tiếng Việt",
            logoCoordinates: taskData.logoCoordinates || null,
          })
        );
      }

      if (status === "SUCCESS" || status === "COMPLETED") {
        const resultData = {
          videoUrl: taskData.resultUrl || taskData.videoUrl || null,
          srtUrl: taskData.srtUrl || null,
          duration: taskData.duration || null,
          ...(taskData.resultData || {}),
        };
        dispatch(setTaskCompleted(resultData));
        return resultData;
      }

      if (status === "FAILED" || status === "ERROR") {
        const errorMsg = taskData.errorMessage || taskData.message || "Đã xảy ra lỗi khi xử lý video.";
        dispatch(setTaskFailed(errorMsg));
        return rejectWithValue(errorMsg);
      }

      // Task is still running / processing / queued
      const progress = typeof taskData.progress === "number" ? taskData.progress : 0;
      dispatch(
        setTaskProcessing({
          taskId: pendingTaskId,
          progress,
        })
      );

      return taskData;
    } catch (error) {
      // If task no longer exists or backend 404s, wipe stale pending ID
      localStorage.removeItem(PENDING_TASK_KEY);
      dispatch(resetDubbingState());
      return rejectWithValue(error?.response?.data?.message || error.message);
    }
  }
);

// ---------------------------------------------------------------------------
// Slice Definition
// ---------------------------------------------------------------------------
const dubbingSlice = createSlice({
  name: "dubbing",
  initialState,
  reducers: {
    setFormConfig: (state, action) => {
      state.formConfig = {
        ...state.formConfig,
        ...action.payload,
      };
    },

    setTaskProcessing: (state, action) => {
      const payload = action.payload;
      const taskId = typeof payload === "object" ? payload.taskId : payload;
      const progress = typeof payload === "object" && typeof payload.progress === "number" ? payload.progress : 0;

      state.taskInfo.taskId = taskId;
      state.taskInfo.status = "PROCESSING";
      state.taskInfo.progress = progress;
      state.taskInfo.errorMessage = null;
      state.taskInfo.resultData = null;

      if (taskId) {
        localStorage.setItem(PENDING_TASK_KEY, taskId);
      }
    },

    updateProgress: (state, action) => {
      const newProgress = Number(action.payload);
      if (!isNaN(newProgress)) {
        state.taskInfo.progress = Math.min(100, Math.max(0, newProgress));
      }
    },

    setTaskCompleted: (state, action) => {
      state.taskInfo.status = "COMPLETED";
      state.taskInfo.progress = 100;
      state.taskInfo.resultData = action.payload || null;
      state.taskInfo.errorMessage = null;
      localStorage.removeItem(PENDING_TASK_KEY);
    },

    setTaskFailed: (state, action) => {
      state.taskInfo.status = "FAILED";
      state.taskInfo.errorMessage = action.payload || "Xử lý thất bại.";
      localStorage.removeItem(PENDING_TASK_KEY);
    },

    resetDubbingState: (state) => {
      state.formConfig = { ...initialState.formConfig };
      state.taskInfo = { ...initialState.taskInfo };
      localStorage.removeItem(PENDING_TASK_KEY);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(recoverPendingTask.pending, (state) => {
        // Option to flag loading during recovery if needed
      })
      .addCase(recoverPendingTask.fulfilled, (state, action) => {
        // Recovery successfully hydrated state via dispatch actions
      })
      .addCase(recoverPendingTask.rejected, (state, action) => {
        if (state.taskInfo.status === "PROCESSING") {
          state.taskInfo.status = "FAILED";
          state.taskInfo.errorMessage = action.payload || "Không thể khôi phục tiến trình cũ.";
        }
      });
  },
});

export const {
  setFormConfig,
  setTaskProcessing,
  updateProgress,
  setTaskCompleted,
  setTaskFailed,
  resetDubbingState,
} = dubbingSlice.actions;

export default dubbingSlice.reducer;
