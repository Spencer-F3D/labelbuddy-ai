/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 為了讓長者或測試者即使手邊沒有實體食品，也能一鍵體驗「超市食品放大鏡」的功能，
// 我們提供三種真實超市常見食品的標籤範例（含真實食品營養成分表）。

export interface SampleFood {
  id: string;
  name: string;
  category: string;
  tag: string;
  tagColor: string;
  dataUrl: string;
}

/** 標籤的輸出語言。示範標籤會被「畫成圖片」，所以語言必須在繪製時就決定。 */
export type SampleLang = 'zh-TW' | 'en';

/** 示範標籤的內容 */
export interface DemoLabelContent {
  title: string;
  details: {
    serving: string;
    calories: string;
    sodium: string;
    sugar: string;
    carbs: string;
    allergens: string;
    ingredients: string;
  };
}

/**
 * 示範標籤的完整內容（中／英各一份）。
 *
 * 【為什麼要兩份，而不是只翻標題】
 *   這些文字會被**畫進圖片**（Canvas），所以英文評審點「示範標籤」時，
 *   看到的就是這裡的內容。只翻標題、數值仍是中文的話，圖片上還是中文。
 *
 * 【英文數值的長度有特別收斂】
 *   英文比中文長 2～3 倍。像「2,350 毫克 (⚠️ 高達一日上限 118%)」
 *   直譯成 "2,350 mg (⚠️ as much as 118% of the daily limit)" 會擠壓版面，
 *   所以改用 "2,350 mg (⚠️ 118% of daily limit)" —— 意思一樣但短得多。
 *   （繪製端另有自動縮字保護，見 `fitFontSize`。）
 */
export const DEMO_LABELS: Record<SampleLang, Record<'ramen' | 'oatmeal', DemoLabelContent>> = {
  'zh-TW': {
    ramen: {
      title: '【超重鹹】特濃紅燒牛肉泡麵',
      details: {
        serving: '100公克 (每包一份)',
        calories: '495 大卡',
        sodium: '2,350 毫克 (⚠️ 高達一日上限 118%)',
        sugar: '8.5 公克',
        carbs: '62.0 公克',
        allergens: '本產品含有小麥、大豆、花生油及牛肉成分。',
        ingredients: '油炸麵條、棕櫚油、精鹽、味精、醬油粉、辣椒粉、花生油香料、防腐劑。',
      },
    },
    oatmeal: {
      title: '【高纖健康】純天然有機大燕麥片',
      details: {
        serving: '50公克 (每包一份)',
        calories: '185 大卡',
        sodium: '2 毫克 (✅ 幾乎無鈉)',
        sugar: '0.6 公克 (✅ 無添加精緻糖)',
        carbs: '33.5 公克 (含豐富β-葡聚醣膳食纖維)',
        allergens: '本產品含有燕麥。生產線無花生等過敏原。',
        ingredients: '100% 純天然全粒大燕麥片。',
      },
    },
  },
  en: {
    ramen: {
      title: 'Extra-salty rich braised beef instant noodles',
      details: {
        serving: '100 g (1 serving per pack)',
        calories: '495 kcal',
        sodium: '2,350 mg (⚠️ 118% of daily limit)',
        sugar: '8.5 g',
        carbs: '62.0 g',
        allergens: 'Contains wheat, soy, peanut oil and beef.',
        ingredients:
          'Fried noodles, palm oil, refined salt, MSG, soy sauce powder, chilli powder, peanut oil flavouring, preservatives.',
      },
    },
    oatmeal: {
      title: 'High-fibre pure organic wholegrain oats',
      details: {
        serving: '50 g (1 serving per pack)',
        calories: '185 kcal',
        sodium: '2 mg (✅ almost no sodium)',
        sugar: '0.6 g (✅ no added refined sugar)',
        carbs: '33.5 g (rich in β-glucan fibre)',
        allergens: 'Contains oats. No peanuts on the production line.',
        ingredients: '100% pure wholegrain oats.',
      },
    },
  },
};

/**
 * 標籤上固定文字的雙語對照。
 *
 * ⚠️ 為什麼不能像 UI 那樣用 `t()`：
 *    這裡的文字是**畫進 Canvas 的像素**，不是 DOM 節點。
 *    Canvas 沒有 React context，所以只能在繪製時把語言當參數傳進來。
 */
const LABELS: Record<SampleLang, {
  nutritionTitle: string;
  servingPrefix: string;
  caloriesLabel: string;
  carbs: string;
  sugars: string;
  sodium: string;
  ingredients: string;
  allergens: string;
}> = {
  'zh-TW': {
    nutritionTitle: 'Nutrition Facts 營養標示',
    servingPrefix: '每一份量：',
    caloriesLabel: '每份熱量',
    carbs: '碳水化合物 (Carbohydrate)',
    sugars: '  其中 糖 (Sugars)',
    sodium: '鈉 (Sodium)',
    ingredients: '主要成分：',
    allergens: '⚠️ 過敏原標示：',
  },
  en: {
    nutritionTitle: 'Nutrition Facts',
    servingPrefix: 'Per serving: ',
    caloriesLabel: 'Calories',
    carbs: 'Carbohydrate',
    sugars: '   of which Sugars',
    sodium: 'Sodium',
    ingredients: 'Ingredients:',
    allergens: '⚠️ Allergens: ',
  },
};

/** 畫布尺寸與邊界（單一來源，避免各處硬編碼數字漂移） */
const W = 600;
const H = 700;
const PAD = 36;
const RIGHT = W - PAD; // 564
const CONTENT_W = RIGHT - PAD; // 528

/**
 * 版面配置（y 座標）。
 *
 * 【為什麼要集中成一張表】
 *   原本的座標散落在繪製流程裡，改一處就要往下順推，
 *   很容易出現「某兩列疊在一起」而沒有任何錯誤訊息。
 *   集中之後，調整間距只要改這裡。
 *
 * 【為什麼數字比原本大】
 *   原本內容只畫到 y≈510，下方 190px 全是空白，
 *   看起來像標籤被截斷。這裡把行距拉開，讓內容填滿畫布，
 *   更像一張真實的包裝標籤。
 */
const LAYOUT = {
  title: 74,
  nutritionTitle: 140,
  rule1: 158,
  serving: 202,
  rule2: 220,
  row1: 260,
  ruleRow1: 278,
  row2: 314,
  ruleRow2: 332,
  row3: 368,
  ruleRow3: 386,
  calories: 422,
  ruleCalories: 440,
  ingredients: 482,
  ingredientStart: 516,
  ingredientStep: 28,
  allergenGap: 46,
  allergenStep: 30,
} as const;

/**
 * 量測文字寬度，必要時縮小字級直到放得下。
 *
 * 【為什麼需要這個】
 *   原本的座標是為中文調的（中文一個字約等於一個全形寬，長度好預測）。
 *   換成英文後，像 `2,350 mg (118% of daily limit)` 這種數值會直接衝出畫布右緣，
 *   而且 Canvas **不會報錯、也不會換行** —— 只會默默被裁掉，非常難察覺。
 *   所以這裡改成「先量、放不下就縮」，讓任何長度的文字都能安全落版。
 *
 * @returns 實際可用的字級（px）
 */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  fontSpec: (size: number) => string,
  minSize = 11
): number {
  let size = startSize;
  ctx.font = fontSpec(size);
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = fontSpec(size);
  }
  return size;
}

/**
 * 依語言換行。
 *
 * 【為什麼不能沿用「逐字切」】
 *   原本的 `text.split('')` 對中文是對的（中文沒有詞界），
 *   但對英文會把單字從中間切斷（`instand` / `noodles`），看起來像亂碼。
 *   所以英文改成**以空白為界**斷行，中文維持逐字。
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lang: SampleLang
): string[] {
  const lines: string[] = [];

  if (lang === 'en') {
    // 英文：逐詞累積，超過寬度就換行。長度仍超過一行的單詞單獨成行（不硬切）。
    let current = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // 中文：逐字累積
  let current = '';
  for (const ch of text) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// 產生清晰的模擬食品營養成分表圖片（透過 Canvas 繪製成 DataURL）
export function generateSampleLabelDataUrl(
  title: string,
  details: {
    serving: string;
    calories: string;
    sodium: string;
    sugar: string;
    carbs: string;
    allergens: string;
    ingredients: string;
  },
  lang: SampleLang = 'zh-TW'
): string {
  if (typeof document === 'undefined') return '';

  const L = LABELS[lang];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 白色底卡
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // 灰色邊框
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  // 標題（英文商品名較長 → 自動縮字，不會被裁掉）
  ctx.fillStyle = '#000000';
  fitFontSize(ctx, title, CONTENT_W, 30, (s) => `bold ${s}px sans-serif`, 16);
  ctx.fillText(title, PAD, LAYOUT.title);

  // 營養標示大字
  ctx.fillStyle = '#000000';
  fitFontSize(ctx, L.nutritionTitle, CONTENT_W, 38, (s) => `bold ${s}px sans-serif`, 20);
  ctx.fillText(L.nutritionTitle, PAD, LAYOUT.nutritionTitle);

  // 粗黑分隔線
  ctx.fillRect(PAD, LAYOUT.rule1, CONTENT_W, 8);

  // 每一份量（含前綴，整串一起縮字）
  const servingText = `${L.servingPrefix}${details.serving}`;
  fitFontSize(ctx, servingText, CONTENT_W, 22, (s) => `${s}px sans-serif`, 13);
  ctx.fillText(servingText, PAD, LAYOUT.serving);
  ctx.fillRect(PAD, LAYOUT.rule2, CONTENT_W, 2);

  /**
   * 畫一列「標籤 + 數值」。
   *
   * 數值改為**靠右對齊**並自動縮字：
   * 原本固定畫在 x=420，中文數值短剛好，英文長度是中文的 2～3 倍就會溢出。
   */
  const drawRow = (label: string, val: string, y: number, bold: boolean, labelSize: number) => {
    const weight = bold ? 'bold ' : '';
    const labelFont = (s: number) => `${weight}${s}px sans-serif`;

    // 先量數值（靠右），剩下的寬度才給標籤
    const valSize = fitFontSize(ctx, val, CONTENT_W * 0.55, 24, labelFont, 13);
    const valWidth = ctx.measureText(val).width;

    const labelMax = CONTENT_W - valWidth - 16;
    const usedLabelSize = fitFontSize(ctx, label, labelMax, labelSize, labelFont, 13);

    ctx.font = labelFont(usedLabelSize);
    ctx.fillText(label, PAD, y);

    ctx.font = labelFont(valSize);
    ctx.textAlign = 'right';
    ctx.fillText(val, RIGHT, y);
    ctx.textAlign = 'left';
  };

  // 各項指標
  ctx.fillStyle = '#000000';
  drawRow(L.carbs, details.carbs, LAYOUT.row1, false, 22);
  ctx.fillRect(PAD, LAYOUT.ruleRow1, CONTENT_W, 2);
  drawRow(L.sugars, details.sugar, LAYOUT.row2, true, 22);
  ctx.fillRect(PAD, LAYOUT.ruleRow2, CONTENT_W, 1);
  drawRow(L.sodium, details.sodium, LAYOUT.row3, true, 22);
  ctx.fillRect(PAD, LAYOUT.ruleRow3, CONTENT_W, 1);

  // 熱量（與其他列同格式，靠右對齊）
  drawRow(L.caloriesLabel, details.calories, LAYOUT.calories, true, 24);
  ctx.fillRect(PAD, LAYOUT.ruleCalories, CONTENT_W, 4);

  // 成分說明
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(L.ingredients, PAD, LAYOUT.ingredients);
  ctx.font = '18px sans-serif';
  const ingLines = wrapText(ctx, details.ingredients, CONTENT_W, lang);
  let ingY = LAYOUT.ingredientStart;
  for (const line of ingLines) {
    ctx.fillText(line, PAD, ingY);
    ingY += LAYOUT.ingredientStep;
  }

  // 過敏原警示（同樣自動縮字，避免長句被裁掉）
  ctx.fillStyle = '#B91C1C';
  const allergenText = `${L.allergens}${details.allergens}`;
  // ⚠️ 順序很重要：必須**先定字級、再算換行**。
  //    顛倒的話換行會用舊字型量寬度，但實際繪製用新字型 → 行長與版面不符。
  const allergenSize = fitFontSize(
    ctx,
    allergenText,
    CONTENT_W,
    20,
    (s) => `bold ${s}px sans-serif`,
    12
  );
  ctx.font = `bold ${allergenSize}px sans-serif`;
  const allergenLines = wrapText(ctx, allergenText, CONTENT_W, lang);
  let algY = ingY - LAYOUT.ingredientStep + LAYOUT.allergenGap;
  for (const line of allergenLines) {
    ctx.fillText(line, PAD, algY);
    algY += Math.max(allergenSize + 6, LAYOUT.allergenStep);
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}
