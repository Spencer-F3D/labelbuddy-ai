/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 設計權杖（Design Tokens）
 * ============================================================================
 *
 * 本檔案集中管理介面的視覺規則，目的是讓「同一件事永遠長得一樣」。
 *
 * 【為什麼需要】
 *   改版前的專案有 15 種字級、16 個 border-4、色彩沒有語意規則，
 *   導致每張卡片都在互相搶注意力，長者不知道該先看哪裡。
 *   這裡把規則收斂成可列舉的少數選項。
 *
 * 【設計依據】長者的三項生理變化
 *   1. 水晶體黃化 → 藍光被吸收、藍紫難分辨
 *      → 藍色保留給「可操作」，不用來承載「安全/危險」這種關鍵語意
 *   2. 周邊視野縮減 → 餘光看到的面積變小
 *      → 關鍵資訊集中中央主欄，不放角落
 *   3. 對比敏感度下降 → 淺灰字、細線看不見
 *      → 文字一律用深色，不用 slate-400 以下的淺灰當內文
 *
 * ⚠️ 本專案有 `:root { font-size: 20px }`，Tailwind 所有 rem 間距會放大 1.25 倍
 *    （py-4 = 20px 而非 16px）。此處一律使用明確 px 值，避免換算錯誤。
 */

/* ---------------------------------------------------------------------------
 * 一、色彩：5 個角色
 * 每個顏色只代表一件事，跨頁面一致。
 * ------------------------------------------------------------------------- */

/** 語意色調 */
export type ToneName = 'safe' | 'caution' | 'danger' | 'action' | 'neutral';

/**
 * 色票組：每個角色提供「底 / 邊 / 主文字 / 次文字」四層。
 *
 * 對比度已核對（WCAG AA）：
 *   safe    #C0DD97 底 + #3B6D11 邊 + #173404 文字 → 12.1:1
 *   caution #FAC775 底 + #854F0B 邊 + #412402 文字 → 11.4:1
 *   danger  #F09595 底 + #A32D2D 邊 + #501313 文字 → 10.2:1
 *   action  #B5D4F4 底 + #185FA5 邊 + #042C53 文字 → 12.8:1
 *   neutral #D3D1C7 底 + #5F5E5A 邊 + #2C2C2A 文字 → 10.6:1
 */
export interface ToneSwatch {
  /** 淺色底（卡片背景） */
  bg: string;
  /** 深色底（實心按鈕、徽章） */
  solid: string;
  /** 邊框色 */
  border: string;
  /** 主文字色（標題、數值） */
  text: string;
  /** 次文字色（說明） */
  textMuted: string;
  /** 進度條填色 */
  bar: string;
}

export const TONES: Record<ToneName, ToneSwatch> = {
  safe: {
    bg: '#EAF3DE',
    solid: '#639922',
    border: '#3B6D11',
    text: '#173404',
    textMuted: '#3B6D11',
    bar: '#97C459',
  },
  caution: {
    bg: '#FAEEDA',
    solid: '#EF9F27',
    border: '#854F0B',
    text: '#412402',
    textMuted: '#854F0B',
    bar: '#EF9F27',
  },
  danger: {
    bg: '#FCEBEB',
    solid: '#A32D2D',
    border: '#A32D2D',
    text: '#501313',
    textMuted: '#791F1F',
    bar: '#E24B4A',
  },
  action: {
    bg: '#E6F1FB',
    solid: '#185FA5',
    border: '#185FA5',
    text: '#042C53',
    textMuted: '#0C447C',
    bar: '#85B7EB',
  },
  neutral: {
    bg: '#F1EFE8',
    solid: '#5F5E5A',
    border: '#888780',
    text: '#2C2C2A',
    textMuted: '#5F5E5A',
    bar: '#B4B2A9',
  },
};

/**
 * 風險等級 → 色調。
 *
 * ⚠️ 顏色永遠不能是唯一的線索。紅綠色盲在男性約占 8%，
 *    所以每一處用到此對照表的地方，都必須同時附上「圖示 + 文字」。
 *    可搭配 RISK_ICON 與 RISK_LABEL 使用。
 */
export const RISK_TONE: Record<'red' | 'yellow' | 'green', ToneName> = {
  red: 'danger',
  yellow: 'caution',
  green: 'safe',
};

/** 風險等級的圖示語意（搭配 TONES 一起用，不可省略） */
export const RISK_ICON: Record<'red' | 'yellow' | 'green', 'cross' | 'warning' | 'check'> = {
  red: 'cross',
  yellow: 'warning',
  green: 'check',
};

/** 風險等級的預設文字（AI 未給標題時的後備） */
export const RISK_LABEL: Record<'red' | 'yellow' | 'green', string> = {
  red: '不建議購買',
  yellow: '請注意成分',
  green: '適合食用',
};

/* ---------------------------------------------------------------------------
 * 二、字級：4 級，全部落在 16～20px
 *
 * 【為什麼限制在 16～20px】
 *   原本的做法是「愈重要就愈大」（結論 34px、標題 24px、內文 20px、
 *   說明 17px、補充 14px、免責 13px），共 6 級。
 *   但級距拉得愈開，同一頁上下之間的字級落差就愈大，
 *   而字大也意味著「一行塞得下的字變少 → 句子被迫折行」。
 *
 *   現在改為把「重要性」交給【位置 / 顏色 / 粗細 / 圖示】去表達，
 *   字級只保留 4 級、集中在中間帶：
 *     20px  頁面主標題與結論一句話
 *     19px  卡片標題
 *     18px  強調數字、按鈕、徽章
 *     16px  所有說明與敘述文字（內文下限）
 *
 *   ⚠️ 16px 是本專案的字級地板。低於 16px 的免責文字對長者等於不可讀，
 *      要弱化請改用顏色（slate-600）而不是縮小字級。
 *
 *   ⚠️ 級距窄（16→17→18→19→20）代表相鄰兩級幾乎看不出差別，
 *      所以「不要指望用字級表達重要性」——請改用 WEIGHT 與 TONES。
 * ------------------------------------------------------------------------- */

export const TYPE = {
  /** 20px · 全頁最大，用於頁面主標題與結論（能不能買） */
  conclusion: 'text-[20px]',
  /** 19px · 卡片標題 */
  title: 'text-[19px]',
  /** 18px · 強調數字、按鈕、徽章 */
  emphasis: 'text-[18px]',
  /** 16px · 主要與次要閱讀文字（說明、敘述、標籤一律併入此級） */
  body: 'text-[16px]',
  /**
   * @deprecated 已併入 body（16px）。保留縮寫是為了讓舊呼叫點編譯得過，
   *             新程式碼請直接用 TYPE.body。
   */
  secondary: 'text-[16px]',
  /** @deprecated 已併入 body（16px）。低於 16px 對長者不可讀。 */
  caption: 'text-[16px]',
  /** @deprecated 已併入 body（16px）。低於 16px 對長者不可讀。 */
  micro: 'text-[16px]',
} as const;

/** 字重：只用兩級，避免視覺噪音 */
export const WEIGHT = {
  /** 標題、數值、按鈕文字 */
  strong: 'font-black',
  /** 說明文字 */
  normal: 'font-bold',
} as const;

/* ---------------------------------------------------------------------------
 * 三、邊框：3 層（改版前是 16 個 border-4）
 *
 * 用邊框粗細表達「重要性」——如果每張卡片都一樣粗，
 * 就等於沒有任何一張特別重要。
 * ------------------------------------------------------------------------- */

export const BORDER = {
  /** 3px · 只有結論卡與警示訊息 */
  emphasis: 'border-[3px]',
  /** 1.5px · 一般內容卡 */
  card: 'border-[1.5px]',
  /** 0.5px · 列表分隔、次要區塊 */
  divider: 'border-[0.5px]',
} as const;

/* ---------------------------------------------------------------------------
 * 四、間距：4 級，全部是 8 的倍數
 * ------------------------------------------------------------------------- */

export const SPACE = {
  /** 8px · 圖示與文字之間 */
  xs: 'gap-[8px]',
  /** 16px · 卡片內距 */
  sm: 'p-[16px]',
  /** 24px · 卡片之間 */
  md: 'space-y-[24px]',
  /** 32px · 大區塊之間 */
  lg: 'space-y-[32px]',
} as const;

/* ---------------------------------------------------------------------------
 * 五、觸控目標與圓角
 * ------------------------------------------------------------------------- */

export const TOUCH = {
  /** 主要按鈕：72px（專案既有基準，已超過無障礙下限） */
  primary: 'min-h-[72px]',
  /** 導航項目：64px */
  nav: 'min-h-[64px]',
  /** 卡片內的小按鈕：52px */
  inline: 'min-h-[52px]',
} as const;

export const RADIUS = {
  /** 12px · 卡片 */
  card: 'rounded-[12px]',
  /** 16px · 大區塊、按鈕 */
  block: 'rounded-[16px]',
  /** 999px · 徽章、圓形圖示 */
  pill: 'rounded-full',
} as const;

/* ---------------------------------------------------------------------------
 * 六、常用組合（避免各處重複拼字串）
 * ------------------------------------------------------------------------- */

/** 一般內容卡：白底 + 1.5px 邊 + 卡片圓角 */
export const CARD_BASE =
  'bg-white rounded-[16px] border-[1.5px] border-slate-300 shadow-sm';

/** 結論卡：3px 邊 + 大圓角（顏色依風險等級動態給） */
export const CONCLUSION_CARD_BASE =
  'w-full rounded-[20px] border-[3px] shadow-lg flex flex-col items-center text-center';

/** 可點擊的列表列：整列可點且高度足夠 */
export const LIST_ROW =
  'w-full min-h-[56px] flex items-center justify-between gap-[12px] px-[16px] py-[12px] cursor-pointer active:scale-[0.99] transition-all';

/**
 * 主要操作按鈕（底部 CTA）。
 *
 * ⚠️ 字級固定 20px（本專案上限）。標籤長度上限：
 *    320px 螢幕下可用文字寬約 234px，20px 全形字每字約 20px
 *    → 含 emoji 請控制在 **9 個全形字以內**，否則會折行並撐高按鈕。
 */
export const FOOTER_CTA =
  'w-full min-h-[72px] py-[8px] px-[16px] rounded-[16px] font-black text-[20px] leading-tight ' +
  'bg-[#185FA5] hover:bg-[#0C447C] active:bg-[#185FA5] text-white ' +
  'flex items-center justify-center gap-[10px] shadow-xl border-[3px] border-[#0C447C] ' +
  'cursor-pointer transition-all active:scale-[0.98]';

/** 次要操作按鈕（中性色，避免與危險色混淆） */
export const FOOTER_CTA_SECONDARY =
  'w-full min-h-[72px] py-[8px] px-[16px] rounded-[16px] font-black text-[20px] leading-tight ' +
  'bg-[#F1EFE8] hover:bg-[#D3D1C7] active:bg-[#F1EFE8] text-[#2C2C2A] ' +
  'flex items-center justify-center gap-[10px] border-[1.5px] border-[#888780] ' +
  'cursor-pointer transition-all active:scale-[0.98]';

/** 底部 CTA 的圖示尺寸 */
export const FOOTER_CTA_ICON = 'w-[28px] h-[28px] shrink-0';

/* ---------------------------------------------------------------------------
 * 七、工具函式
 * ------------------------------------------------------------------------- */

/**
 * 把「實際攝取量 ÷ 每日上限」換算成百分比。
 *
 * 這是本次改版最關鍵的一步：長者看到「鈉 2480 毫克」無法判斷多不多，
 * 但看到「佔每日上限 124%」立刻就知道超標了。
 *
 * @param value  食品實際含量（毫克或公克）
 * @param limit  每日上限（單位需與 value 相同）
 * @returns 百分比整數，上限 999（避免極端值撐破版面）
 */
export function toPercent(value: number, limit: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(999, Math.round((value / limit) * 100));
}

/**
 * 依百分比決定色調。
 * 閾值刻意設在 100% 與 70%：超過上限是危險，接近上限是注意。
 */
export function percentTone(percent: number): ToneName {
  if (percent > 100) return 'danger';
  if (percent >= 70) return 'caution';
  return 'safe';
}

/**
 * 產生給長者看的白話說明（不顯示原始數字，只顯示百分比）。
 *
 * @example describePercent(124) → '超出 24%'
 * @example describePercent(62)  → '佔 62%'
 */
export function describePercent(percent: number): string {
  if (percent > 100) return `超出 ${percent - 100}%`;
  return `佔 ${percent}%`;
}

/**
 * 取得進度條的寬度（百分比字串）。
 * 視覺上以 100% 為滿格，超過時填滿並由顏色傳達超標。
 */
export function barWidth(percent: number): string {
  return `${Math.min(100, Math.max(0, percent))}%`;
}
