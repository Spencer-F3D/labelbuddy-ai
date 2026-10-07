/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 單題測驗卡（QuizCard）
 * ============================================================================
 * 【為什麼要從 FoodEdClassroom.tsx 抽出來（2026-10-07）】
 *   「學一個小知識」（結果頁的卡片）也要出一道題並即時對答案 ——
 *   行為必須與食育學堂**完全一致**（同樣的顏色編碼、同樣的詳解區塊）。
 *
 *   留在 `FoodEdClassroom.tsx` 裡的話，結果頁就得複製一份 className 與邏輯；
 *   兩份遲早會漂移，而且漂移的後果是「同一個 App 兩個地方答題長得不一樣」。
 *   → 抽成共用元件，兩邊都 import 這一個。
 *
 * 【⚠️ 這是純搬移，行為完全不變】
 *   除了新增 `showProgress` 這個可選參數（見下），其餘 JSX 與 className
 *   與原本在 `FoodEdClassroom.tsx` 的版本一字不差。
 *
 * 【無障礙與顏色編碼】
 *   答題後的正確／錯誤**不只用顏色**：圓圈內會換成 ✓／✗ 圖示，
 *   下方也會出現文字（「答對了」／「再想一下」）——
 *   長者水晶體黃化對綠色不敏感，只靠顏色會分不出來。
 */

import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { QuizQuestion } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { TOPIC_LABELS } from '../data/learnerProfiles';
import { topicLabel } from '../data/bilingualContent';

interface QuizCardProps {
  question: QuizQuestion;
  /** 目前第幾題（0 起算）。單題情境傳 0。 */
  index: number;
  /** 總題數。單題情境傳 1。 */
  total: number;
  /** 作答時回報選了第幾個選項（0 起算）。 */
  onAnswer: (selectedIndex: number) => void;
  /**
   * 是否顯示「第 N 題／共 M 題」的進度徽章。
   *
   * ⚠️ 結果頁的「學一個小知識」只有**一題**，顯示「第 1 題，共 1 題」是純噪音 ——
   *    所以那裡傳 `false`。食育學堂維持預設 `true`（行為不變）。
   *    主題標籤兩種情況都保留：它告訴使用者這題屬於哪個知識領域。
   */
  showProgress?: boolean;
}

export function QuizCard({
  question,
  index,
  total,
  onAnswer,
  showProgress = true,
}: QuizCardProps) {
  const { t, language } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  const isCorrect = answered && selected === question.correctIndex;

  return (
    <div className="rounded-2xl bg-white border-3 border-slate-300 p-4">
      {/* 題號 */}
      <div className="flex items-center justify-between mb-3">
        {showProgress ? (
          <span className="bg-blue-900 text-white text-[16px] font-black px-3 py-1 rounded-full">
            {t('classroom.questionOf', { i: index + 1, n: total })}
          </span>
        ) : (
          /* ⚠️ 不顯示進度徽章時仍要保留左側的佔位，
             否則主題標籤會被 justify-between 推到最左邊、與其他卡片不一致 */
          <span aria-hidden="true" />
        )}
        <span className="text-[16px] font-bold text-slate-500">
          {topicLabel(question.topic, TOPIC_LABELS[question.topic], language)}
        </span>
      </div>

      {/* 題目 */}
      <p className="text-[20px] font-bold text-slate-900 leading-relaxed mb-4">
        {question.question}
      </p>

      {/* 選項 */}
      <div className="space-y-2.5">
        {question.options.map((opt, i) => {
          const isThis = selected === i;
          const isAnswer = i === question.correctIndex;

          let style = 'bg-slate-50 border-slate-300 hover:bg-slate-100';
          if (answered) {
            if (isAnswer) {
              style = 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-400';
            } else if (isThis) {
              style = 'bg-rose-50 border-rose-600 ring-2 ring-rose-400';
            } else {
              style = 'bg-slate-50 border-slate-200 opacity-60';
            }
          }

          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => {
                setSelected(i);
                onAnswer(i);
              }}
              className={`w-full min-h-[64px] text-left rounded-xl border-3 px-4 py-3 flex items-center gap-3 transition-all ${
                answered ? '' : 'cursor-pointer active:scale-[0.98]'
              } ${style}`}
            >
              <span className="w-9 h-9 rounded-full bg-white border-2 border-slate-400 flex items-center justify-center text-[18px] font-black shrink-0">
                {answered && isAnswer ? (
                  <Check className="w-5 h-5 text-emerald-700" />
                ) : answered && isThis ? (
                  <X className="w-5 h-5 text-rose-700" />
                ) : (
                  ['A', 'B', 'C'][i] ?? i + 1
                )}
              </span>
              {/* ⚠️ `flex-1 min-w-0` 讓文字**用滿剩餘寬度**（預設的 flex item 會依內容
                  寬度排版，在窄容器裡更容易斷出孤行）；`[text-wrap:balance]` 再把兩行
                  拉平均 —— 實測結果頁的「約 400 公克鹽」在 22px 下會斷成「鹽」單獨一行。
                  ⚠️ 這兩個 class 是成對的：只加 balance 而沒有 flex-1，可用寬度不變。 */}
              <span className="flex-1 min-w-0 text-[18px] font-bold text-slate-800 leading-snug [text-wrap:balance]">
                {opt}
              </span>
            </button>
          );
        })}
      </div>

      {/* 解說 */}
      {answered && (
        <div
          className={`mt-3 rounded-xl border-2 p-3 ${
            isCorrect ? 'bg-emerald-50 border-emerald-500' : 'bg-amber-50 border-amber-500'
          }`}
        >
          <p
            className={`text-[18px] font-black mb-1 ${
              isCorrect ? 'text-emerald-800' : 'text-amber-800'
            }`}
          >
            {isCorrect ? t('classroom.correct') : t('classroom.wrongHint')}
          </p>
          <p className="text-[16px] leading-relaxed text-slate-800">{question.explanation}</p>
        </div>
      )}
    </div>
  );
}
