/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * LabelBuddy AI — Express 入口（本機開發／自架用）
 * ============================================================================
 * 【這個檔案只做三件事】
 *   1. 把 HTTP 請求轉成平台無關的格式，交給 `server/handlers.ts`
 *   2. 把處理結果送回 HTTP 回應
 *   3. 開發時掛載 Vite 中介軟體、正式時服務 dist/ 靜態檔
 *
 *   商業邏輯全部在 `server/core.ts` 與 `server/handlers.ts`，
 *   這樣同一份邏輯才能也跑在 Cloudflare Workers（見 `worker.ts`）。
 *   ⚠️ 改邏輯請改那兩個檔案，不要改這裡。
 *
 * 【兩種啟動方式】
 *   開發：`npm run dev`   → Vite 中介軟體（熱更新）
 *   正式：`npm run build && npm start` → 服務 dist/ 靜態檔
 *
 * 【OCR 在哪裡】
 *   照片的 OCR 已經搬到**瀏覽器**（`src/ocr/ocrBrowser.ts`），照片不上傳。
 *   這裡仍然提供伺服器端 OCR 作為降級路徑（舊客戶端、命令列實測），
 *   以 `deps.recognizeImage` 注入給 handler。
 *   Worker 版本不會提供它 —— 那裡的執行環境沒有 tesseract.js。
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { recognizeNutritionFromImage } from './server/ocrLabel';
import {
  handleAiStatus,
  handleAnalyzeIndicators,
  handleAnalyzeLabel,
  handleAskHealthQuestion,
  handleHealth,
  handlePrivacy,
} from './server/handlers';
import type { ApiResult, CoreDeps, PlatformRequest } from './server/core';

const app = express();
// 允許以環境變數覆寫埠號（雲端平台會要求監聽 $PORT）
const PORT = Number(process.env.PORT) || 3000;

// 20mb：新流程只送文字（幾 KB），但舊客戶端仍可能送 base64 圖片
app.use(express.json({ limit: '20mb' }));

/**
 * 注入平台相依能力。
 *
 * 這裡提供伺服器端 OCR —— 只有 Node 環境有 tesseract.js 與 fs。
 * Cloudflare Worker 的 `deps` 不會有這一項，handler 會改回「請用前端辨識」。
 */
const deps: CoreDeps = { recognizeImage: recognizeNutritionFromImage };

/** 把 Express 的 headers 物件轉成標準 Headers（handler 的統一介面） */
function toHeaders(raw: unknown): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries((raw as Record<string, unknown>) || {})) {
    if (typeof value === 'string') out.set(key, value);
    else if (Array.isArray(value)) out.set(key, value.join(', '));
  }
  return out;
}

/**
 * 把平台無關的 handler 接到 Express 路由。
 *
 * handler 回傳 `{ status, json }`，這裡負責真的送出去。
 * 萬一 handler 自己爆掉（理論上不會，它們都有 try/catch），
 * 也在這裡統一回 500，不讓例外冒到 Express 的預設處理器。
 */
function route(handler: (body: any, headers: Headers, deps: CoreDeps) => Promise<ApiResult>) {
  return async (req: express.Request, res: express.Response) => {
    try {
      const platformReq: PlatformRequest = { body: req.body, headers: req.headers };
      const result = await handler(platformReq.body, toHeaders(platformReq.headers), deps);
      res.status(result.status).json(result.json);
    } catch (error) {
      console.error('[LabelBuddy AI] 未預期的處理器例外:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: '系統忙碌中，請稍後再試一次。',
      });
    }
  };
}

app.post('/api/analyze-label', route(handleAnalyzeLabel));
app.post('/api/analyze-indicators', route(handleAnalyzeIndicators));
app.post('/api/ask-health-question', route(handleAskHealthQuestion));
app.get('/api/privacy', route(handlePrivacy));
app.get('/api/ai-status', route(handleAiStatus));
app.get('/api/health', route(handleHealth));

// 整合 Vite 中介軟體 (開發與生產模式)
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LabelBuddy AI] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
