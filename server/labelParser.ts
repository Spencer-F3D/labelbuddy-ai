/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 標籤文字解析（Label Text Parser）—— 純函式，無任何 Node／瀏覽器 API
 * ============================================================================
 * 【為什麼要獨立成一個檔案】
 *   這一段邏輯同時被三個地方使用：
 *     1. 伺服器端 OCR（server/ocrLabel.ts，命令列實測用）
 *     2. 伺服器端的文字模式（server/core.ts，前端送來 OCR 文字時）
 *     3. Cloudflare Worker（部署上線用）
 *   Worker 的執行環境沒有 Node 的 fs／path／os，也不該打包 tesseract.js。
 *   把純解析邏輯獨立出來，Worker 才能只引入需要的部分。
 *
 * 【誠實原則（本專案最重要的一條規則）】
 *   讀不到足夠的營養欄位時，**絕不用預設值補齊**，一律回傳 ok=false，
 *   由呼叫端請使用者重拍。寧可說「看不清楚」，也不要給出捏造的結論。
 */

import type { NutritionProfile } from './smartNutritionAnalyzer';

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
 *
 * ⚠️⚠️ 英文鍵**不能有空白**：`normalizeLine()` 會先把整行空白拿掉，
 *    所以「Saturated Fat」在比對時其實是「SaturatedFat」。
 *    寫成 "Saturated Fat" 永遠比對不到（而且不會報錯，只會少讀一個欄位）。
 *
 * 【為什麼要加英文鍵】（2026-09-29）
 *    示範標籤改成雙語後，英文標籤在**本機引擎**（預設路徑）下完全解析不出來：
 *    實測中文標籤讀到 6 個欄位，英文標籤讀到 **0 個**，
 *    於是英文模式永遠顯示「看不清楚標籤數字」—— 示範反而變成展示失敗。
 *    過敏原規則本來就有英文（peanut／milk／wheat），只有這一張表漏了。
 */
const FIELD_RULES: Array<{
  field: 'sodiumMg' | 'sugarG' | 'carbsG' | 'saturatedFatG' | 'transFatG' | 'calories';
  keys: string[];
  expected: Unit;
}> = [
  { field: 'saturatedFatG', keys: ['飽和脂肪', '饱和脂肪', 'saturatedfat'], expected: 'g' },
  { field: 'transFatG', keys: ['反式脂肪', 'transfat'], expected: 'g' },
  {
    field: 'carbsG',
    keys: ['碳水化合物', '碳水', 'carbohydrate', 'totalcarbohydrate'],
    expected: 'g',
  },
  { field: 'calories', keys: ['熱量', '热量', 'calories', 'energy'], expected: 'kcal' },
  // 鈉與「納」形近，OCR 很常認錯，兩個都收
  { field: 'sodiumMg', keys: ['鈉', '纳', 'sodium'], expected: 'mg' },
  // 糖放最後：避免「糖」在別的欄位名稱裡被先讀走
  { field: 'sugarG', keys: ['糖', 'sugars', 'sugar'], expected: 'g' },
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
    (l, i) =>
      i > 0 && /成分|Ingredients|過敏原|過敏源|Allergens|淨重|保存|有效日期|注意事項/i.test(l)
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
    if (i > idx && /淨重|保存|有效日期|營養標示|過敏原|Allergens/i.test(l)) break;
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
    // ⚠️ 英文鍵一律轉小寫比對：OCR 對大小寫並不穩定，
    //    同一張標籤可能讀成 Sodium / SODIUM / sodium。
    //    中文沒有大小寫，所以這個轉換對中文路徑完全無害。
    const lower = line.toLowerCase();
    for (const rule of FIELD_RULES) {
      // 同一行可能塞了多個項目（OCR 常把兩列併成一行），因此每個規則都獨立找
      for (const key of rule.keys) {
        const at = lower.indexOf(key);
        if (at < 0) continue;
        // 用原始行讀數值（`line` 才是保留大小寫與符號的那一份）
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
