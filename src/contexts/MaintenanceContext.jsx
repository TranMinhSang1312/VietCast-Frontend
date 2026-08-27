import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getSystemStatus } from "../services/system";

const MaintenanceContext = createContext(null);

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
    refreshStatus();
    // Poll status periodically (every 30s)
    const interval = setInterval(refreshStatus, 30000);
    return () => clearInterval(interval);
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

export function useMaintenance() {
  const ctx = useContext(MaintenanceContext);
  if (!ctx) {
    throw new Error("useMaintenance must be used within a MaintenanceProvider");
  }
  return ctx;
}
