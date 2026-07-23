import { useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  setFormConfig,
  setTaskProcessing,
  updateProgress,
  setTaskCompleted,
  setTaskFailed,
  resetDubbingState,
  recoverPendingTask as recoverPendingTaskThunk,
} from "../store/slices/dubbingSlice";

/**
 * Production-ready Custom Hook for managing Dubbing / Subbing video processing state.
 * Encapsulates Redux Toolkit selectors and dispatch actions cleanly.
 */
export function useDubbingState() {
  const dispatch = useDispatch();

  const formConfig = useSelector((state) => state.dubbing.formConfig);
  const taskInfo = useSelector((state) => state.dubbing.taskInfo);

  // Synchronous action dispatchers
  const updateFormConfig = useCallback(
    (config) => {
      dispatch(setFormConfig(config));
    },
    [dispatch]
  );

  const startProcessing = useCallback(
    (taskId) => {
      dispatch(setTaskProcessing(taskId));
    },
    [dispatch]
  );

  const setProgress = useCallback(
    (progress) => {
      dispatch(updateProgress(progress));
    },
    [dispatch]
  );

  const completeTask = useCallback(
    (resultData) => {
      dispatch(setTaskCompleted(resultData));
    },
    [dispatch]
  );

  const failTask = useCallback(
    (errorMessage) => {
      dispatch(setTaskFailed(errorMessage));
    },
    [dispatch]
  );

  const resetState = useCallback(() => {
    dispatch(resetDubbingState());
  }, [dispatch]);

  // Async Thunk action dispatcher (Recovery Mechanism)
  const recoverPendingTask = useCallback(() => {
    return dispatch(recoverPendingTaskThunk());
  }, [dispatch]);

  // Computed status flags
  const isIdle = taskInfo.status === "IDLE";
  const isProcessing = taskInfo.status === "PROCESSING";
  const isCompleted = taskInfo.status === "COMPLETED";
  const isFailed = taskInfo.status === "FAILED";

  return {
    // State clusters
    formConfig,
    taskInfo,

    // Convenience properties
    taskId: taskInfo.taskId,
    status: taskInfo.status,
    progress: taskInfo.progress,
    resultData: taskInfo.resultData,
    errorMessage: taskInfo.errorMessage,

    // Status flags
    isIdle,
    isProcessing,
    isCompleted,
    isFailed,

    // Dispatcher actions
    updateFormConfig,
    setFormConfig: updateFormConfig,
    startProcessing,
    setTaskProcessing: startProcessing,
    setProgress,
    updateProgress: setProgress,
    completeTask,
    setTaskCompleted: completeTask,
    failTask,
    setTaskFailed: failTask,
    resetState,
    resetDubbingState: resetState,
    recoverPendingTask,
  };
}

export default useDubbingState;
