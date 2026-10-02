/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * API 基底網址（2026-10-01）
 * ============================================================================
 *
 * 【為什麼需要這個】
 *   本專案有兩種執行環境，而它們的「相對路徑」指向完全不同的地方：
 *
 *     ① 網頁版（部署在 Cloudflare Worker）
 *        origin = `https://app.labelbuddy-ai.workers.dev`
 *        → `fetch('/api/...')` 正確打到同一個 Worker ✅
 *
 *     ② Capacitor 打包的 APK
 *        WebView 的 origin = `https://localhost`（Capacitor 的本地伺服器）
 *        → `fetch('/api/...')` 會打到 **localhost** → 連不上 ❌
 *
 *   所以 APK 裡必須用**絕對網址**。
 *
 * 【為什麼不在建置時用環境變數就好】
 *   那樣得為「網頁版」與「APK 版」各跑一次不同的 build，
 *   很容易出現「忘了用對的參數打包」而產生一個連不上 API 的 APK。
 *   改成**執行時偵測**：偵測到 Capacitor 就自動用絕對網址，
 *   同一份建置產物兩種環境都能用。
 *
 * 【CORS】
 *   Worker 已設 `Access-Control-Allow-Origin: *`（見 `worker.ts` 的 CORS_HEADERS），
 *   所以從 `https://localhost` 跨來源呼叫是允許的。
 */

/** 部署好的 Worker 網址。改網域時只要改這一行。 */
export const PRODUCTION_API_ORIGIN = 'https://app.labelbuddy-ai.workers.dev';

/**
 * 目前應該用哪個 API 基底。
 *
 * - 回傳空字串 → 用相對路徑（網頁版）
 * - 回傳完整 origin → 用絕對網址（APK 版）
 */
export function getApiBase(): string {
  // 建置時明確指定優先（例如本機測試指向別的 Worker）
  const fromEnv = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, '');
  }

  // 執行時偵測 Capacitor（APK／iOS App）
  const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return PRODUCTION_API_ORIGIN;
  }

  return '';
}

/**
 * 把 `/api/xxx` 轉成目前環境可用的完整網址。
 *
 * ⚠️ 所有 API 呼叫都應該走這支，不要直接寫 `fetch('/api/...')` ——
 *    否則打包成 APK 之後會**靜默連不上**（瀏覽器只會給一個網路錯誤，
 *    看起來像「伺服器壞了」，而不是「網址錯了」）。
 */
export function apiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
