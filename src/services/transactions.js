// ---------------------------------------------------------------------------
// services/transactions.js
//
// Thin client over the credit-usage ledger endpoint
// GET /api/v1/transactions. The backend already enforces ownership
// (only your own rows) — we just shape the call here.
//
// Transactions cover BOTH topups AND spend events (Translate / TTS /
// Video render / Refund / Admin grant). The "Lịch sử tiêu credit" page
// passes `type` to filter to spend events only.
//
// Mirrors the pattern of services/payment.js: thin axios wrappers,
// no ApiError wrapping (the axios response interceptor in
// utils/axiosInterceptor.js normalises errors).
// ---------------------------------------------------------------------------

import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;

/**
 * Known transaction types — mirror of `Transaction.Type` on the Java side.
 * Kept as a string union here so a future backend enum addition is
 * flagged by a 406/400 at request time rather than a silent null on the
 * page.
 */
export const TX_TYPE = Object.freeze({
  TOPUP: "TOPUP",
  TRANSLATE: "TRANSLATE",
  TTS: "TTS",
  VIDEO_RENDER: "VIDEO_RENDER",
  REFUND: "REFUND",
  ADMIN_GRANT: "ADMIN_GRANT",
});

/**
 * Page through the calling user's credit-usage ledger, newest first.
 *
 * @param {{
 *   type?: 'TOPUP' | 'TRANSLATE' | 'TTS' | 'VIDEO_RENDER' | 'REFUND' | 'ADMIN_GRANT',
 *   page?: number,
 *   size?: number,
 * }} [opts]
 * @returns {Promise<Array<{
 *   id: number,
 *   type: string,
 *   amount: number,
 *   creditAfter: number,
 *   reference: string | null,
 *   description: string | null,
 *   createdAt: string,
 * }>>}
 */
export async function listMyTransactions({ type, page = 0, size = 50 } = {}) {
  const params = { page, size };
  if (type) params.type = type;
  const { data } = await axios.get(`${API_BASE_URL}/api/v1/transactions`, {
    params,
  });
  return Array.isArray(data) ? data : [];
}
