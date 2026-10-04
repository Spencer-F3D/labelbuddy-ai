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
/**
 * ★★ 2026-10-04 實測後改為「兩組語言模型，兩輪各用一組」。
 *
 * 【為什麼不是固定用 chi_tra+eng】
 *   用一張**模擬實拍**（大面積彩色圖案＋表格只佔畫面一半＋模糊＋低對比＋
 *   JPEG 壓縮）的標籤實測，兩組的結果是：
 *
 *   英文標籤          只有 chi_tra         chi_tra+eng
 *     Protein         `Protean 250g` ❌   `Protein 2.509` ✅
 *     Carbohydrate    `680g` ❌           `6.80g` ✅
 *     Sugar           `100g9` ❌          `1.009` ✅
 *     Percentage      `Percenmtage` ❌    `Percentage` ✅
 *     → 小數點在 chi_tra 下**全部消失**，加 eng 後全部保留
 *
 *   中文標籤          只有 chi_tra         chi_tra+eng
 *     大卡            `大卡` ✅           `x +` ❌
 *     公克            `公克` ✅           `2%`／`公交` ❌
 *     耗時            1526ms              2593ms（+70%）
 *     → 加 eng 之後，中文的「公克」會被誤讀成「公交」，
 *        而解譯器正是靠「公克」這類關鍵字在抓數值。
 *
 * 【結論】兩邊各有勝場，**沒有一個設定是全贏的**。
 *   → 第一輪用 `chi_tra+eng`（涵蓋英文／中英混排的包裝，這是實拍最常見的情況）
 *     第二輪用 `chi_tra`（純中文標籤的救援，中文關鍵字才抓得準）
 *   這樣兩邊的優點都拿得到，代價只是第二輪才多花一次時間。
 */
export const OCR_LANGS_PRIMARY = 'chi_tra+eng';
export const OCR_LANGS_FALLBACK = 'chi_tra';

/** 相容舊用法（未指定時用第一輪的設定） */
const OCR_LANGS = OCR_LANGS_PRIMARY;

/** 靜態資源路徑。Vite 會把 public/ 服務在根路徑下。 */
const ASSET_PATHS = {
  workerPath: '/tesseract-worker.min.js',
  corePath: '/tesseract-core',
  langPath: '/tessdata',
};

/**
 * 最近一次 OCR 的診斷資訊（2026-10-03）。
 *
 * ★★【為什麼需要這個】
 *   使用者回報「本機 OCR 完全不行」，但我在電腦瀏覽器上**怎麼測都正常**：
 *   完整流水線（OCR ＋ 規則引擎）在標籤只佔畫面 25%、
 *   甚至在極低對比的情況下都還讀得出 鈉2350／糖8.5／碳水62。
 *
 *   也就是說：**問題只在他的裝置上，而我在這裡看不到。**
 *   繼續盲猜沒有意義 —— 所以改成把失敗的**具體原因**記錄下來，
 *   由開發者面板顯示，讓使用者直接回報那一行訊息。
 *
 *   ⚠️ 這裡刻意記錄的是「最後一次的結果」，不是歷史。
 *      開發者面板只需要知道「剛才那一次發生什麼事」。
 */
export interface OcrDiagnostics {
  /** 最後一次的結局 */
  outcome: 'ok' | 'engine-error' | 'image-error';
  /** 讀到的字數（成功時） */
  textLength: number;
  /** 錯誤訊息原文（失敗時） */
  error: string | null;
  /** 引擎是否已成功建立過 */
  engineReady: boolean;
  /** 花費毫秒 */
  elapsedMs: number;
  /** 發生時間 */
  at: string;
  /**
   * OCR 讀出的**原始文字**（截斷 500 字）。
   * 開發者面板要看的「上次標籤原文」—— 沒有這個就只能看到「讀到幾個字」，
   * 看不出「讀到了什麼、錯在哪」。
   */
  rawText: string;
}

let lastDiagnostics: OcrDiagnostics | null = null;

export function getLastOcrDiagnostics(): OcrDiagnostics | null {
  return lastDiagnostics;
}

function recordDiagnostics(d: OcrDiagnostics): void {
  lastDiagnostics = d;
  // 同時留在 console：使用者若截圖 console 也能給出線索
  console.log(`[LabelBuddy AI][OCR] ${d.outcome} len=${d.textLength} ${d.error ?? ''} ${d.elapsedMs}ms`);
}

export interface BrowserOcrResult {
  /** 是否成功執行 OCR（**不代表讀到的內容足夠**，那由伺服器端的誠實門檻判斷） */
  ok: boolean;
  /** OCR 讀出的原始文字 */
  text: string;
  /**
   * 失敗原因（供除錯顯示）。
   *
   * ★ 2026-10-02：這個欄位現在會被**使用者看到**（見 App.tsx 的 OCR 失敗處理）。
   *   理由：本機的兩個模式（只送文字／只在本機）都必須靠這支 OCR，
   *   而它不是「照片拍不好」那麼簡單就會失敗的 —— 最常見的失敗是
   *   **引擎本身載入不了**（要下載約 6.4 MB 的語言模型與 WASM）。
   *   以前一律顯示「請重拍」，使用者就一張一張重拍，永遠不會好。
   *   → 現在必須把「引擎問題」與「照片問題」分開講。
   */
  error?: string;
  /**
   * 失敗的種類。
   *   `engine` —— 引擎載入／初始化失敗（網路問題，重拍照片沒用）
   *   `image`  —— 圖片本身有問題（空白、格式不支援）
   */
  errorKind?: 'engine' | 'image';
}

/**
 * 已建立的 worker，**以語言組合為鍵**（見 getWorker 的說明）。
 * 兩輪會各建一個：`chi_tra+eng` 與 `chi_tra`。
 */
const workerPromises = new Map<string, Promise<Worker>>();

/** 最近一次使用／建立的 worker（僅供水準判斷與除錯顯示） */
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
function getWorker(langs: string = OCR_LANGS): Promise<Worker> {
  /**
   * ⚠️ 用 **Map 以語言組合為鍵**，而不是單一個全域 promise。
   *
   * 【為什麼】兩輪用不同的語言模型（chi_tra+eng / chi_tra）。
   *   若只有一個 promise，第二輪會沿用第一輪的 worker ——
   *   也就是**語言模型根本沒換**，第二輪等於白跑一次，
   *   而且不會有任何錯誤訊息。
   */
  const existing = workerPromises.get(langs);
  if (existing) return existing;

  const created = createWorker(langs, 1, {
    ...ASSET_PATHS,
    // traineddata 是未壓縮的原始檔，必須關閉 gzip 期待
    gzip: false,
    logger: () => {
      /* 關閉進度輸出；載入畫面已有自己的進度提示 */
    },
  }).catch((err) => {
    // 建立失敗就把這一筆清掉，下次掃描可以重試
    workerPromises.delete(langs);
    throw err;
  });
  workerPromises.set(langs, created);
  /** 向後相容：`isBrowserOcrReady()` 與除錯訊息仍看這個 */
  workerPromise = created;
  return created;
}

/**
 * 在瀏覽器端辨識標籤照片的文字。
 *
 * @param imageDataUrl 圖片的 data URL（`data:image/jpeg;base64,...`）
 */
export async function recognizeLabelTextInBrowser(
  imageDataUrl: string,
  /** 語言模型組合（省略時用第一輪的 chi_tra+eng） */
  langsOverride?: string
): Promise<BrowserOcrResult> {
  if (!imageDataUrl) {
    return { ok: false, text: '', error: '沒有圖片', errorKind: 'image' };
  }

  const startedAt = Date.now();
  try {
    const text = await enqueue(async () => {
      const worker = await getWorker(langsOverride);
      // 瀏覽器端的 recognize 直接接受 data URL，不需要先轉成 Buffer
      const { data } = await worker.recognize(imageDataUrl);
      return data.text || '';
    });
    recordDiagnostics({
      outcome: 'ok',
      textLength: text.length,
      error: null,
      engineReady: true,
      elapsedMs: Date.now() - startedAt,
      at: new Date().toLocaleTimeString(),
      rawText: text.slice(0, 500),
    });
    return { ok: true, text };
  } catch (err: any) {
    /**
     * ★ 2026-10-02：把「引擎失敗」與「圖片失敗」分開。
     *
     * 這裡是使用者體驗的關鍵：引擎失敗（要下載 6.4 MB）**重拍照片沒有用**，
     * 但舊版一律顯示「請重拍」，使用者就一直在原地重拍。
     * 判斷方式：只要錯誤不是「圖片」相關，就是引擎問題。
     */
    const msg = err?.message || String(err);
    const isImageProblem = /圖片|image|decode|畫布/i.test(msg);
    /**
     * ★ 把失敗的具體原因記錄下來 —— 這是「使用者說不行、我卻重現不出來」
     *   唯一的突破口（見檔案上方的 OcrDiagnostics 說明）。
     */
    recordDiagnostics({
      outcome: isImageProblem ? 'image-error' : 'engine-error',
      textLength: 0,
      error: msg,
      engineReady: workerPromise !== null,
      elapsedMs: Date.now() - startedAt,
      at: new Date().toLocaleTimeString(),
      rawText: '',
    });
    return {
      ok: false,
      text: '',
      error: msg,
      errorKind: isImageProblem ? 'image' : 'engine',
    };
  }
}

/* ---------------------------------------------------------------------------
 * 前處理與高品質重試（2026-10-02 新增）
 *
 * 【為什麼需要】
 *   本機的兩個模式（只送文字／只在本機）都吃這支 OCR。真實回報是
 *   「影得多好也不行」—— 但真正的問題往往不是照片，而是**引擎沒載入成功**。
 *   不過照片端確實也有一個可以便宜改善的地方：
 *
 *   App 在 OCR 模式下把照片縮到長邊 1024px、JPEG 品質 0.8。
 *   對「整包裝入鏡、營養表只佔一小塊」的構圖，小字會變得很吃力。
 *   而本機模式**不需要上傳照片**，所以提高解析度不吃任何網路成本，
 *   只多花一點 CPU。因此策略是：
 *     第一輪：1024px（快，涵蓋大多數情況）
 *     第二輪（只在第一輪失敗時）：1440px ＋ 灰階對比拉伸
 *   只在需要時多付 CPU，平常不多花時間。
 * ------------------------------------------------------------------------- */

/* 註：原本有一個 OCR_RETRY_MAX_DIM 常數（第二輪放大用），
   2026-10-03 已移除 —— 第二輪改成「換一種前處理」而不是「放大更多」。
   理由見 App.tsx 的 runBrowserOcr 說明。 */

/**
 * 灰階 + 對比拉伸。
 *
 * 【為什麼是這兩個，不是二值化】
 *   二值化（黑白切一個門檻）在**打光不均勻**的照片上很危險 ——
 *   反光那半邊會整片變白、陰影那半邊整片變黑，字直接消失。
 *   灰階 + 依直方圖拉伸對比則不會有這個問題：它只是把偏灰的影像拉開，
 *   不會把任何區域「判死」。
 *
 * 實作在 canvas 上做（不需要額外 WASM），成本約幾十毫秒。
 */
export function preprocessDataUrlForOcr(imageDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(imageDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = data.data;

        // 1) 灰階（BT.601 亮度）
        const lum = new Uint8Array(canvas.width * canvas.height);
        for (let i = 0, j = 0; i < px.length; i += 4, j++) {
          lum[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
        }

        // 2) 找 2% / 98% 百分位當黑白點（避開反光點與陰影這種極端值）
        const hist = new Uint32Array(256);
        for (let i = 0; i < lum.length; i++) hist[lum[i]]++;
        const total = lum.length;
        let lo = 0;
        let hi = 255;
        let acc = 0;
        for (let v = 0; v < 256; v++) {
          acc += hist[v];
          if (acc >= total * 0.02) {
            lo = v;
            break;
          }
        }
        acc = 0;
        for (let v = 255; v >= 0; v--) {
          acc += hist[v];
          if (acc >= total * 0.02) {
            hi = v;
            break;
          }
        }

        // 沒有足夠的對比 → 原樣回傳（硬拉只會放大雜訊）
        if (hi - lo < 10) {
          resolve(imageDataUrl);
          return;
        }

        const scale = 255 / (hi - lo);
        const lut = new Uint8Array(256);
        for (let v = 0; v < 256; v++) {
          lut[v] = Math.max(0, Math.min(255, Math.round((v - lo) * scale)));
        }

        for (let i = 0, j = 0; i < px.length; i += 4, j++) {
          const v = lut[lum[j]];
          px[i] = px[i + 1] = px[i + 2] = v;
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch {
        // 前處理失敗不是致命錯誤 —— 用原圖繼續
        resolve(imageDataUrl);
      }
    };
    img.onerror = () => resolve(imageDataUrl);
    img.src = imageDataUrl;
  });
}

/**
 * 預先建立 worker。
 *
 * 可在使用者還在對準標籤時就先呼叫，讓正式掃描時不必等引擎初始化。
 * 失敗不拋錯 —— 這只是加速，不影響正確性。
 *
 * ★★ 2026-10-02：**這支函式存在了很久，但從來沒有被呼叫過**（死匯入）。
 *
 * 【為什麼這是一個嚴重的 bug，而不是「少了個加速」】
 *   引擎要下載：語言模型 2.37 MB ＋ WASM 核心約 4 MB ＋ worker 62 KB
 *   ＝ **約 6.4 MB**。
 *   沒有預熱＝這 6.4 MB 會在**使用者按下快門的那一刻**才開始下載。
 *   在超市（訊號最差的地方）下載一個 6.4 MB 的檔案，失敗機率很高；
 *   一旦失敗，`createWorker()` 會拋錯 → OCR 失敗 → App 卻顯示
 *   「看不清楚標籤數字，請重拍」→ **使用者一直重拍，而照片從來不是問題**。
 *
 *   這正是「本機的兩個模式 scan 唔到嘢，影得多好也不行」最合理的解釋：
 *   只有那兩個模式需要這 6.4 MB，而「直接雲端」完全不需要。
 *
 * → 現在在 App 進入主頁／掃描頁時就會呼叫（見 App.tsx 的 useEffect）。
 */
export function warmUpBrowserOcr(): void {
  void getWorker().catch(() => {
    /* 預熱失敗就等正式掃描時再試 */
  });
}

/**
 * 引擎是否已經載入完成（給 UI 顯示用）。
 *
 * ⚠️ 這裡只回報「有沒有載好」，不做「正在載」的細部狀態 ——
 *    tesseract 的 logger 進度在不同版本格式不一，拿它做 UI 反而容易誤導。
 *    使用者只需要知道兩件事：**可以掃了** 或 **還在準備**。
 */
export function isBrowserOcrReady(): boolean {
  return workerPromise !== null;
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
