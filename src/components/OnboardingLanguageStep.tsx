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

import React, { useState } from 'react';
import { Languages, Check } from 'lucide-react';
import type { Language } from '../i18n/translations';
import { LANGUAGE_OPTIONS } from '../i18n/translations';

interface OnboardingLanguageStepProps {
  /** 目前語言（作為確認前的預設選項；第一次進來時等於預設值） */
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

/** 確認按鈕：同樣兩種語言都寫，任一方都看得懂 */
const CONFIRM = {
  zh: '確定',
  en: 'Confirm',
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
  /**
   * 尚未確認的選擇。
   *
   * ★ 為什麼要有「確認」這一步（2026-09-30 使用者指定）：
   *   原本點一下就立刻切換語言並前進 —— 手指滑一下就會誤選，
   *   而語言一換，後面所有頁面都變了，使用者會一頭霧水。
   *   加一顆確認鈕讓「選擇」與「生效」分開，也符合其他設定頁的習慣。
   */
  const [pending, setPending] = useState<Language>(current);

  return (
    /* ⚠️ `id="onboarding-language-gate"` 與引導頁的 `onboarding-flow` 一樣，
       是給**檢查腳本**用的穩定錨點。這一頁沒有「第 N 步」也沒有進度條，
       所以只能靠 id 認 —— 用文案認的話，改一次文案就會失效。 */
    <div
      id="onboarding-language-gate"
      className="fixed inset-0 z-[60] bg-slate-100 overflow-y-auto"
    >
      {/* ★★ 2026-10-02 使用者明確指定：**這一頁不用向下滾動就看完整頁。**
          （原本「不用滾動」的要求被誤解成介紹頁 —— 介紹頁改成保留說明、接受滾動。）

          量出來的預算：`:root{font-size:20px}` 讓 Tailwind 的 rem 間距放大 1.25 倍，
          而且這一頁在**長者字級**下渲染（`text-[20px]` 實際是 24px）。
          原始版本實測約 691px > 640px。以下每一項都是為了把那 51px 收回來：

            `gap-5`(25px×4) → `gap-[12px]`      −52
            品牌圓標 72 → 56                     −16
            題目卡 `p-5`(25px) → `p-[14px]`      −22
            選項 `min-h-[88px]` → `min-h-[76px]` −24
            ────────────────────────────────────────
            約 577px，留 60px 餘裕

          ⚠️ 選項仍是 76px 高（一般規範 48px），長者手指較難精準點擊。
              這是**刻意的**：這一頁只有兩顆按鈕，寧可高一點也不要誤按。 */}
      <div className="mx-auto w-full max-w-[560px] min-h-screen flex flex-col justify-center p-[14px] gap-[12px]">
        {/* 品牌區：用中性內容，不偏任何一種語言 */}
        <div className="flex flex-col items-center gap-2">
          <span
            className="w-[56px] h-[56px] rounded-full bg-blue-900 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Languages className="w-[32px] h-[32px] text-white" />
          </span>
          <p className="text-[20px] font-black text-blue-950 tracking-wide">LabelBuddy AI</p>
        </div>

        {/* 題目：兩種語言同時寫，確保任一方都看得懂 */}
        <div className="bg-white rounded-2xl p-[14px] border-2 border-blue-900 flex flex-col items-center">
          <p className="text-[20px] font-black text-slate-950">{QUESTION.zh}</p>
          <p className="text-[20px] font-black text-slate-950">{QUESTION.en}</p>
        </div>

        {/* 兩個選項：高度 76px（比一般按鈕更大，這是唯一能做的事） */}
        <div className="flex flex-col gap-[10px]">
          {LANGUAGE_OPTIONS.map((opt) => {
            const isActive = pending === opt.id;
            const nativeLabel = NATIVE_NAME[opt.id] ?? opt.short;
            return (
              <button
                key={opt.id}
                type="button"
                id={`onboarding-language-${opt.id}`}
                onClick={() => setPending(opt.id)}
                aria-pressed={isActive}
                className={`w-full min-h-[76px] px-4 py-3 rounded-2xl border-2 flex items-center gap-4 text-left transition-all active:scale-[0.98] cursor-pointer ${
                  isActive
                    ? 'bg-blue-900 text-white border-blue-950 shadow-md'
                    : 'bg-white text-slate-900 border-slate-300'
                }`}
              >
                {/* 圓形徽章：讓不識字的視覺線索也能分辨兩個選項 */}
                <span
                  className={`w-[46px] h-[46px] shrink-0 rounded-full flex items-center justify-center text-[18px] font-black ${
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

        {/* 確認鈕：選好之後按這裡才生效（兩種語言都寫） */}
        <button
          type="button"
          id="onboarding-language-confirm"
          onClick={() => onChoose(pending)}
          className="w-full min-h-[72px] px-5 rounded-2xl bg-blue-900 text-white text-[20px] font-black flex items-center justify-center gap-3 border-4 border-blue-700 shadow-xl cursor-pointer transition-all active:scale-[0.98]"
        >
          <span>{CONFIRM.zh}</span>
          <span className="w-[1px] h-[24px] bg-blue-700 shrink-0" aria-hidden="true" />
          <span>{CONFIRM.en}</span>
        </button>

        {/* 提示：同樣兩種語言都寫 */}
        <div className="flex flex-col items-center">
          <p className="text-[16px] font-bold text-slate-600">{HINT.zh}</p>
          <p className="text-[16px] font-bold text-slate-600">{HINT.en}</p>
        </div>
      </div>
    </div>
  );
};
