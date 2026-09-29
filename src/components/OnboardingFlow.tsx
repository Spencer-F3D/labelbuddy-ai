/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 首次啟動引導頁（First-run onboarding）
 * ============================================================================
 * 只在使用者第一次打開時出現，問三件事：
 *   ① 你是誰（決定營養門檻與建議語氣）
 *   ② 這個 App 怎麼用（使用介紹）
 *   ③ 私隱條款 ＋ 同不同意用雲端 AI
 *
 * 【為什麼要「先問身分」】
 *   同一個食品對不同身分的判定結果完全相反（高蛋白粉對健身族綠燈、
 *   對腎臟病患紅燈）。先問清楚，後面的每次分析才有正確的基準。
 *
 * 【為什麼私隱條款要跟 AI 模式放在同一頁】
 *   使用者會問「為什麼要連雲端？我的照片會不會外流？」
 *   —— 那正是同一件事。拆成兩頁會讓他按「同意」時不知道自己在同意什麼。
 *
 * ★ 本頁的每一段文字都必須雙語（章程要求全英文材料，App 也不能例外）。
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  Camera,
  Cloud,
  WifiOff,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { LearnerProfileId } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { LearnerProfilePicker } from './LearnerProfilePicker';

export interface OnboardingResult {
  profileId: LearnerProfileId;
  cloudConsent: boolean;
}

interface OnboardingFlowProps {
  /** 預設身分（通常是 senior） */
  initialProfileId: LearnerProfileId;
  /** 走完引導時呼叫 */
  onComplete: (result: OnboardingResult) => void;
}

const TOTAL_STEPS = 3;

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  initialProfileId,
  onComplete,
}) => {
  const { t, language } = useI18n();
  const [step, setStep] = useState(0);
  const [profileId, setProfileId] = useState<LearnerProfileId>(initialProfileId);
  const [cloudConsent, setCloudConsent] = useState(true);

  const isLast = step === TOTAL_STEPS - 1;

  const finish = () => onComplete({ profileId, cloudConsent });

  return (
    <div className="fixed inset-0 z-[60] bg-slate-100 overflow-y-auto">
      <div className="mx-auto w-full max-w-[560px] min-h-screen flex flex-col p-4 gap-4">
        {/* 進度指示：讓使用者知道還剩幾步，不會覺得沒完沒了 */}
        <div className="flex items-center gap-2 pt-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={`dot-${i}`}
              className={`h-2 flex-1 rounded-full ${
                i <= step ? 'bg-blue-800' : 'bg-slate-300'
              }`}
            />
          ))}
        </div>
        <p className="text-[16px] font-black text-slate-600 text-center">
          {t('onboard.stepOf', { n: step + 1, total: TOTAL_STEPS })}
        </p>

        <div className="flex-1 flex flex-col gap-4">
          {step === 0 && (
            <>
              <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-5">
                <h1 className="text-[20px] font-black">{t('onboard.welcomeTitle')}</h1>
                <p className="text-[16px] font-bold mt-2 leading-relaxed">
                  {t('onboard.welcomeBody')}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border-2 border-blue-900 flex flex-col gap-2">
                <h2 className="text-[19px] font-black text-slate-950">
                  {t('onboard.identityTitle')}
                </h2>
                <p className="text-[16px] font-bold text-slate-800 leading-relaxed">
                  {t('onboard.identityBody')}
                </p>
              </div>

              <LearnerProfilePicker selectedId={profileId} onSelect={setProfileId} />
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-[20px] font-black text-slate-950">
                {t('onboard.howTitle')}
              </h1>

              {/* 三個步驟各一張卡：圖示 ＋ 一句話，長者不用讀長文 */}
              <div className="bg-white rounded-2xl p-4 border-2 border-slate-300 flex gap-3">
                <Camera className="w-7 h-7 text-blue-800 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-[18px] font-black text-slate-950">
                    {t('onboard.how1Title')}
                  </p>
                  <p className="text-[16px] font-bold text-slate-800 leading-relaxed mt-1">
                    {t('onboard.how1Body')}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border-2 border-slate-300 flex gap-3">
                <ShieldCheck className="w-7 h-7 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-[18px] font-black text-slate-950">
                    {t('onboard.how2Title')}
                  </p>
                  <p className="text-[16px] font-bold text-slate-800 leading-relaxed mt-1">
                    {t('onboard.how2Body')}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border-2 border-slate-300 flex gap-3">
                <WifiOff className="w-7 h-7 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-[18px] font-black text-slate-950">
                    {t('onboard.how3Title')}
                  </p>
                  <p className="text-[16px] font-bold text-slate-800 leading-relaxed mt-1">
                    {t('onboard.how3Body')}
                  </p>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-[20px] font-black text-slate-950">
                {t('onboard.privacyTitle')}
              </h1>

              {/* 私隱條款：用「照片 → 文字 → 雲端」的順序講，因為那是最容易誤解的地方 */}
              <div className="bg-white rounded-2xl p-4 border-2 border-emerald-700 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-emerald-700" aria-hidden="true" />
                  <span className="text-[18px] font-black text-emerald-900">
                    {t('onboard.privacyPromiseTitle')}
                  </span>
                </div>

                <ol className="flex flex-col gap-3">
                  {[1, 2, 3].map((n) => (
                    <li key={`pv-${n}`} className="flex gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-emerald-700 text-white text-[16px] font-black flex items-center justify-center shrink-0">
                        {n}
                      </span>
                      <p className="text-[16px] font-bold text-slate-800 leading-relaxed">
                        {t(`onboard.privacy${n}` as 'onboard.privacy1')}
                      </p>
                    </li>
                  ))}
                </ol>

                <p className="text-[16px] font-bold text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-3">
                  {t('onboard.privacyNote')}
                </p>
              </div>

              {/* AI 模式同意：預設「雲端為主」，但把後備講清楚 */}
              <div className="bg-white rounded-2xl p-4 border-2 border-blue-900 flex flex-col gap-3">
                <h2 className="text-[19px] font-black text-slate-950">
                  {t('onboard.modeTitle')}
                </h2>

                <p className="text-[16px] font-bold text-slate-800 leading-relaxed">
                  {t('onboard.modeBody')}
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setCloudConsent(true)}
                    className={`min-h-[48px] rounded-xl px-4 py-3 text-left border-2 flex items-center gap-3 ${
                      cloudConsent
                        ? 'bg-blue-800 text-white border-blue-800'
                        : 'bg-white text-slate-800 border-slate-300'
                    }`}
                  >
                    <Cloud className="w-6 h-6 shrink-0" aria-hidden="true" />
                    <span className="text-[18px] font-black flex-1">
                      {t('onboard.modeCloud')}
                    </span>
                    {cloudConsent && <Check className="w-6 h-6 shrink-0" aria-hidden="true" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setCloudConsent(false)}
                    className={`min-h-[48px] rounded-xl px-4 py-3 text-left border-2 flex items-center gap-3 ${
                      !cloudConsent
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-slate-800 border-slate-300'
                    }`}
                  >
                    <WifiOff className="w-6 h-6 shrink-0" aria-hidden="true" />
                    <span className="text-[18px] font-black flex-1">
                      {t('onboard.modeLocal')}
                    </span>
                    {!cloudConsent && <Check className="w-6 h-6 shrink-0" aria-hidden="true" />}
                  </button>
                </div>

                <p className="text-[16px] font-bold text-slate-700 leading-relaxed">
                  {t('onboard.modeChangeLater')}
                </p>
              </div>
            </>
          )}
        </div>

        {/* 底部按鈕：固定在最後，長者不必找 */}
        <div className="flex items-center gap-3 pb-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-white border-2 border-slate-400 text-slate-800 text-[18px] font-black whitespace-nowrap cursor-pointer flex items-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
              {t('onboard.back')}
            </button>
          )}

          <button
            type="button"
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            className="flex-1 min-h-[48px] px-4 py-2 rounded-xl bg-blue-800 text-white text-[18px] font-black whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
          >
            {isLast ? t('onboard.start') : t('onboard.next')}
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* 語言切換提示：引導頁本身就看得到語言選項，英文使用者不會卡住 */}
        <p className="text-[16px] font-bold text-slate-500 text-center pb-2">
          {language === 'en'
            ? 'You can change the language any time in Settings.'
            : '之後可以隨時在設定裡換語言。'}
        </p>
      </div>
    </div>
  );
};
