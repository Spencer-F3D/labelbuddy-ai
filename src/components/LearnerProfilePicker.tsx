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

interface LearnerProfilePickerProps {
  /** 目前選定的身分 */
  selectedId: LearnerProfileId;
  /** 切換身分時的回呼 */
  onSelect: (id: LearnerProfileId) => void;
  /** 是否使用精簡版（放在學堂頁面內時用 true） */
  compact?: boolean;
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
  const accent = ACCENT_STYLES[profile.id];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`選擇身分：${profile.name}`}
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
              {profile.name}
            </span>
            {isSelected && (
              <span
                className={`${accent.badge} text-white text-[16px] font-black px-2 py-0.5 rounded-full flex items-center gap-1`}
              >
                <Check className="w-3.5 h-3.5" />
                目前選擇
              </span>
            )}
          </div>
          <p className="text-[16px] text-slate-700 leading-snug mt-1">{profile.audience}</p>
        </div>

        {/* 未選中時顯示箭頭，提示可點擊 */}
        {!isSelected && (
          <ChevronRight className="w-6 h-6 text-slate-400 shrink-0 mt-1" />
        )}
      </div>
    </button>
  );
}

export const LearnerProfilePicker: React.FC<LearnerProfilePickerProps> = ({
  selectedId,
  onSelect,
  compact = false,
}) => {
  const profiles = getAllLearnerProfiles();
  const selected = profiles.find((p) => p.id === selectedId);

  return (
    <section className="w-full">
      {/* 標題 */}
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-6 h-6 text-blue-800 shrink-0" />
        <h2 className="text-[20px] font-black text-blue-950">先選您的身分</h2>
      </div>

      {!compact && (
        <p className="text-[16px] text-slate-700 mb-4 leading-relaxed">
          選好之後，辨識結果和學堂內容都會依您的需求調整。之後隨時可以回來改。
        </p>
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

      {/* 目前身分的每日參考值（讓選擇有具體意義） */}
      {selected && (
        <div className="mt-4 rounded-2xl bg-slate-100 border-2 border-slate-300 p-4">
          <p className="text-[20px] font-black text-slate-900 mb-2">
            {selected.emoji} {selected.name}的每日參考值
          </p>
          <ul className="space-y-1.5">
            {selected.targets.map((t) => (
              <li
                key={t.nutrient}
                className="flex items-start gap-2 text-[16px] leading-snug text-slate-800"
              >
                <span
                  className={`shrink-0 mt-1 w-2.5 h-2.5 rounded-full ${
                    t.direction === 'limit' ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                  aria-hidden="true"
                />
                <span>
                  <strong className="font-black">{t.nutrient}</strong>
                  <span className="mx-1">·</span>
                  {t.direction === 'limit' ? '不超過' : '至少'}{' '}
                  <strong className="font-black">{t.target}</strong>
                  <br />
                  <span className="text-slate-600">{t.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
