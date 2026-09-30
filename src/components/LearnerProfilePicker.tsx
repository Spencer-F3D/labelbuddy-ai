/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 學習者身分選擇器（Learner Profile Picker）
 * ============================================================================
 *
 * 讓使用者選擇自己是哪一種身分，選定後會影響：
 *   1. 食育學堂裡優先顯示的知識卡與測驗
 *   2. 拍照辨識時 AI 的判斷基準與建議方向
 *
 * 設計遵循專案的長者友善基準：大卡片、大字體、觸控區 ≥ 60px、單欄垂直。
 */

import React from 'react';
import { Check, ChevronRight, Users } from 'lucide-react';
import type { LearnerProfile, LearnerProfileId } from '../types';
import { getAllLearnerProfiles } from '../data/learnerProfiles';
// 雙語（2026-09-28 第三階段）：身分名稱與對象說明放在資料層，
// 這裡只負責「取值」與介面文字，翻譯資料本身集中在 data/bilingualContent.ts。
//
// ⚠️ 2026-09-30：原本這裡還會渲染「每日參考值」整塊（鈉不超過 2000 毫克…），
//    已移除 —— 使用者選身分時不需要看這些數字，那是內部判斷用的門檻。
//    連帶移除了 nutrientName / targetText / targetNote 三個 import。
import { useI18n } from '../i18n/I18nContext';
import { profileDisplayName } from '../data/bilingualContent';

interface LearnerProfilePickerProps {
  /** 目前選定的身分 */
  selectedId: LearnerProfileId;
  /** 切換身分時的回呼 */
  onSelect: (id: LearnerProfileId) => void;
  /** 是否使用精簡版（放在學堂頁面內時用 true） */
  /**
   * 隱藏內建的標題與說明（2026-09-30）。
   *
   * 【為什麼需要】
   *   引導頁已經有自己的卡片標題（「先問一下：您是誰？」），
   *   再用這裡的標題就會變成同一個畫面有兩個幾乎一樣的標題。
   *   設定頁與食育學堂則需要自己的標題（那裡沒有外層卡片）。
   */
  hideHeading?: boolean;
}

/** 各身分的視覺配色（避免使用動態組字串的 Tailwind class，改為靜態對照表） */
const ACCENT_STYLES: Record<
  LearnerProfileId,
  { ring: string; bg: string; text: string; badge: string }
> = {
  senior: {
    ring: 'ring-blue-500 border-blue-600',
    bg: 'bg-blue-50',
    text: 'text-blue-900',
    badge: 'bg-blue-700',
  },
  child: {
    ring: 'ring-sky-500 border-sky-600',
    bg: 'bg-sky-50',
    text: 'text-sky-900',
    badge: 'bg-sky-700',
  },
  teen: {
    ring: 'ring-violet-500 border-violet-600',
    bg: 'bg-violet-50',
    text: 'text-violet-900',
    badge: 'bg-violet-700',
  },
  fitness: {
    ring: 'ring-orange-500 border-orange-600',
    bg: 'bg-orange-50',
    text: 'text-orange-900',
    badge: 'bg-orange-700',
  },
  takeout: {
    ring: 'ring-emerald-500 border-emerald-600',
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    badge: 'bg-emerald-700',
  },
  student: {
    ring: 'ring-purple-500 border-purple-600',
    bg: 'bg-purple-50',
    text: 'text-purple-900',
    badge: 'bg-purple-700',
  },
};

function ProfileCard({
  profile,
  isSelected,
  onSelect,
}: {
  profile: LearnerProfile;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { t, language } = useI18n();
  const accent = ACCENT_STYLES[profile.id];
  const displayName = profileDisplayName(profile.id, profile.name, language);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={t('profile.picker.selectAria', { name: displayName })}
      className={`w-full min-h-[76px] text-left rounded-2xl border-3 p-4 transition-all active:scale-[0.98] cursor-pointer ${
        isSelected
          ? `${accent.bg} ${accent.ring} ring-3 shadow-md`
          : 'bg-white border-slate-300 hover:bg-slate-50'
      }`}
    >
      {/* ⚠️ emoji 用固定欄寬（不是 flex 自動伸縮），
          讓下一個 box 的寬度是可預期的 → 說明文字才不會被擠成多行 */}
      <div className="grid grid-cols-[30px_1fr] items-start gap-3">
        {/* 圖示 */}
        {/* emoji 圖示：用 width/height 明確控制，不用 text-[Npx]
            （本專案的字級規則限制在 16～20px，emoji 不算文字） */}
        <span className="w-[30px] h-[30px] leading-none mt-0.5 text-center" aria-hidden="true">
          {profile.emoji}
        </span>

        {/* 文字區 */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[20px] font-black ${isSelected ? accent.text : 'text-slate-900'}`}
            >
              {displayName}
            </span>
            {/* ⚠️ 箭頭要**緊接在名稱右方**（2026-09-29 使用者要求），
                不要放到卡片最右邊 —— 那會離名稱很遠，看不出是「這個名字可以點」。
                已選中時改顯示「已選擇」徽章，兩者互斥。 */}
            {isSelected ? (
              <span
                className={`${accent.badge} text-white text-[16px] font-black px-2 py-0.5 rounded-full flex items-center gap-1`}
              >
                <Check className="w-3.5 h-3.5" />
                {t('profile.picker.selected')}
              </span>
            ) : (
              <ChevronRight className="w-6 h-6 text-slate-400 shrink-0" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export const LearnerProfilePicker: React.FC<LearnerProfilePickerProps> = ({
  selectedId,
  onSelect,
  hideHeading = false,
}) => {
  const { t } = useI18n();
  const profiles = getAllLearnerProfiles();

  return (
    <section className="w-full">
      {/* 標題與說明（引導頁已有自己的卡片標題時可關掉，避免兩個標題） */}
      {!hideHeading && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-6 h-6 text-blue-800 shrink-0" />
            <h2 className="text-[20px] font-black text-blue-950">{t('profile.picker.title')}</h2>
          </div>
          <p className="text-[16px] text-slate-700 mb-4 leading-relaxed">
            {t('profile.picker.desc')}
          </p>
        </>
      )}

      {/* 選項清單（單欄垂直） */}
      <div className="space-y-2.5">
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            isSelected={profile.id === selectedId}
            onSelect={() => onSelect(profile.id)}
          />
        ))}
      </div>
    </section>
  );
};
