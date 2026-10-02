/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 成分對照長條圖（Nutrient Fact Bars）
 * ============================================================================
 *
 * 這是本次改版最關鍵的一塊。改版前結果頁只寫「鈉 2480 毫克」，
 * 但長者沒有「一天可以吃幾毫克」的基準，看到數字也無法判斷多不多。
 * 這裡把後端算好的「佔每日上限幾 %」畫成長條，讓判斷變成看一眼就懂的事。
 *
 * 【設計取捨】
 *   1. 百分比用大字（22px）放右側，長條只是輔助 —— 數字才是主要資訊。
 *   2. 長條一律以 100% 為滿格，超過上限時填滿並由顏色傳達超標，
 *      而不是讓長條超出容器（超出容器在窄螢幕上會擠壞版面）。
 *   3. 顏色不是唯一線索：每列都有「超出 24%」這種文字，色盲者也讀得到。
 *   4. 「每日上限」與「這包有多少」都寫出來，讓長者能自己複查。
 */

import React from 'react';
import type { NutrientFact } from '../types';
import { TONES, percentTone, describePercent, barWidth } from '../theme';
import type { ToneName } from '../theme';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
// 難字簡化（2026-09-30）：`fact.name` 是 canonical（鈉／膳食纖維…），
// ⚠️ **必須經過 nutrientName() 才會變成「鹽分／纖維」** ——
//    一開始漏了這一步，長條圖照樣顯示「鈉」，而且不會報錯（畫面看起來很正常）。
import { nutrientName, unitName } from '../data/bilingual';

/**
 * 依「方向」決定這一列的色調。
 *
 * ⚠️ 「每日上限」與「每日目標」的判讀方向完全相反：
 *    鈉 120% 是壞事，蛋白質 120% 是好事。若共用同一套閾值，
 *    會把「蛋白質很夠」標成紅色，反而誤導使用者。
 */
function factTone(fact: NutrientFact): ToneName {
  if (fact.direction === 'target') {
    if (fact.percent >= 100) return 'safe';
    if (fact.percent >= 50) return 'caution';
    return 'neutral';
  }
  return percentTone(fact.percent);
}

/** 依方向產生白話的百分比說法 */
function factLabel(fact: NutrientFact, language: 'zh-TW' | 'en'): string {
  if (fact.direction === 'target') {
    return language === 'en' ? `${fact.percent}% of daily target` : `達到 ${fact.percent}%`;
  }
  return describePercent(fact.percent, language);
}

/** 依方向產生下方的數字說明 */
function factDetail(
  fact: NutrientFact,
  language: 'zh-TW' | 'en',
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  /**
   * ⚠️ 單位一定要過 `unitName()`。
   *
   * `fact.unit` 是**後端給的中文單位**（毫克／公克／大卡）。
   * 直接插進英文字串會變成「This pack has 2350 毫克」——
   * 而且**不會報錯**，畫面看起來也正常。
   *
   * 這正是本專案第 4 類 bug（「改了 A 忘了 B」）的變體：
   * `unitName()` 一直存在、後端也一直在用，但**前端從來沒呼叫過它**。
   */
  const unit = unitName(fact.unit, language);

  /**
   * ⚠️ 基準一定要顯示（2026-10-02 使用者指定「完全不換算」）。
   *
   * 數字是標籤上的原始值，所以「800 毫克」本身**沒有意義** ——
   * 要配上「每 100 公克」還是「整包」才說得通。
   *
   * ⚠️ 基準由代碼轉文字，不是直接用後端的字串：
   *    後端若回中文，英文介面就會露出中文。
   */
  const basisText = (() => {
    const key =
      fact.basis === 'per_100g'
        ? 'nutrient.basisPer100g'
        : fact.basis === 'per_serving'
          ? 'nutrient.basisPerServing'
          : fact.basis === 'whole_pack'
            ? 'nutrient.basisWholePack'
            : fact.basis === 'unknown'
              ? 'nutrient.basisUnknown'
              : // 完全沒有 basis 欄位 = 本機引擎產生的（它不解析基準）
                // ⚠️ 不能說「標籤未標示基準」—— 那是對標籤的錯誤宣稱，
                //    我們只是沒去看。要說「基準未確認」。
                'nutrient.basisNotConfirmed';
    const base = t(key);
    // 標籤有寫份量時補上，例如「每份（30 公克）」
    return fact.basis === 'per_serving' && fact.basisNote ? `${base}（${fact.basisNote}）` : base;
  })();

  const amount = t('nutrient.amount', { basis: basisText, value: fact.value, unit });
  return fact.direction === 'target'
    ? amount + t('nutrient.dailyMin', { limit: fact.dailyLimit, unit })
    : amount + t('nutrient.dailyMax', { limit: fact.dailyLimit, unit });
}

interface NutrientFactBarsProps {
  /** 後端回傳的成分對照表（已排序、最多 3 項） */
  facts?: NutrientFact[];
  /** 該身分的名稱，用於說明「上限是依誰的標準」 */
  profileName?: string;
}

export const NutrientFactBars: React.FC<NutrientFactBarsProps> = ({ facts, profileName }) => {
  const { t, language } = useI18n();
  if (!facts || facts.length === 0) return null;

  return (
    <div className="flex flex-col gap-[14px]">
      {facts.map((fact) => {
        const tone = TONES[factTone(fact)];

        return (
          <div key={fact.name} className="flex flex-col gap-[6px]">
            {/* 名稱 + 百分比：百分比刻意比名稱大，因為那才是判斷依據 */}
            <div className="flex items-baseline justify-between gap-[8px]">
              <span className="text-[18px] font-black text-slate-900">
                {nutrientName(fact.name, language)}
              </span>
              <span className="text-[20px] font-black shrink-0" style={{ color: tone.text }}>
                {factLabel(fact, language)}
              </span>
            </div>

            {/* 長條：滿格 100%，超過上限時填滿並靠顏色表達 */}
            <div
              className="w-full h-[18px] rounded-full bg-slate-200 border border-slate-300 overflow-hidden"
              role="img"
              aria-label={`${nutrientName(fact.name, language)} ${factLabel(fact, language)}`}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: barWidth(fact.percent), background: tone.bar }}
              />
            </div>

            {/* 數字明細：想自己複查的人看得到原始數字 */}
            <span className="text-[16px] font-bold text-slate-600 leading-snug">
              {factDetail(fact, language, t)}
            </span>
          </div>
        );
      })}

      {profileName && (
        <p className="text-[16px] font-bold text-slate-600 leading-snug pt-[2px] border-t border-slate-200 mt-[2px]">
          {t('nutrient.basis', { name: profileName })}
        </p>
      )}
    </div>
  );
};
