/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * Cloudflare Workers 入口（正式部署）
 * ============================================================================
 * 【為什麼後端要能跑在 Worker】
 *   1. 免費、永久、HTTPS 的固定網址 → PWA 的 Service Worker 才有效
 *   2. 沒有冷啟動（V8 isolate，不是容器）→ 決賽現場按下去就回應
 *   3. **牆鐘時間無限制** → 我們的 AI 呼叫要 8～12 秒，
 *      Vercel 免費方案預設 10 秒會直接超時
 *   4. 請求體上限 100 MB（Vercel 只有 4.5 MB）
 *
 * 【為什麼 OCR 不在這裡】
 *   Worker 免費方案每次請求只有 **10ms CPU 時間**，
 *   tesseract.js 的 OCR 要花好幾秒 CPU —— 不可能跑得動。
 *   這正是我們把 OCR 搬到瀏覽器的原因（見 src/ocr/ocrBrowser.ts）：
 *   照片在手機上讀完，Worker 只負責「文字 → AI」的代理。
 *
 * 【這個檔案只做三件事】
 *   1. 路由：把請求分派給 server/handlers.ts 的處理函式
 *   2. 靜態資源：其餘路徑交給 Workers Assets（前端 build 產物）
 *   3. CORS：讓 Capacitor 打包的 APK 能跨來源呼叫
 *   ⚠️ 商業邏輯請改 server/core.ts 與 server/handlers.ts。
 */

import {
  handleAiStatus,
  handleAnalyzeIndicators,
  handleAnalyzeLabel,
  handleAskHealthQuestion,
  handleHealth,
  handlePrivacy,
} from './server/handlers';
import type { ApiResult, CoreDeps } from './server/core';

/**
 * 平台相依能力。
 *
 * ⚠️ 這裡**刻意不提供** `recognizeImage`：
 *    Worker 沒有 tesseract.js 與 Node 的 fs／path／os。
 *    客戶端若送圖片（舊版），handler 會回 OCR_NOT_AVAILABLE，
 *    提示對方改用支援前端辨識的版本 —— 明確回報比默默失敗好。
 */
const deps: CoreDeps = {};

type Handler = (body: any, headers: Headers, deps: CoreDeps) => Promise<ApiResult>;

const ROUTES: Record<string, { handler: Handler; method: 'GET' | 'POST' }> = {
  '/api/analyze-label': { handler: handleAnalyzeLabel, method: 'POST' },
  '/api/analyze-indicators': { handler: handleAnalyzeIndicators, method: 'POST' },
  '/api/ask-health-question': { handler: handleAskHealthQuestion, method: 'POST' },
  '/api/privacy': { handler: handlePrivacy, method: 'GET' },
  '/api/ai-status': { handler: handleAiStatus, method: 'GET' },
  '/api/health': { handler: handleHealth, method: 'GET' },
};

/**
 * CORS。
 *
 * 【為什麼需要】前端與 API 同源時不需要，但 Capacitor 打包的 APK
 *   會從 `capacitor://localhost` 或 `http://localhost` 發出請求 ——
 *   那是不同的來源，沒有這些標頭會被瀏覽器擋下。
 *   這個 API 不使用 cookie 或憑證，所以 `*` 是安全的。
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Gemini-Key',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(result: ApiResult, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(result.json), {
    status: result.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extra },
  });
}

export interface Env {
  /** Workers Assets 綁定（前端 build 產物） */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  [key: string]: unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 預檢請求（APK 跨來源時會先送這個）
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const route = ROUTES[url.pathname];
    if (route) {
      if (request.method !== route.method) {
        return jsonResponse({
          status: 405,
          json: { error: 'METHOD_NOT_ALLOWED', message: `此端點只接受 ${route.method}。` },
        });
      }

      try {
        // GET 沒有 body；POST 才解析 JSON。
        // 解析失敗時給空物件，讓 handler 用既有的「未收到內容」邏輯回應，
        // 而不是讓整個請求以 500 收場。
        const body = route.method === 'POST' ? await request.json().catch(() => ({})) : {};
        const result = await route.handler(body as any, request.headers, deps);
        return jsonResponse(result);
      } catch (error) {
        console.error('[LabelBuddy AI] Worker 未預期的例外:', error);
        return jsonResponse({
          status: 500,
          json: { error: 'INTERNAL_ERROR', message: '系統忙碌中，請稍後再試一次。' },
        });
      }
    }

    // 其餘路徑交給靜態資源（前端）。
    // 找不到檔案時回 index.html，讓 SPA 的前端路由能運作。
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) return assetResponse;

      // SPA fallback：只對「看起來是頁面」的路徑做，不要對靜態檔案做，
      // 否則找不到的 .js/.png 會回一份 HTML，讓除錯變得很困惑。
      const looksLikeAsset = /\.[a-z0-9]+$/i.test(url.pathname);
      if (!looksLikeAsset) {
        const indexRequest = new Request(new URL('/', url.origin).toString(), request);
        return env.ASSETS.fetch(indexRequest);
      }
      return assetResponse;
    }

    return new Response('Not found', { status: 404 });
  },
};
