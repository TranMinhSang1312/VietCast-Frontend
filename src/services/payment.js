// ---------------------------------------------------------------------------
// services/payment.js
//
// Thin PayOS payment API client. Mirrors the pattern of auth.js / history.js —
// each function returns the parsed JSON body of the successful response,
// never an axios wrapper, so callers can do:
//
//   const res = await paymentApi.createPaymentLink({ amount: 50000 });
//   window.location.href = res.checkoutUrl;
//
// Failures throw an `ApiError` (already normalised by the response
// interceptor in utils/axiosInterceptor.js).
//
// Rate math note:
//   The backend hardcodes 1 000 VND = 1 credit (see
//   `PaymentService.VND_PER_CREDIT` on the Java side). We mirror the
//   same ratio on the UI so the displayed value is honest at the
//   moment of selection. If pricing diverges, this constant and the
//   Java constant must move together.
// ---------------------------------------------------------------------------

import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;

/** 1 000 VND = 1 credit. Mirrors PaymentService.VND_PER_CREDIT. */
export const VND_PER_CREDIT = 1_000;

const ENDPOINTS = Object.freeze({
  create: `${API_BASE_URL}/api/v1/payment/create`,
  // /webhook is NOT callable from the browser — PayOS servers hit it.
  // Listed here only so grep-for-`/api/v1/payment` lands on this file.
  confirm: (orderCode) =>
    `${API_BASE_URL}/api/v1/payment/confirm/${encodeURIComponent(orderCode)}`,
});

/**
 * Create a PayOS checkout link for the authenticated user.
 *
 * @param {{ amount: number, description?: string }} body
 *   amount is in VND; the server converts to credits at VND_PER_CREDIT.
 * @returns {Promise<{
 *   orderCode: string,
 *   checkoutUrl: string,
 *   amount: number,
 *   creditAmount: number,
 *   expiresAt: string,
 * }>}
 */
export async function createPaymentLink({ amount, description }) {
  const { data } = await axios.post(ENDPOINTS.create, { amount, description });
  return data;
}

/**
 * Ask the backend to reconcile a PayOS order by its `orderCode`.
 * Used when the PayOS webhook never reached us (typical localhost dev:
 * PayOS servers cannot POST to a private IP).
 *
 * The backend asks PayOS for the authoritative status and credits the
 * user if PayOS says PAID. Safe to call repeatedly — idempotent.
 *
 * @param {string} orderCode — numeric string PayOS assigned at create time.
 * @returns {Promise<{
 *   outcome: 'JUST_PAID' | 'ALREADY_TERMINAL' | 'STILL_PENDING' | 'UNKNOWN_ORDER',
 *   creditBalance: number,
 * }>}
 */
export async function confirmPayment(orderCode) {
  const { data } = await axios.post(ENDPOINTS.confirm(orderCode));
  return data;
}

/**
 * Page through the calling user's topup history (PaymentOrder rows),
 * newest first. Used by the "Lịch sử nạp credit" page.
 *
 * @param {{ page?: number, size?: number }} [opts]
 * @returns {Promise<Array<{
 *   orderCode: string,
 *   amountVnd: number,
 *   creditAmount: number,
 *   status: 'PENDING' | 'SUCCESS' | 'CANCELLED' | 'FAILED',
 *   createdAt: string,
 *   paidAt: string | null,
 * }>>}
 */
export async function listMyTopups({ page = 0, size = 50 } = {}) {
  const { data } = await axios.get(`${API_BASE_URL}/api/v1/payment/orders`, {
    params: { page, size },
  });
  return Array.isArray(data) ? data : [];
}

/**
 * Format a VND amount with the dot-thousands separator used across
 * the Vietnamese market (1.000.000 VND). Pure UI helper — lives here
 * (not in utils/format.js) because it is payment-specific.
 *
 * @param {number} vnd
 * @returns {string}
 */
export function formatVnd(vnd) {
  if (typeof vnd !== "number" || Number.isNaN(vnd)) return "0";
  return Math.round(vnd).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Convert VND → credit using the configured rate. Floors so a 9 999
 * VND payment does NOT round up to 10 credits — the user is
 * overcharged the surplus and we want to flag it instead of swallow.
 *
 * @param {number} vnd
 * @returns {number}
 */
export function vndToCredits(vnd) {
  return Math.floor(vnd / VND_PER_CREDIT);
}

export const PAYMENT_ENDPOINTS = ENDPOINTS;