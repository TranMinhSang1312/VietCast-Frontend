import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

const BASE = `${API_BASE_URL_PROVIDER.sync}/api/v1/referrals`;

export async function getReferralDashboard() {
  const { data } = await axios.get(`${BASE}/me`);
  return data;
}

export async function applyReferralCode(code) {
  const { data } = await axios.post(`${BASE}/apply`, { code: code.trim() });
  return data;
}
