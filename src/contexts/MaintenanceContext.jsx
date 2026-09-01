import { useState, useEffect, useCallback } from "react";
import { getSystemStatus } from "../services/system";
import MaintenanceContext from "./maintenanceContextStore";

export function MaintenanceProvider({ children }) {
  const [maintenanceInfo, setMaintenanceInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await getSystemStatus();
      setMaintenanceInfo(data);
      return data;
    } catch (err) {
      console.warn("[maintenance] Error checking status:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialPoll = window.setTimeout(refreshStatus, 0);
    // Poll status periodically (every 30s)
    const interval = setInterval(refreshStatus, 30000);
    return () => {
      window.clearTimeout(initialPoll);
      clearInterval(interval);
    };
  }, [refreshStatus]);

  const value = {
    isMaintenance: Boolean(maintenanceInfo?.maintenance),
    maintenanceInfo,
    isLoading,
    refreshStatus,
    setMaintenanceInfo,
  };

  return (
    <MaintenanceContext.Provider value={value}>
      {children}
    </MaintenanceContext.Provider>
  );
}
