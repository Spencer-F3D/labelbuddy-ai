/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 慢性病專屬提醒（Condition Reminders）
 * ============================================================================
 * 【這是什麼】
 *   使用者勾選的每一項慢性病，除了影響「風險判斷」之外，
 *   還應該回一句**針對那個病、可以馬上用在超市裡的白話提醒**。
 *
 *   例：勾了「高血壓」→ 回「鈉就是鹽分，一天不要超過 2000 毫克，先看『鈉』那一列。」
 *
 * 【與 smartNutritionAnalyzer.ts 的差別】
 *   - `smartNutritionAnalyzer.ts`：判斷「這一包」能不能買（會給紅／黃／綠）
 *   - 本模組：給「這個病」的通用提醒，與產品無關
 *   兩者互補：前者說「這包不行」，後者說「那要怎麼挑」。
 *
 * ⚠️ 【名稱必須用中文關鍵字比對，不是 id】
 *   本專案的後端一貫用中文子字串比對（見交接文件 §3.4）。
 *   若 `src/data/conditions.ts` 的 name 改成不含關鍵字的說法，
 *   這裡會**靜默地少一句提醒**——不報錯、不當機。
 *   因此找不到規則時會回一句通用的保守提醒，並在伺服器日誌留下警告，
 *   讓「漏掉」變成看得見的事件。
 */

import type { ConditionReminder } from '../src/types';

interface ReminderRule {
  /** 中文關鍵字，任一命中即可（沿用全專案的子字串比對慣例） */
  keys: string[];
  /** 三重編碼用的圖示（不能只靠顏色） */
  icon: string;
  /** 一句白話提醒，回答「那我要怎麼挑」 */
  advice: string;
}

/**
 * 12 項慢性病／過敏原的提醒規則。
 *
 * ⚠️ 這份清單必須涵蓋 `src/data/conditions.ts` 的全部 12 項。
 *    新增慢性病時要一起加，並跑 `npm run verify:conditions` 確認沒有漏。
 */
const REMINDER_RULES: ReminderRule[] = [
  {
    keys: ['高血壓'],
    icon: '🫀',
    advice: '鈉就是鹽分。先看包裝上的「鈉」那一列，一天不要超過 2000 毫克，湯汁和醬料要少碰。',
  },
  {
    keys: ['糖尿病', '血糖'],
    icon: '🩸',
    advice: '先看「糖」那一列，一天不要超過 50 公克。成分表裡越前面出現糖、糖漿、糊精就越要小心。',
  },
  {
    keys: ['高血脂', '膽固醇'],
    icon: '🫀',
    advice: '先看「飽和脂肪」和「反式脂肪」。棕櫚油、人造奶油、氫化植物油都算不好的油。',
  },
  {
    keys: ['痛風', '尿酸'],
    icon: '🦶',
    advice: '避開濃縮高湯、肉精粉、酵母抽出物與內臟類成分，含糖飲料也會讓尿酸排不掉。',
  },
  {
    keys: ['腎臟'],
    icon: '🫘',
    advice: '鈉、鉀、磷三個都要看。成分表出現「磷酸」「多磷酸」這類品質改良劑就先放回去。',
  },
  {
    keys: ['心血管'],
    icon: '❤️',
    advice: '重油重鹽與加工紅肉都要減量。反式脂肪即使標示 0，也可能來自氫化油，要看成分表。',
  },
  {
    keys: ['胃食道', '胃潰瘍', '逆流'],
    icon: '🔥',
    advice: '辣椒、黑胡椒、薄荷、咖啡因與油炸物都容易引起火燒心，睡前兩小時不要吃。',
  },
  {
    keys: ['骨質疏鬆'],
    icon: '🦴',
    advice: '鹽分會把骨頭裡的鈣帶走，碳酸飲料與重鹹零食要少。補鈣要配足夠的日曬與活動。',
  },
  {
    keys: ['花生', '堅果'],
    icon: '⛔',
    advice: '【嚴重過敏】買之前一定要看「過敏原」那一行。標示「本產線也處理花生」的也不能碰。',
  },
  {
    keys: ['海鮮', '甲殼'],
    icon: '⛔',
    advice: '【嚴重過敏】蝦蟹、貝類、魚露、蝦醬都要避開，並注意「產線交叉污染」的警語。',
  },
  {
    keys: ['乳糖', '牛奶'],
    icon: '🥛',
    advice: '牛奶、奶粉、乳清蛋白、奶油都要避開。想補蛋白質可以選豆漿或豆腐。',
  },
  {
    keys: ['麩質', '小麥'],
    icon: '🌾',
    advice: '小麥、大麥、黑麥與麵粉製品都要避開。燕麥要選標示「無麩質」的，避免產線污染。',
  },
];

/** 找不到對應規則時的保守提醒（寧可說得籠統，也不要靜默消失） */
const GENERIC_REMINDER: Omit<ReminderRule, 'keys'> = {
  icon: '📋',
  advice: '這個項目目前沒有專屬提醒。請以包裝上的營養標示為準，有疑問請詢問您的醫師或營養師。',
};

/**
 * 依使用者勾選的慢性病清單產生提醒。
 *
 * @param conditions 慢性病的中文名稱陣列（由前端傳入）
 * @returns 與輸入順序相同、每個項目都有對應提醒的陣列
 */
export function buildConditionReminders(conditions: string[]): ConditionReminder[] {
  if (!Array.isArray(conditions)) return [];

  return conditions
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    .map((condition) => {
      const rule = REMINDER_RULES.find((r) => r.keys.some((k) => condition.includes(k)));
      if (rule) {
        return { condition, icon: rule.icon, advice: rule.advice };
      }
      // 讓「漏掉」變成看得見的事件：條件名稱可能被改到失去關鍵字了
      console.warn(
        `[conditionAdvice] 慢性病「${condition}」找不到對應提醒規則 —— ` +
          '請確認 src/data/conditions.ts 的名稱仍含 REMINDER_RULES 的關鍵字。'
      );
      return { condition, icon: GENERIC_REMINDER.icon, advice: GENERIC_REMINDER.advice };
    });
}

/** 供驗證腳本使用：取得所有已定義的關鍵字 */
export function getReminderKeywords(): string[] {
  return REMINDER_RULES.flatMap((r) => r.keys);
}
