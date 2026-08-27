import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;

const ENDPOINTS = Object.freeze({
  publicStatus:     `${API_BASE_URL}/api/v1/system/status`,
  adminMaintenance: `${API_BASE_URL}/api/v1/admin/system/maintenance`,
});

/**
 * Public system status check.
 * Returns { maintenance: boolean, message: string, estimatedEndTime: string, updatedAt: string }
 */
export async function getSystemStatus() {
  const { data } = await axios.get(ENDPOINTS.publicStatus);
  return data;
}

/**
 * Admin: get detailed maintenance status.
 */
export async function getAdminMaintenanceStatus() {
  const { data } = await axios.get(ENDPOINTS.adminMaintenance);
  return data;
}

/**
 * Admin: toggle maintenance mode.
 * @param {Object} payload - { enabled: boolean, message?: string, estimatedEndTime?: string }
 */
export async function setAdminMaintenanceMode(payload) {
  const { data } = await axios.post(ENDPOINTS.adminMaintenance, payload);
  return data;
}
