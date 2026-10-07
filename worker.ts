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
  handleQuizBank,
  handleQuizQuestion,
} from './server/handlers';
import { handleFitnessReport } from './server/fitnessReport';
import type { ApiResult, CoreDeps } from './server/core';
import { makeQuizBankStore, type KvLike } from './server/quizBank';

/**
 * 平台相依能力。
 *
 * ⚠️ 這裡**刻意不提供** `recognizeImage`：
 *    Worker 沒有 tesseract.js 與 Node 的 fs／path／os。
 *    客戶端若送圖片（舊版），handler 會回 OCR_NOT_AVAILABLE，
 *    提示對方改用支援前端辨識的版本 —— 明確回報比默默失敗好。
 */
/**
 * ★★ 2026-10-07 第二階段：**`deps` 從 module 層搬進 `fetch` 內**。
 *
 * 【原本錯在哪】
 *   `deps` 是 module 層的常數，整個 Worker 實例共用一份。
 *   這對第一階段的 `{}` 沒有影響（它是空的）。
 *   但 KV 綁定是 **per-request 的 `env`** ——
 *   module 層根本拿不到 `env`，所以 `deps.quizBank` 不可能在那裡建構。
 *
 *   ⚠️ 更糟的是：如果硬把它寫成 module 層的可變物件，
 *      Cloudflare 會在多個請求之間**重複使用同一個 isolate**，
 *      於是不同請求會互相看到對方的綁定 —— 那是一個極難重現的 bug。
 *
 * → 現在 `deps` 在 `fetch` 內依 `env` 建構，一次請求一份，不會互相污染。
 */
type Handler = (body: any, headers: Headers, deps: CoreDeps) => Promise<ApiResult>;

const ROUTES: Record<string, { handler: Handler; method: 'GET' | 'POST' }> = {
  '/api/analyze-label': { handler: handleAnalyzeLabel, method: 'POST' },
  '/api/analyze-indicators': { handler: handleAnalyzeIndicators, method: 'POST' },
  '/api/ask-health-question': { handler: handleAskHealthQuestion, method: 'POST' },
  // 健身週報（2026-10-02）：走 NVIDIA NIM，AI 失敗時自動回離線規則版
  '/api/fitness-report': { handler: handleFitnessReport, method: 'POST' },
  // 出題（2026-10-07）：「學一個小知識」的測驗題。
  // ⚠️ 含同意閘門：localOnly 時只回內建題，不呼叫任何外部服務。
  '/api/quiz-question': { handler: handleQuizQuestion, method: 'POST' },
  // 線上題庫同步（2026-10-07 第二階段）：`?since=<ms>` 只回更新的題。
  // ⚠️ 這是 GET —— 題庫是「大家共用的公開內容」，不含任何個人資料。
  '/api/quiz-bank': { handler: handleQuizBank, method: 'GET' },
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
  /**
   * 線上題庫（2026-10-07 第二階段）。
   *
   * ⚠️ 用**結構型別**而不是 `import type { KVNamespace } from '@cloudflare/workers-types'`
   *    —— 引入那個套件會讓整個專案的型別環境跟著換一套，
   *    而我們只用到 get／put／list 三個方法。
   * ⚠️ optional：未綁定時不注入 `deps.quizBank`，功能自動降級（見 quizBank.ts）。
   */
  QUIZ_BANK?: KvLike;
  [key: string]: unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    /**
     * ★ 平台相依能力，**每個請求各建一份**。
     *
     * 【為什麼不能放在 module 層】
     *   見上方 `type Handler` 的說明：`env` 是 per-request 的，
     *   module 層拿不到它；而且 isolate 會跨請求重用，
     *   共用一份可變物件會讓不同請求互相污染。
     */
    const deps: CoreDeps = env.QUIZ_BANK ? { quizBank: makeQuizBankStore(env.QUIZ_BANK) } : {};

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
        /**
         * GET 沒有 body；POST 才解析 JSON。
         * 解析失敗時給空物件，讓 handler 用既有的「未收到內容」邏輯回應，
         * 而不是讓整個請求以 500 收場。
         *
         * ★ 2026-10-07：GET 改成傳**查詢參數**（`?since=...`）。
         *
         * 【為什麼要這樣做】
         *   handler 的簽名是 `(body, headers, deps)` —— 拿不到 URL。
         *   而 `/api/quiz-bank?since=<ms>` 需要那個 `since`。
         *
         *   三個選擇：
         *     ① 改 handler 簽名加第 4 個參數 → 要動**所有** handler 與兩平台的呼叫端
         *     ② 只為這一個 handler 開特例 → 下一個需要查詢參數的人又要再開一次
         *     ③ **GET 的查詢參數就放進 `body`** ← 採用
         *   ③ 讓「GET 的輸入」與「POST 的輸入」在 handler 眼中長得一樣，
         *   而 `body` 這個名字在這裡的意義就是「這次請求的輸入參數」。
         *
         * ⚠️ `server.ts`（本機 Node）必須做一樣的事，否則同一支 handler
         *    在本機與線上行為不同 —— 那是最難查的一種 bug。
         */
        const body =
          route.method === 'POST'
            ? await request.json().catch(() => ({}))
            : Object.fromEntries(url.searchParams);
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
