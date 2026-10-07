/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 慢性病 → 中性成分約束（Condition → neutral ingredient constraints）
 * ============================================================================
 * 【這個檔案解決什麼問題】
 *   原本提示詞裡有一行 `【使用者的慢性病史】高血壓、糖尿病` ——
 *   **病名直接送到 AI 供應商**（Gemini／OpenRouter）。
 *
 *   但 AI 真正需要知道的不是「你得了什麼病」，而是「**要盯哪些成分**」。
 *   兩者可以分開：
 *     · 送給 AI：`鈉、添加糖、飽和脂肪…`（中性成分約束）
 *     · 給使用者看：`高血壓（太鹹危險）`（後端規則產生，不經過 AI）
 *
 *   → 送出去的資訊從「病名」降級成「成分」，AI 仍然知道要盯什麼，
 *     但不知道使用者有高血壓、糖尿病或花生過敏。
 *
 * 【資料來源：現成的，不必新增】
 *   `src/data/conditions.ts` 的 19 項條件**本來就有** `targetNutrients`，
 *   格式是 `'鈉 (Sodium)'`、`'花生 (Peanuts)'` —— 中英各取所需。
 *
 * 【⚠️ 這個模組是純函式、零網路】
 *   放在 `src/data/` 而不是 `server/`，因為：
 *     ① 它與 `conditions.ts` 同源，改資料時一眼就看到
 *     ② 未來前端若要顯示「我們送出了什麼」也能直接用
 */

import type { Language } from '../i18n/translations';
import { PHYSICAL_INDICATORS } from './conditions';
import { LABEL_KEYS } from './labelKeys';

/** 一個目標成分的中英兩種寫法 */
export interface TargetNutrient {
  zh: string;
  en: string;
}

/**
 * 把 `'鈉 (Sodium)'` 拆成 `{ zh: '鈉', en: 'Sodium' }`。
 *
 * 【資料格式的約定】括號裡**一律是英文名**。
 *   這不是理所當然的 —— 原本有 4 筆不是：
 *     `'味精 (L-麩酸鈉)'`（中文化學名）、`'亞硝酸鹽 (加工肉)'`、
 *     `'超量鈉鹽 (加速排鈣)'`（中文解釋）
 *   照這個函式拆，英文模式就會吐出「L-麩酸鈉」這種中文當成英文名
 *   → 中文進了提示詞 → AI 可能抄進輸出 → **英文介面漏中文**。
 *   已在 2026-10-07 全部改正（化學名併進中文那一半，解釋本來就在 `description` 裡）。
 *   `scripts/check-prompt-privacy.ts` 有斷言守住「英文模式零中文」。
 *
 * ⚠️ 沒帶括號的項目（例如 `'食鹽'`）原本**中英同名** ——
 *    那些是「食品成分的俗名」，沒有對應的英文單字。
 *    2026-10-07 已全部補上英文（`'食鹽 (Table salt)'`），
 *    所以現在 65 個項目都有英文名。
 */
export function parseTargetNutrient(raw: string): TargetNutrient {
  const text = String(raw ?? '').trim();
  const m = /^(.+?)\s*\((.+)\)$/.exec(text);
  if (m) return { zh: m[1].trim(), en: m[2].trim() };
  return { zh: text, en: text };
}

export interface ExpandedConditions {
  /** 去重後的目標成分（已依 `LABEL_KEYS` 的優先序排序） */
  nutrients: string[];
  /**
   * 查不到 `targetNutrients` 的條件 —— 也就是**使用者自填的病症**。
   *
   * ⚠️⚠️ **絕對不可以靜默丟掉這一份。**
   *   自填病症（「其他：甲狀腺亢進」）不在 `conditions.ts` 裡，沒有成分可以展開。
   *   若直接丟掉，使用者填了卻完全沒被考慮，**而且畫面上看不出來** ——
   *   這正是本專案最恨的失敗模式。
   *   所以原樣回報給呼叫端，由呼叫端決定怎麼處理（目前是原樣放進約束清單）。
   */
  unmapped: string[];
}

/**
 * 把使用者勾選的條件展開成中性成分清單。
 *
 * @param conditions 條件 id **或**中文病名（前端送來的是病名，見 App.tsx）
 * @param language   要取中文名還是英文名
 */
export function expandConditionsToNutrients(
  conditions: string[],
  language: Language = 'zh-TW'
): ExpandedConditions {
  const isEnglish = language === 'en';
  /** 用 zh 當去重鍵（同一成分可能被多個條件列到，例如鈉同時屬於高血壓與心臟衰竭） */
  const seen = new Map<string, TargetNutrient>();
  const unmapped: string[] = [];

  for (const raw of conditions) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const text = raw.trim();

    const hit = PHYSICAL_INDICATORS.find((c) => c.id === text || c.name === text);
    if (!hit || !Array.isArray(hit.targetNutrients) || hit.targetNutrients.length === 0) {
      // 自填病症、或資料缺失 —— 兩種都要回報，不能當作「沒有這個條件」
      unmapped.push(text);
      continue;
    }

    for (const tn of hit.targetNutrients) {
      const parsed = parseTargetNutrient(tn);
      if (parsed.zh && !seen.has(parsed.zh)) seen.set(parsed.zh, parsed);
    }
  }

  /**
   * 排序：**與 `LABEL_KEYS` 一致的成分排前面**，其餘依出現順序。
   *
   * 【為什麼要排】
   *   提示詞是有順序意義的（越前面越重要）。
   *   `LABEL_KEYS` 的順序就是「越前面＝越常見、越該優先」，
   *   而它同時也是「學一個小知識」挑題的優先序 ——
   *   兩邊用同一個順序，行為才一致。
   */
  const orderOf = (zh: string): number => {
    const i = (LABEL_KEYS as readonly string[]).indexOf(zh);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const entries = [...seen.values()].sort((a, b) => orderOf(a.zh) - orderOf(b.zh));

  return {
    nutrients: entries.map((e) => (isEnglish ? e.en : e.zh)),
    unmapped,
  };
}
