/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 瀏覽器端標籤辨識（In-browser Label OCR）
 * ============================================================================
 * 【為什麼把 OCR 從伺服器搬到瀏覽器】
 *   原本 OCR 跑在 Node 伺服器上，代表**照片必須先上傳到伺服器**才能讀取。
 *   搬到瀏覽器之後：
 *
 *   1. 【隱私】照片從來沒有離開使用者的裝置。
 *      只有「讀出來的文字」會被送到後端做分析 —— 這正是產品要承諾的事，
 *      而且是**可以驗證的事實**，不是行銷說法。
 *   2. 【後端變輕】伺服器只剩「文字 → AI」的代理，可以部署到
 *      Cloudflare Workers 這類邊緣平台（免費方案每請求只有 10ms CPU，
 *      跑不動 tesseract，但當純代理綽綽有餘）。
 *   3. 【離線】語言模型與 WASM 引擎都是本專案的靜態資源
 *      （見 scripts/copy-ocr-assets.mjs），不依賴任何 CDN。
 *
 * 【與 server/ocrLabel.ts 的關係】
 *   那個檔案仍然存在，供 `npm run ocr:smoke` 在命令列實測準確率，
 *   以及舊版客戶端送圖片時的降級路徑。
 *   解析邏輯（文字 → 營養欄位）留在伺服器端，兩邊共用同一套規則。
 *
 * 【資產位置】
 *   /tessdata/chi_tra.traineddata          ← 語言模型（7.5 MB，我們自己的）
 *   /tesseract-worker.min.js               ← Web Worker 進入點
 *   /tesseract-core/tesseract-core-*.wasm* ← 辨識引擎（依裝置能力挑一種）
 *   前兩項由 npm 腳本從 node_modules 複製，不進版控。
 */

import { createWorker, type Worker } from 'tesseract.js';

/**
 * 語言設定。
 *
 * 【實測結論：預設只用 chi_tra，不要加 eng】
 *   `chi_tra` 的模型本身就含拉丁字母，實測同一張標籤連「Nutrition Facts」
 *   都讀得出來；加上 eng 不但沒有提升準確率，還會讓 tesseract.js
 *   額外嘗試載入一個亂碼語言檔並在 console 洗出錯誤訊息。
 */
const OCR_LANGS = 'chi_tra';

/** 靜態資源路徑。Vite 會把 public/ 服務在根路徑下。 */
const ASSET_PATHS = {
  workerPath: '/tesseract-worker.min.js',
  corePath: '/tesseract-core',
  langPath: '/tessdata',
};

export interface BrowserOcrResult {
  /** 是否成功執行 OCR（**不代表讀到的內容足夠**，那由伺服器端的誠實門檻判斷） */
  ok: boolean;
  /** OCR 讀出的原始文字 */
  text: string;
  /** 失敗原因（供除錯顯示） */
  error?: string;
}

let workerPromise: Promise<Worker> | null = null;
/** 序列化任務，避免同一時間有兩個 recognize 搶同一個 worker */
let taskQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = taskQueue.then(task, task);
  taskQueue = run.catch(() => undefined);
  return run;
}

/**
 * 建立（或取用既有的）worker。
 *
 * worker 的建立要下載並初始化 WASM 引擎，實測需要數秒，
 * 因此只建立一次並重複使用 —— 同一場使用中的第二次掃描會快很多。
 */
function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(OCR_LANGS, 1, {
      ...ASSET_PATHS,
      // traineddata 是未壓縮的原始檔，必須關閉 gzip 期待
      gzip: false,
      logger: () => {
        /* 關閉進度輸出；載入畫面已有自己的進度提示 */
      },
    }).catch((err) => {
      // 建立失敗就把 promise 清掉，下次掃描可以重試
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/**
 * 在瀏覽器端辨識標籤照片的文字。
 *
 * @param imageDataUrl 圖片的 data URL（`data:image/jpeg;base64,...`）
 */
export async function recognizeLabelTextInBrowser(
  imageDataUrl: string
): Promise<BrowserOcrResult> {
  if (!imageDataUrl) {
    return { ok: false, text: '', error: '沒有圖片' };
  }

  try {
    const text = await enqueue(async () => {
      const worker = await getWorker();
      // 瀏覽器端的 recognize 直接接受 data URL，不需要先轉成 Buffer
      const { data } = await worker.recognize(imageDataUrl);
      return data.text || '';
    });
    return { ok: true, text };
  } catch (err: any) {
    return {
      ok: false,
      text: '',
      error: err?.message || String(err),
    };
  }
}

/**
 * 預先建立 worker。
 *
 * 可在使用者還在對準標籤時就先呼叫，讓正式掃描時不必等引擎初始化。
 * 失敗不拋錯 —— 這只是加速，不影響正確性。
 */
export function warmUpBrowserOcr(): void {
  void getWorker().catch(() => {
    /* 預熱失敗就等正式掃描時再試 */
  });
}

/**
 * 關閉 worker 並釋放資源。
 *
 * ⚠️ 一般使用**不需要**呼叫（worker 就是要重複使用）。
 *    只有要徹底重置狀態時才用得到。
 */
export async function shutdownBrowserOcr(): Promise<void> {
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
