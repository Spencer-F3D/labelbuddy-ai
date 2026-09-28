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
  const amount = t('nutrient.amount', { value: fact.value, unit: fact.unit });
  return fact.direction === 'target'
    ? amount + t('nutrient.dailyMin', { limit: fact.dailyLimit, unit: fact.unit })
    : amount + t('nutrient.dailyMax', { limit: fact.dailyLimit, unit: fact.unit });
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
              <span className="text-[18px] font-black text-slate-900">{fact.name}</span>
              <span className="text-[20px] font-black shrink-0" style={{ color: tone.text }}>
                {factLabel(fact, language)}
              </span>
            </div>

            {/* 長條：滿格 100%，超過上限時填滿並靠顏色表達 */}
            <div
              className="w-full h-[18px] rounded-full bg-slate-200 border border-slate-300 overflow-hidden"
              role="img"
              aria-label={`${fact.name} ${factLabel(fact, language)}`}
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
