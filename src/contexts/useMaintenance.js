import { useContext } from "react";
import MaintenanceContext from "./maintenanceContextStore";

export default function useMaintenance() {
  const context = useContext(MaintenanceContext);
  if (!context) {
    throw new Error("useMaintenance must be used within a MaintenanceProvider");
  }
  return context;
}
