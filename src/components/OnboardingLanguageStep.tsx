/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 引導頁的「語言閘門」（Language gate）— 全流程的第一頁
 * ============================================================================
 *
 * 【為什麼要放在最前面】
 *   後面每一頁都是翻譯過的。使用者若看不懂當前語言，
 *   後面全部走不下去 —— 所以語言必須是第一個問題。
 *
 * 【★ 為什麼這一頁不顯示「第 N 步，共 M 步」】
 *   兩個理由，缺一不可：
 *     ① 在選語言之前，進度指示**該用哪種語言**本身就是錯的。
 *        預設是中文，對英文使用者來說那行字他看不懂。
 *     ② 總步數要等選完身分才會確定（長者 9 頁／其他 7 頁），
 *        在這裡顯示數字只會誤導。
 *   所以這一頁是**獨立的前置關卡**，不屬於編號流程。
 *
 * 【★ 為什麼題目要用兩種語言同時寫】
 *   這是唯一一個「使用者可能看不懂當前語言」的畫面。
 *   只寫中文，英文使用者卡住；只寫英文，長者卡住。
 *   兩種都寫是唯一安全的做法。
 *
 * 【★ 為什麼選項要顯示母語名稱】
 *   「中文」永遠寫成「中文」，「English」永遠寫成「English」——
 *   不會因為切到英文就把「中文」翻成 "Chinese"。
 *   看不懂當前語言的人才找得到自己的語言，這是語言選擇器的通用慣例。
 */

import React from 'react';
import { Languages, Check } from 'lucide-react';
import type { Language } from '../i18n/translations';
import { LANGUAGE_OPTIONS } from '../i18n/translations';

interface OnboardingLanguageStepProps {
  /** 目前語言（用於標示已選項目；第一次進來時等於預設值） */
  current: Language;
  onChoose: (lang: Language) => void;
}

/** 兩種語言的題目：不經 t()，因為此時還不知道使用者要哪一種 */
const QUESTION = {
  zh: '請選擇語言',
  en: 'Choose your language',
} as const;

const HINT = {
  zh: '之後可以隨時更改',
  en: 'You can change this later',
} as const;

/**
 * 各語言的**母語名稱**（不經 t()）。
 * ⚠️ 這裡刻意不用 `settings.language.*` 的翻譯鍵 ——
 *    那些會隨介面語言改變，而這一頁正是「還不知道介面語言」的地方。
 */
const NATIVE_NAME: Record<string, string> = {
  'zh-TW': '中文',
  en: 'English',
};

export const OnboardingLanguageStep: React.FC<OnboardingLanguageStepProps> = ({
  current,
  onChoose,
}) => {
  return (
    <div className="fixed inset-0 z-[60] bg-slate-100 overflow-y-auto">
      <div className="mx-auto w-full max-w-[560px] min-h-screen flex flex-col justify-center p-4 gap-5">
        {/* 品牌區：用中性內容，不偏任何一種語言 */}
        <div className="flex flex-col items-center gap-3">
          <span
            className="w-[72px] h-[72px] rounded-full bg-blue-900 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Languages className="w-[40px] h-[40px] text-white" />
          </span>
          <p className="text-[20px] font-black text-blue-950 tracking-wide">LabelBuddy AI</p>
        </div>

        {/* 題目：兩種語言同時寫，確保任一方都看得懂 */}
        <div className="bg-white rounded-2xl p-5 border-2 border-blue-900 flex flex-col items-center gap-1">
          <p className="text-[20px] font-black text-slate-950">{QUESTION.zh}</p>
          <p className="text-[20px] font-black text-slate-950">{QUESTION.en}</p>
        </div>

        {/* 兩個選項：高度 88px（比一般按鈕更大，這是唯一能做的事） */}
        <div className="flex flex-col gap-3">
          {LANGUAGE_OPTIONS.map((opt) => {
            const isActive = current === opt.id;
            const nativeLabel = NATIVE_NAME[opt.id] ?? opt.short;
            return (
              <button
                key={opt.id}
                type="button"
                id={`onboarding-language-${opt.id}`}
                onClick={() => onChoose(opt.id)}
                aria-pressed={isActive}
                className={`w-full min-h-[88px] px-5 py-4 rounded-2xl border-2 flex items-center gap-4 text-left transition-all active:scale-[0.98] cursor-pointer ${
                  isActive
                    ? 'bg-blue-900 text-white border-blue-950 shadow-md'
                    : 'bg-white text-slate-900 border-slate-300'
                }`}
              >
                {/* 圓形徽章：讓不識字的視覺線索也能分辨兩個選項 */}
                <span
                  className={`w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center text-[18px] font-black ${
                    isActive ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-700 border border-slate-300'
                  }`}
                  aria-hidden="true"
                >
                  {opt.short}
                </span>
                <span className="flex-1 min-w-0 text-[20px] font-black">{nativeLabel}</span>
                {isActive && <Check className="w-[26px] h-[26px] shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {/* 提示：同樣兩種語言都寫 */}
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-[16px] font-bold text-slate-600">{HINT.zh}</p>
          <p className="text-[16px] font-bold text-slate-600">{HINT.en}</p>
        </div>
      </div>
    </div>
  );
};
