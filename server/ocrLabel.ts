/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 離線標籤辨識（On-device Label OCR）
 * ============================================================================
 * 【為什麼需要這個模組】
 *   本機備援引擎原本只用「圖片位元組長度」在三組寫死的營養資料之間輪替
 *   （`cleanBase64.length % 3`），與照片實際內容完全無關。
 *   那代表離線時系統會**憑空捏造**一份看起來很肯定的紅／黃／綠結論 ——
 *   對一個健康判斷 App，這是最糟的失敗模式：錯了不會報錯。
 *
 *   本模組改用 tesseract.js 在本機真正讀出標籤上的文字，
 *   解析出真實的鈉／糖／脂肪等數字，再交給規則引擎判斷。
 *   完全離線、圖片不外傳，而且**答案會隨真實產品而不同**。
 *
 * 【誠實原則】
 *   讀不到足夠的營養欄位時，**絕不用預設值補齊**，一律回傳 ok=false，
 *   由呼叫端請使用者重拍。寧可說「看不清楚」，也不要給出捏造的結論。
 *
 * 【資產】
 *   server/tessdata/chi_tra.traineddata（繁體中文）
 *   server/tessdata/eng.traineddata（英文，用於讀 Latin 品名與單位）
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createWorker, type Worker } from 'tesseract.js';
import type { NutritionProfile } from './smartNutritionAnalyzer';

/** 辨識結果。ok=false 時 profile 為 null，呼叫端必須請使用者重拍。 */
export interface OcrRecognitionResult {
  ok: boolean;
  profile: NutritionProfile | null;
  /** 成功解析出的核心營養欄位數（共 6 項：鈉／糖／碳水／飽和脂肪／反式脂肪／熱量） */
  matchedFields: number;
  /** 原始 OCR 文字，僅供除錯與記錄，不會回傳給前端 */
  rawText: string;
  /** 失敗原因（僅供伺服器記錄） */
  error?: string;
}

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
const OCR_LANGS = (process.env.TESSERACT_LANG || 'chi_tra').trim();

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

/* ---------------------------------------------------------------------------
 * 3. 文字正規化與解析
 * ------------------------------------------------------------------------- */

/**
 * 全形轉半形，並**移除所有空白**。
 *
 * ⚠️ 為什麼要連空白都拿掉：OCR 很常把中文詞切開，
 *    實測同一張標籤得到的是「飽和 脂肪」「碳水 化 合 物」「反 式 脂肪」。
 *    若不先移除空白，關鍵字「飽和脂肪」永遠比對不到，
 *    結果會是「鈉讀到了、飽和脂肪沒讀到」這種半殘的解析。
 *    數字本身不含空白（10.2、1980），所以移除空白不會影響數值。
 */
function normalizeLine(input: string): string {
  return input
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\u3000\s]+/g, '')
    .trim();
}

/** OCR 常把 1 認成 l／I、把 0 認成 O，只在緊鄰數字時修正，避免誤傷英文字。 */
function repairDigitConfusions(text: string): string {
  return text
    .replace(/(?<=\d)[lI](?=\d)/g, '1')
    .replace(/(?<=\d)[oO](?=\d)/g, '0')
    .replace(/(?<=^|\s)[lI](?=\d)/g, '1');
}

/** 抓「數字」：允許千分位逗號（2,350）與小數點（9.8） */
const NUMBER_RE = /(\d[\d,]*(?:\.\d+)?)/;

/**
 * 解析數字字串。
 *
 * ⚠️ 逗號有兩種意思，必須分辨：
 *   「2,350」是千分位 → 2350（示範標籤就是這個格式）
 *   「9,8」是小數點被 OCR 讀成逗號 → 9.8
 * 判斷依據是「逗號後面是否剛好三位數字」。
 */
function parseNumberToken(token: string): number | null {
  let t = token;
  if (/^\d{1,3}(?:,\d{3})+$/.test(t)) {
    t = t.replace(/,/g, ''); // 千分位
  } else if (/^\d+,\d{1,2}$/.test(t)) {
    t = t.replace(',', '.'); // 小數點誤判
  } else {
    t = t.replace(/,/g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type Unit = 'mg' | 'g' | 'kcal';

/** 讀取關鍵字後面緊接的數字與單位 */
function readValueAfter(
  line: string,
  fromIndex: number
): { value: number; unit: Unit | null } | null {
  const tail = line.slice(fromIndex);
  const m = tail.match(NUMBER_RE);
  if (!m || m.index === undefined) return null;

  const value = parseNumberToken(m[1]);
  if (value === null) return null;

  const after = tail.slice(m.index + m[1].length);
  let unit: Unit | null = null;
  if (/^\s*(毫克|mg)/i.test(after)) unit = 'mg';
  else if (/^\s*(公克|克|g)(?!\w)/i.test(after)) unit = 'g';
  else if (/^\s*(大卡|千卡|kcal|cal)/i.test(after)) unit = 'kcal';

  return { value, unit };
}

/** 依「單位必須與該欄位預期單位一致」的規則換算，避免把公克當毫克讀 */
function toExpectedUnit(
  value: number,
  unit: Unit | null,
  expected: Unit
): number | null {
  if (unit === null) {
    // 單位讀不到時，只在「數值量級合理」的情況下採用，否則寧可放棄
    if (expected === 'mg' && value > 0 && value <= 20000) return value;
    if (expected === 'g' && value >= 0 && value <= 500) return value;
    if (expected === 'kcal' && value > 0 && value <= 2000) return value;
    return null;
  }
  if (unit === expected) return value;
  if (expected === 'mg' && unit === 'g') return value * 1000;
  if (expected === 'g' && unit === 'mg') return value / 1000;
  return null;
}

/**
 * 欄位規則。
 *
 * ⚠️ 順序即為「比對優先序」：飽和脂肪／反式脂肪必須排在「脂肪」之前，
 *    否則「飽和脂肪 9.8公克」會被當成一般脂肪讀走。
 *    這裡不追蹤總脂肪，因此只要確保糖與碳水不會被誤認即可。
 */
const FIELD_RULES: Array<{
  field: 'sodiumMg' | 'sugarG' | 'carbsG' | 'saturatedFatG' | 'transFatG' | 'calories';
  keys: string[];
  expected: Unit;
}> = [
  { field: 'saturatedFatG', keys: ['飽和脂肪', '饱和脂肪'], expected: 'g' },
  { field: 'transFatG', keys: ['反式脂肪'], expected: 'g' },
  { field: 'carbsG', keys: ['碳水化合物', '碳水'], expected: 'g' },
  { field: 'calories', keys: ['熱量', '热量'], expected: 'kcal' },
  // 鈉與「納」形近，OCR 很常認錯，兩個都收
  { field: 'sodiumMg', keys: ['鈉', '纳'], expected: 'mg' },
  // 糖放最後：避免「糖」在別的欄位名稱裡被先讀走
  { field: 'sugarG', keys: ['糖'], expected: 'g' },
];

const CORE_FIELDS = FIELD_RULES.map((r) => r.field);

/** 只取「營養標示」到「成分／過敏原／淨重」之間的區段，避免讀到成分表裡的數字 */
function extractNutritionRegion(lines: string[]): { region: string[]; startIndex: number } {
  const startIndex = lines.findIndex((l) =>
    /營養標示|营养标示|Nutrition\s*Facts/i.test(l)
  );
  if (startIndex < 0) return { region: lines, startIndex: -1 };

  const rest = lines.slice(startIndex);
  const endRel = rest.findIndex(
    (l, i) => i > 0 && /成分|Ingredients|過敏原|過敏源|淨重|保存|有效日期|注意事項/i.test(l)
  );
  return {
    region: endRel > 0 ? rest.slice(0, endRel) : rest,
    startIndex,
  };
}

/**
 * 品名：取「營養標示」之前、最長且「看起來像品名」的短行。
 *
 * ⚠️ 一定要做字元白名單過濾：OCR 常在標題上方吐出雜訊，
 *    實測同一張圖的第一行是「吉>》古~會」——長度與真品名一樣，
 *    只用長度排序會選到雜訊。雜訊通常含 > 》 ~ 這類符號，用白名單濾掉最可靠。
 */
const FOOD_NAME_ALLOWED = /^[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9（）()【】\[\]·・\-—]+$/;

function extractFoodName(lines: string[], nutritionStartIndex: number): string | null {
  const head = nutritionStartIndex > 0 ? lines.slice(0, nutritionStartIndex) : lines.slice(0, 3);
  const candidates = head
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length >= 3 &&
        l.length <= 24 &&
        !/\d/.test(l) &&
        FOOD_NAME_ALLOWED.test(l) &&
        !/Nutrition|Facts|標示|成分|淨重|每一份|本包裝/i.test(l)
    );
  if (candidates.length === 0) return null;
  // 品名通常緊鄰「營養標示」上方，因此取最後一個通過過濾的候選
  return candidates[candidates.length - 1];
}

/** 成分區段：從「成分」那行開始，取到「淨重／保存／營養標示」為止 */
function extractIngredientLines(lines: string[]): string[] {
  const idx = lines.findIndex((l) => /成分|Ingredients/i.test(l));
  if (idx < 0) return [];

  const out: string[] = [];
  for (let i = idx; i < lines.length && out.length < 8; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (i > idx && /淨重|保存|有效日期|營養標示|過敏原/i.test(l)) break;
    out.push(l);
  }
  return out;
}

/**
 * 否定詞防護。
 *
 * ⚠️ 這是避免「狼來了」的關鍵。
 *    實測一張燕麥片標籤寫著「生產線**無花生**等過敏原」——
 *    若只做關鍵字比對，系統會對一個明確標示「不含花生」的產品發出
 *    ⛔ 花生過敏紅色警報。誤報比漏報更傷害信任，
 *    使用者一旦發現系統會亂叫，就會開始忽略所有警告。
 *
 * 判斷方式：關鍵字前方 6 個字內若出現否定詞，就視為否定敘述。
 */
const NEGATION_RE = /(無|不含|未含|不添加|沒有|未檢出|免|不含|零)/;

function isNegated(text: string, matchIndex: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 6), matchIndex);
  return NEGATION_RE.test(before);
}

/** 是否有「非否定」的命中。用於所有關鍵字偵測，避免把「無 X」讀成「有 X」。 */
function hasPositiveMatch(text: string, pattern: RegExp): boolean {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  for (const m of text.matchAll(global)) {
    if (m.index === undefined) continue;
    if (!isNegated(text, m.index)) return true;
  }
  return false;
}

/**
 * 過敏原關鍵字。
 *
 * ⚠️ 刻意「寧缺勿濫」：這裡的每一條都會變成對使用者的警告，
 *    誤報（狼來了）比漏報更傷害信任，所以只收明確的成分名稱。
 *    例：不收單獨的「魚」（魷魚是貝類）、不收「卵」（大豆卵磷脂不是蛋）、
 *    不收單獨的「麥芽」（麥芽糊精多為玉米來源）。
 *
 * 名稱必須能被 `smartNutritionAnalyzer.ts` 的規則引擎辨識：
 *   花生過敏 → 需含「花生」或「堅果」
 *   海鮮過敏 → 需含「甲殼」「蝦」或「魚」
 *   乳糖不耐 → 需含「牛奶」或「乳」
 *   麩質過敏 → 需含「小麥」或「麩質」
 */
const ALLERGEN_RULES: Array<{ name: string; pattern: RegExp }> = [
  { name: '花生', pattern: /花生|peanut/i },
  { name: '堅果', pattern: /堅果|杏仁|腰果|核桃|榛果|開心果|夏威夷豆/i },
  { name: '甲殼類', pattern: /蝦|蟹|甲殼|龍蝦|螃蟹|crustacean/i },
  { name: '魚類', pattern: /魚露|柴魚|鰹魚|鮪魚|鯖魚|鮭魚|魚肉|魚類|fish/i },
  { name: '貝類', pattern: /干貝|蛤|蜆|蠔|牡蠣|魷魚|花枝|軟絲|mollusk|squid/i },
  {
    name: '牛奶製品',
    pattern: /牛奶|牛乳|奶粉|乳清|酪蛋白|奶油|起司|乳酪|煉乳|milk|whey|casein/i,
  },
  { name: '小麥麩質', pattern: /小麥|麵粉|麩質|大麥|黑麥|wheat|gluten|barley|rye/i },
  { name: '大豆', pattern: /大豆|黃豆|黑豆|豆漿|豆奶|醬油|soy|soya/i },
  { name: '蛋', pattern: /雞蛋|蛋黃|全蛋|egg/i },
  { name: '芝麻', pattern: /芝麻|sesame/i },
];

interface ParsedLabel {
  sodiumMg?: number;
  sugarG?: number;
  carbsG?: number;
  saturatedFatG?: number;
  transFatG?: number;
  calories?: number;
  foodName: string | null;
  ingredientLines: string[];
  /**
   * 用來偵測過敏原的文字。
   *
   * 【為什麼不能只用成分表】
   *   台灣／香港的包裝常把過敏原另外寫成一行「過敏原：本產品含…」，
   *   那一行不會被算進成分區段，只讀成分表會漏掉最重要的警示。
   */
  allergenText: string;
  matchedFields: number;
}

/** 解析 OCR 文字 → 結構化營養欄位。純函式，方便單獨測試。 */
export function parseNutritionLabel(rawText: string): ParsedLabel {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .map(repairDigitConfusions)
    .filter((l) => l.length > 0);

  const { region, startIndex } = extractNutritionRegion(lines);

  const found: Partial<Record<(typeof CORE_FIELDS)[number], number>> = {};

  for (const line of region) {
    for (const rule of FIELD_RULES) {
      // 同一行可能塞了多個項目（OCR 常把兩列併成一行），因此每個規則都獨立找
      for (const key of rule.keys) {
        const at = line.indexOf(key);
        if (at < 0) continue;
        const read = readValueAfter(line, at + key.length);
        if (!read) continue;
        const value = toExpectedUnit(read.value, read.unit, rule.expected);
        if (value === null || !Number.isFinite(value) || value < 0) continue;
        if (found[rule.field] === undefined) found[rule.field] = value;
        break; // 同一條規則命中一次即可
      }
    }
  }

  const ingredientLines = extractIngredientLines(lines);
  const allergenLines = lines.filter((l) => /過敏原|過敏源|allergen/i.test(l));
  const matchedFields = CORE_FIELDS.filter((f) => found[f] !== undefined).length;

  return {
    sodiumMg: found.sodiumMg,
    sugarG: found.sugarG,
    carbsG: found.carbsG,
    saturatedFatG: found.saturatedFatG,
    transFatG: found.transFatG,
    calories: found.calories,
    foodName: extractFoodName(lines, startIndex),
    ingredientLines,
    allergenText: [...ingredientLines, ...allergenLines].join(' '),
    matchedFields,
  };
}

/** 從成分文字推斷普林等級（痛風把關用） */
function inferPurineLevel(text: string): 'high' | 'medium' | 'low' {
  if (/酵母抽出物|肉精|雞粉|高湯|濃縮湯|鰹魚|柴魚|沙丁|內臟|肝|牛肉精|海鮮|蝦|蟹/.test(text)) {
    return 'high';
  }
  if (/黃豆|黑豆|豆漿|豆奶|豆類|菇|蘆筍|紫菜|酵母/.test(text)) return 'medium';
  return 'low';
}

/**
 * 把 OCR 讀出的**原始文字**轉成結構化的辨識結果。
 *
 * 【為什麼要獨立成一個匯出的函式】
 *   OCR 搬到瀏覽器之後，文字是前端送過來的，伺服器不需要（也不該）再碰圖片。
 *   但「文字 → 結果」這一段 —— 包含最重要的**誠實門檻** —— 必須只有一份實作，
 *   否則兩條路徑（瀏覽器 OCR ／ 伺服器 OCR）遲早會給出不一致的判斷。
 */
export function buildRecognitionResult(rawText: string): OcrRecognitionResult {
  const parsed = parseNutritionLabel(rawText);

  // 【誠實門檻】至少讀到 3 個核心欄位，且必須有鈉或糖其中之一。
  // 未達門檻就回 ok=false，讓前端請使用者重拍 —— 絕不用預設值湊出結論。
  const hasKeyNutrient = parsed.sodiumMg !== undefined || parsed.sugarG !== undefined;
  const ok = parsed.matchedFields >= 3 && hasKeyNutrient;

  if (!ok) {
    return {
      ok: false,
      profile: null,
      matchedFields: parsed.matchedFields,
      rawText,
      error: `只讀到 ${parsed.matchedFields} 個營養欄位，不足以判斷`,
    };
  }

  const ingredientText = parsed.allergenText;
  // 用 hasPositiveMatch 而非 pattern.test：「無花生」不能被讀成「有花生」
  const allergens = ALLERGEN_RULES.filter((r) => hasPositiveMatch(ingredientText, r.pattern)).map(
    (r) => r.name
  );

  const profile: NutritionProfile = {
    foodName: parsed.foodName || '這包食品',
    sodiumMg: parsed.sodiumMg ?? 0,
    sugarG: parsed.sugarG ?? 0,
    carbsG: parsed.carbsG ?? 0,
    saturatedFatG: parsed.saturatedFatG ?? 0,
    transFatG: parsed.transFatG ?? 0,
    calories: parsed.calories ?? 0,
    purineLevel: inferPurineLevel(ingredientText),
    hasPhosphates: hasPositiveMatch(ingredientText, /磷酸|多磷酸|焦磷酸|偏磷酸/),
    hasHighPotassium: hasPositiveMatch(
      ingredientText,
      /氯化鉀|鉀|黃豆|黑豆|豆漿|豆奶|菠菜|香蕉/
    ),
    allergens,
    ingredients: parsed.ingredientLines,
  };

  return { ok: true, profile, matchedFields: parsed.matchedFields, rawText };
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
