/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 伺服器端標籤辨識（Node / tesseract.js）
 * ============================================================================
 * ⚠️ 正常情況下**這個模組不會被使用** —— OCR 已經搬到瀏覽器
 *    （見 src/ocr/ocrBrowser.ts），照片不再上傳。
 *
 *    保留它的理由：
 *      1. `npm run ocr:smoke` 需要在命令列實測辨識準確率
 *      2. 舊版客戶端若仍送圖片，需要一條降級路徑
 *
 *    純解析邏輯已移到 server/labelParser.ts（無 Node API），
 *    這樣 Cloudflare Worker 才能只引入解析部分、不必打包 tesseract.js。
 *
 * 【資產】public/tessdata/chi_tra.traineddata（繁體中文）
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createWorker, type Worker } from 'tesseract.js';
import { buildRecognitionResult, type OcrRecognitionResult } from './labelParser';

export type { OcrRecognitionResult } from './labelParser';

/* ---------------------------------------------------------------------------
 * 0. 語言設定
 *
 * 【實測結論：預設只用 chi_tra，不要加 eng】
 *   1. `chi_tra` 的模型本身就含拉丁字母，實測同一張標籤連
 *      「Nutrition Facts」都讀得出來，加上 eng 並沒有提升準確率。
 *   2. 實測 `chi_tra+eng` 會讓 tesseract.js 額外嘗試載入一個亂碼語言檔
 *      （`./𕋂𕋂.traineddata`），在 stderr 洗出三行錯誤訊息。
 *      結果雖然正確，但會干擾日誌判讀。
 *   3. 少載一個 5.2 MB 的模型，worker 啟動也比較快。
 *
 *   若日後真的需要英文模型，設環境變數 `TESSERACT_LANG=chi_tra+eng` 即可，
 *   `server/tessdata/eng.traineddata` 已經準備好。
 * ------------------------------------------------------------------------- */
/**
 * ★ 2026-10-04：預設改為 `chi_tra+eng`。
 *   實測（模擬實拍的英文標籤）純 chi_tra 會把 `Protein` 讀成 `Protean`、
 *   並**弄丟所有小數點**（6.80 → 680）；加上 eng 之後兩者都正確。
 *   中文標籤則相反（`公克` 會被讀成 `公交`），
 *   所以前端是兩輪各用一種組合；這裡的伺服器路徑是後備用途，
 *   取涵蓋面較廣的那一組。
 *   仍可用環境變數 TESSERACT_LANG 覆寫。
 */
const OCR_LANGS = (process.env.TESSERACT_LANG || 'chi_tra+eng').trim();

/* ---------------------------------------------------------------------------
 * 1. tessdata 位置解析
 *
 * 【為什麼不用 __dirname】
 *   本專案是 ESM（package.json 有 "type": "module"），
 *   開發時用 tsx 直接執行 TS，此時根本沒有 __dirname；
 *   而打包成 dist/server.cjs 後 __dirname 又會變成 dist/，指向不存在的 dist/tessdata。
 *   兩邊都會壞，所以改用「以工作目錄為基準的候選清單」＋環境變數覆寫。
 *
 *   正常情況下 `npm run dev` 與 `npm start` 都是從專案根目錄啟動，
 *   因此 process.cwd() 就是專案根目錄，能正確找到 server/tessdata。
 *   若部署到其他環境（例如容器內工作目錄不同），用 TESSDATA_PATH 指定即可。
 * ------------------------------------------------------------------------- */
function resolveTessdataDir(): string | null {
  const required = OCR_LANGS.split('+')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `${l}.traineddata`);

  const candidates = [
    process.env.TESSDATA_PATH,
    // 2026-09-27 搬家：語言檔從 server/tessdata 移到 public/tessdata，
    // 這樣同一個檔案同時能被「瀏覽器（Vite 服務 public/）」與
    // 「伺服器（Node 讀檔）」取用，不必維護兩份 7.5 MB 的副本。
    // Vite 建置時會把 public/ 複製到 dist/，所以正式模式走 dist/tessdata。
    path.join(process.cwd(), 'public', 'tessdata'),
    path.join(process.cwd(), 'dist', 'tessdata'),
    // 舊位置保留相容，避免舊環境或已部署的版本找不到檔案
    path.join(process.cwd(), 'server', 'tessdata'),
    path.join(process.cwd(), 'tessdata'),
  ].filter((p): p is string => Boolean(p));

  for (const dir of candidates) {
    try {
      if (required.every((file) => fs.existsSync(path.join(dir, file)))) {
        return dir;
      }
    } catch {
      /* 換下一個候選 */
    }
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * 2. Worker 生命週期
 *
 * 【為什麼要共用一個 worker】
 *   建立 worker 要載入 WASM 與 traineddata，實測耗時以秒計。
 *   每次辨識都重建會讓離線路徑慢到不可用，因此只建立一次並重複使用。
 *
 * 【為什麼要排隊】
 *   worker 內部的 recognize 是循序的，同時呼叫會互相干擾。
 *   用一條 promise 鏈把請求排隊，避免併發問題。
 * ------------------------------------------------------------------------- */
let workerPromise: Promise<Worker> | null = null;
let taskQueue: Promise<unknown> = Promise.resolve();

async function getWorker(langPath: string): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(OCR_LANGS, 1, {
      langPath,
      // traineddata 是未壓縮的原始檔，必須關閉 gzip 期待
      gzip: false,
      // 關閉快取：本機已有 traineddata，再寫一份 .cache 只是浪費磁碟
      cacheMethod: 'none',
      // 暫存檔一律丟到系統 temp，不污染專案目錄
      cachePath: path.join(os.tmpdir(), 'labelbuddy-tesseract'),
      logger: () => {
        /* 關閉進度輸出，避免洗版 */
      },
    }).catch((err) => {
      // 建立失敗就把 promise 清掉，下次請求可以重試
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = taskQueue.then(task, task);
  // 吞掉錯誤以免鏈斷掉，但把結果原樣回給呼叫者
  taskQueue = run.catch(() => undefined);
  return run;
}

/**
 * 關閉 worker 並釋放資源。
 *
 * ⚠️ 伺服器長時間運行時**不需要**呼叫（worker 就是要重複使用）。
 *    但**命令列腳本必須呼叫**，否則 worker 執行緒會讓 Node 行程永遠不結束 ——
 *    實測 `npm run ocr:smoke` 就是因此卡住不退出。
 */
export async function shutdownOcrWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    /* 已經壞掉的 worker 直接放棄 */
  }
}
/**
 * 主入口（伺服器端）：辨識圖片 → 營養輪廓。
 *
 * ⚠️ 新流程已把 OCR 搬到瀏覽器（見 `src/ocr/ocrBrowser.ts`），
 *    正常情況下這個函式**不會被呼叫**。
 *    保留它是為了：
 *      1. 舊版客戶端仍可能送圖片
 *      2. `npm run ocr:smoke` 需要在命令列實測準確率
 *
 * ok=false 代表「讀不到足夠欄位」，呼叫端必須請使用者重拍，
 * **不可**用預設值補齊（那就回到捏造結論的老問題了）。
 */
export async function recognizeNutritionFromImage(
  cleanBase64: string
): Promise<OcrRecognitionResult> {
  const langPath = resolveTessdataDir();
  if (!langPath) {
    return {
      ok: false,
      profile: null,
      matchedFields: 0,
      rawText: '',
      error: '找不到 tessdata 目錄（需 public/tessdata/chi_tra.traineddata）',
    };
  }

  const imageBuffer = Buffer.from(cleanBase64, 'base64');
  if (imageBuffer.length === 0) {
    return { ok: false, profile: null, matchedFields: 0, rawText: '', error: '圖片為空' };
  }

  let rawText = '';
  try {
    rawText = await enqueue(async () => {
      const worker = await getWorker(langPath);
      const { data } = await worker.recognize(imageBuffer);
      return data.text || '';
    });
  } catch (err: any) {
    return {
      ok: false,
      profile: null,
      matchedFields: 0,
      rawText: '',
      error: `OCR 執行失敗：${err?.message || err}`,
    };
  }

  return buildRecognitionResult(rawText);
}
