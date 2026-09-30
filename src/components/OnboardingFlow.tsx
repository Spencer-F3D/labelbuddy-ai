/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 首次啟動引導頁（First-run onboarding）
 * ============================================================================
 * 只在使用者第一次打開時出現。
 *
 * 【★ 為什麼頁數會依身分不同（2026-09-30 使用者指定）】
 *   長者需要「一步一步」的教學，年輕人可以一次看完。
 *   所以：
 *     長者（senior）→ 9 頁：介紹／身分／慢性病／性別／教學×3／AI／私隱
 *     其他身分      → 7 頁：介紹／身分／慢性病／性別／教學×1／AI／私隱
 *   ⚠️ 頁數在第 2 頁選完身分之後才會確定 —— 也就是**進度指示的總數會變**。
 *      這是刻意的：把身分放前面，後面的教學才能配合對象調整。
 *      實作上用 `buildSteps()` 依 profileId 算出步驟陣列，並對 step 做夾取，
 *      避免使用者回頭改身分時索引爆掉。
 *
 * 【★ 為什麼私隱條款要跟 AI 模式放在同一頁】
 *   使用者會問「為什麼要連雲端？我的照片會不會外流？」
 *   —— 那正是同一件事。拆成兩頁會讓他按「同意」時不知道自己在同意什麼。
 *
 * 【★ 用字原則（長者版）】
 *   避免容易誤會或太技術的字：
 *     辨識→認出、分析→看、模式→方式、設定→改、上傳→送出去、掃描→拍、儲存→存
 *   保留「AI」「雲端」「營養標示」—— 前兩者是模式名稱，後者印在包裝上，
 *   改了反而對不上。
 *
 * ★ 本頁的每一段文字都必須雙語（章程要求全英文材料，App 也不能例外）。
 */

import React, { useState } from 'react';
import { ShieldCheck, Camera, Cloud, WifiOff, ArrowRight, ArrowLeft, Check, HeartPulse, AlertTriangle } from 'lucide-react';
import { AddressGender, AnalysisMode, LearnerProfileId } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { LearnerProfilePicker } from './LearnerProfilePicker';
import { GenderPicker } from './GenderPicker';
import { LegalNotice } from './LegalNotice';
import { AnalysisModePicker } from './AnalysisModePicker';
// 語言閘門（2026-09-30）：全流程的第一頁，獨立於編號步驟之外。
import { OnboardingLanguageStep } from './OnboardingLanguageStep';
import { PHYSICAL_INDICATORS } from '../data/conditions';
import { conditionName } from '../data/bilingual';

/**
 * 性別。
 *
 * 【為什麼要問，以及為什麼一定要有「不指定」】
 *   中文的稱謂分性別（先生／小姐），AI 回饋與語音都要用對才不失禮。
 *   但這題**不該強迫作答** —— 使用者可能不想講、也可能覺得沒必要。
 *   所以第三個選項不是裝飾，是為了讓「不想說」也能走下去。
 *   `unspecified` 時一律用中性的「您好」，不要猜。
 */
export type Gender = AddressGender;

export interface OnboardingResult {
  profileId: LearnerProfileId;
  gender: Gender;
  /** 使用者選的分析模式（2026-09-30 起為三選一）。 */
  analysisMode: AnalysisMode;
  /** 第 3 頁勾選的慢性病與過敏原（與設定頁共用同一個儲存鍵）。 */
  conditions: string[];
}

interface OnboardingFlowProps {
  /** 預設身分（通常是 senior） */
  initialProfileId: LearnerProfileId;
  /** 既有的慢性病勾選（重跑引導頁時沿用，不該被清空） */
  initialConditions: string[];
  /** 走完引導時呼叫 */
  onComplete: (result: OnboardingResult) => void;
}

/**
 * 引導頁的步驟識別碼。
 *
 * ⚠️ 用「識別碼」而不是數字：頁數會依身分變動，
 *    寫死 `step === 4` 的話，加一頁就會全部錯位（而且不會報錯）。
 */
type StepId =
  | 'intro'
  | 'profile'
  | 'conditions'
  | 'gender'
  | 'how1'
  | 'how2'
  | 'how3'
  | 'howAll'
  | 'mode'
  | 'privacy';

/** 依身分決定步驟序列。長者把教學拆成 3 頁，其他身分合併成 1 頁。 */
function buildSteps(profileId: LearnerProfileId): StepId[] {
  const common: StepId[] = ['intro', 'profile', 'conditions', 'gender'];
  const tail: StepId[] = ['mode', 'privacy'];
  return profileId === 'senior'
    ? [...common, 'how1', 'how2', 'how3', ...tail]
    : [...common, 'howAll', ...tail];
}

/** 教學三步（長者逐頁用，年輕版一次過用同一份內容） */
const HOW_STEPS = ['how1', 'how2', 'how3'] as const;

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  initialProfileId,
  initialConditions,
  onComplete,
}) => {
  const { t, language, setLanguage } = useI18n();
  const [step, setStep] = useState(0);
  /**
   * 語言是否已選。
   *
   * ★ 為什麼用獨立的布林值，而不是把 'language' 塞進 `buildSteps()`：
   *   這一頁**不屬於編號流程** —— 它不能顯示「第 N 步，共 M 步」。
   *   理由有兩個（見 `OnboardingLanguageStep.tsx` 的說明）：
   *     ① 選語言之前，進度指示該用哪種語言本身就是錯的
   *     ② 總步數要等選完身分才確定（長者 9／其他 7）
   *   塞進陣列的話，第一頁會變成「第 2 步，共 10 步」，兩邊都錯。
   */
  const [languageChosen, setLanguageChosen] = useState(false);
  const [profileId, setProfileId] = useState<LearnerProfileId>(initialProfileId);
  const [gender, setGender] = useState<Gender>('unspecified');
  /** 第 3 頁的勾選（與設定頁共用同一個儲存鍵，由 App 負責存） */
  const [conditions, setConditions] = useState<string[]>(initialConditions);
  /**
   * 分析模式。
   *
   * ⚠️ 預設 `cloud_image`（雲端）—— 這是使用者指定的預設。
   *    但這代表**預設會把照片送出去**，所以模式卡片上的
   *    「離開手機：照片、慢性病史」一定要在選擇當下就看得見。
   */
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('cloud_image');
  /**
   * 是否已勾選「我已閱讀並同意私隱條款與免責聲明」。
   *
   * ⚠️ 預設 **false**，而且沒勾就不能完成引導頁。
   *    條款同意不能預先打勾 —— 預設打勾等於使用者沒看就同意了，
   *    那不是有效的同意。
   */
  const [agreed, setAgreed] = useState(false);
  /** 使用者按了「開始使用」卻還沒勾同意時，才顯示提醒（不一開始就紅字嚇人） */
  const [showAgreeWarning, setShowAgreeWarning] = useState(false);

  const steps = buildSteps(profileId);
  /**
   * ⚠️ 夾取：使用者可能回頭把身分從「長者」改成別的，
   *    此時 steps 會從 9 個變 7 個，原本的 step 可能超出範圍。
   *    不夾取就會拿到 undefined → 整頁空白（而且不會報錯）。
   */
  const current = Math.min(step, steps.length - 1);
  const stepId = steps[current];
  const isLast = current === steps.length - 1;

  const finish = () => onComplete({ profileId, gender, analysisMode, conditions });

  const toggleCondition = (id: string) =>
    setConditions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** 慢性病（非過敏原）與食物過敏原分開列 —— 兩者的後果等級完全不同 */
  const chronicItems = PHYSICAL_INDICATORS.filter((c) => c.category !== 'allergen');
  const allergenItems = PHYSICAL_INDICATORS.filter((c) => c.category === 'allergen');

  /** 一列勾選項（引導頁精簡版：只有名稱與勾選框，詳情留給設定頁） */
  const renderConditionRow = (id: string, isAllergen: boolean) => {
    const on = conditions.includes(id);
    const name = conditionName(id, PHYSICAL_INDICATORS.find((c) => c.id === id)?.name ?? id, language);
    return (
      <button
        key={id}
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={() => toggleCondition(id)}
        className={`w-full min-h-[56px] px-4 py-2 rounded-xl border-2 flex items-center gap-3 text-left transition-all active:scale-[0.99] cursor-pointer ${
          on
            ? isAllergen
              ? 'bg-[#FCEBEB] border-[#A32D2D]'
              : 'bg-blue-50 border-blue-900'
            : 'bg-white border-slate-300'
        }`}
      >
        <span
          className={`flex-1 min-w-0 text-[20px] font-black leading-tight ${
            isAllergen ? 'text-[#501313]' : 'text-blue-950'
          }`}
        >
          {name}
        </span>
        <span
          aria-hidden="true"
          className={`w-[44px] h-[44px] rounded-[10px] border-[3px] flex items-center justify-center shrink-0 ${
            on
              ? isAllergen
                ? 'bg-[#A32D2D] border-[#A32D2D] text-white'
                : 'bg-blue-900 border-blue-900 text-white'
              : 'bg-white border-slate-400'
          }`}
        >
          {on && <Check className="w-[26px] h-[26px] stroke-[4]" />}
        </span>
      </button>
    );
  };

  /* ── 語言閘門：全流程的第一頁（不屬於編號步驟）────────────────────
      ★ 這一頁刻意不顯示進度指示 —— 在選語言之前，進度指示該用哪種語言
        本身就是錯的（預設是中文，英文使用者看不懂那行字）。
      ★ 選完就直接進第 1 頁，中間沒有任何緩衝。 */
  if (!languageChosen) {
    return (
      <OnboardingLanguageStep
        current={language}
        onChoose={(lang) => {
          setLanguage(lang);
          setLanguageChosen(true);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-100 overflow-y-auto">
      <div className="mx-auto w-full max-w-[560px] min-h-screen flex flex-col p-4 gap-4">
        {/* 進度指示：讓使用者知道還剩幾步，不會覺得沒完沒了 */}
        <div className="flex items-center gap-2 pt-2">
          {steps.map((s, i) => (
            <div
              key={`dot-${s}`}
              className={`h-2 flex-1 rounded-full ${i <= current ? 'bg-blue-800' : 'bg-slate-300'}`}
            />
          ))}
        </div>
        <p className="text-[16px] font-black text-slate-600 text-center">
          {t('onboard.stepOf', { n: current + 1, total: steps.length })}
        </p>

        <div className="flex-1 flex flex-col gap-4">
          {/* ── 1. 產品介紹（一眼看懂）────────────────────────────
              ★ 這一頁的任務只有一個：讓人在 3 秒內知道這個 App 是做什麼的。
                所以順序是「先講結果，再講怎麼做」——
                「拍食品標籤 → 知道能不能吃」比「拍一張，我幫您看」明確得多。
              ★ 加一個「拍這個 → 得到這個」的視覺對照：
                不用讀字也能懂，對不識字或不想讀的長者是必要的。 */}
          {stepId === 'intro' && (
            <>
              <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-5">
                <p className="text-[16px] font-black text-blue-200 tracking-wide">
                  {t('app.name')}
                </p>
                <h1 className="text-[20px] font-black mt-1 leading-tight">
                  {t('onboard.introTitle')}
                </h1>
                <p className="text-[16px] font-bold mt-2 leading-relaxed text-blue-50">
                  {t('onboard.introBody')}
                </p>
              </div>

              {/* 「拍這個 → 得到這個」：左邊是標籤長相，右邊是結論 */}
              <div className="bg-white rounded-2xl p-4 border-2 border-blue-900">
                <div className="flex items-stretch gap-3">
                  <div className="flex-1 min-w-0 rounded-xl border-2 border-slate-400 bg-slate-50 p-3 flex flex-col gap-1">
                    <p className="text-[16px] font-black text-slate-500">
                      {t('onboard.introShotLabel')}
                    </p>
                    {/* ⚠️ 這幾行是「模擬標籤」的示意，必須雙語 ——
                        寫死中文的話，英文介面會露出中文（i18n 檢查抓到過）。 */}
                    <p className="text-[16px] font-bold text-slate-700 whitespace-nowrap">
                      {t('onboard.introShotSalt')}
                    </p>
                    <p className="text-[16px] font-bold text-slate-700 whitespace-nowrap">
                      {t('onboard.introShotSugar')}
                    </p>
                  </div>

                  <ArrowRight
                    className="w-7 h-7 text-blue-800 shrink-0 self-center"
                    aria-hidden="true"
                  />

                  <div className="flex-1 min-w-0 rounded-xl border-2 border-emerald-600 bg-emerald-50 p-3 flex flex-col justify-center gap-1">
                    <p className="text-[18px] font-black text-emerald-800">
                      {t('history.greenLight')}
                    </p>
                    <p className="text-[16px] font-black text-emerald-900">
                      {t('onboard.introShotResult')}
                    </p>
                  </div>
                </div>
                <p className="text-[16px] font-bold text-slate-600 text-center mt-3">
                  {t('onboard.introShotCaption')}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border-2 border-slate-300 flex flex-col gap-3">
                {(['1', '2', '3'] as const).map((n) => (
                  <div key={n} className="flex items-start gap-3">
                    <span className="w-8 h-8 rounded-full bg-blue-900 text-white text-[16px] font-black flex items-center justify-center shrink-0">
                      {n}
                    </span>
                    <p className="text-[18px] font-black text-slate-900 leading-snug pt-1">
                      {t(`onboard.introPoint${n}` as 'onboard.introPoint1')}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── 2. 身分選擇 ──────────────────────────────────────── */}
          {stepId === 'profile' && (
            <>
              <div className="bg-white rounded-2xl p-4 border-2 border-blue-900 flex flex-col gap-2">
                <h1 className="text-[20px] font-black text-slate-950">
                  {t('onboard.identityTitle')}
                </h1>
                <p className="text-[16px] font-bold text-slate-800 leading-relaxed">
                  {t('onboard.identityBody')}
                </p>
              </div>
              {/* ⚠️ hideHeading：外層卡片已經有標題了，不要出現兩個標題 */}
              <LearnerProfilePicker
                selectedId={profileId}
                onSelect={setProfileId}
                hideHeading
              />
            </>
          )}

          {/* ── 3. 慢性病與過敏 ──────────────────────────────────── */}
          {stepId === 'conditions' && (
            <>
              <div className="bg-white rounded-2xl p-4 border-2 border-blue-900 flex flex-col gap-2">
                <h1 className="text-[20px] font-black text-slate-950">
                  {t('onboard.conditionsTitle')}
                </h1>
                <p className="text-[16px] font-bold text-slate-800 leading-relaxed">
                  {t('onboard.conditionsBody')}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border-2 border-slate-300 flex flex-col gap-3">
                <h2 className="text-[19px] font-black text-blue-950 flex items-center gap-2">
                  <HeartPulse className="w-6 h-6 shrink-0" aria-hidden="true" />
                  {t('onboard.conditionsChronic')}
                </h2>
                <div className="flex flex-col gap-2">
                  {chronicItems.map((c) => renderConditionRow(c.id, false))}
                </div>
              </div>

              {/* 過敏原用紅色：後果等級與慢性病完全不同（絕對不能吃 vs 少吃一點） */}
              <div className="bg-white rounded-2xl p-4 border-2 border-[#A32D2D] flex flex-col gap-3">
                <h2 className="text-[19px] font-black text-[#501313] flex items-center gap-2">
                  <AlertTriangle className="w-6 h-6 shrink-0" aria-hidden="true" />
                  {t('onboard.conditionsAllergy')}
                </h2>
                <p className="text-[16px] font-bold text-[#791F1F] leading-snug">
                  {t('onboard.conditionsAllergyNote')}
                </p>
                <div className="flex flex-col gap-2">
                  {allergenItems.map((c) => renderConditionRow(c.id, true))}
                </div>
              </div>
            </>
          )}

          {/* ── 4. 性別 ─────────────────────────────────────────── */}
          {stepId === 'gender' && (
            <div className="bg-white rounded-2xl p-4 border-2 border-blue-900">
              <GenderPicker value={gender} onChange={setGender} />
            </div>
          )}

          {/* ── 5~7（長者）／5（其他）：使用教學 ──────────────────── */}
          {HOW_STEPS.includes(stepId as (typeof HOW_STEPS)[number]) && (
            <>
              <h1 className="text-[20px] font-black text-slate-950">
                {t('onboard.howTitle')}
              </h1>
              {(() => {
                const idx = HOW_STEPS.indexOf(stepId as (typeof HOW_STEPS)[number]);
                const TitleKey = `onboard.how${idx + 1}Title` as 'onboard.how1Title';
                const BodyKey = `onboard.how${idx + 1}Body` as 'onboard.how1Body';
                const Icon = idx === 0 ? Camera : idx === 1 ? ShieldCheck : WifiOff;
                const tone =
                  idx === 0
                    ? 'border-blue-900 text-blue-800'
                    : idx === 1
                    ? 'border-emerald-700 text-emerald-700'
                    : 'border-amber-700 text-amber-700';
                return (
                  <div className={`bg-white rounded-2xl p-5 border-2 ${tone.split(' ')[0]} flex flex-col gap-3`}>
                    <Icon className={`w-12 h-12 ${tone.split(' ')[1]}`} aria-hidden="true" />
                    <p className="text-[20px] font-black text-slate-950">{t(TitleKey)}</p>
                    <p className="text-[18px] font-bold text-slate-800 leading-relaxed">
                      {t(BodyKey)}
                    </p>
                  </div>
                );
              })()}
            </>
          )}

          {/* ── 5（其他身分）：一次過說明 ─────────────────────────── */}
          {stepId === 'howAll' && (
            <>
              <h1 className="text-[20px] font-black text-slate-950">
                {t('onboard.howTitle')}
              </h1>
              {[
                { n: 1, Icon: Camera, tone: 'text-blue-800' },
                { n: 2, Icon: ShieldCheck, tone: 'text-emerald-700' },
                { n: 3, Icon: WifiOff, tone: 'text-amber-700' },
              ].map(({ n, Icon, tone }) => (
                <div
                  key={`how-${n}`}
                  className="bg-white rounded-2xl p-4 border-2 border-slate-300 flex gap-3"
                >
                  <Icon className={`w-7 h-7 ${tone} shrink-0 mt-0.5`} aria-hidden="true" />
                  <div>
                    <p className="text-[18px] font-black text-slate-950">
                      {t(`onboard.how${n}Title` as 'onboard.how1Title')}
                    </p>
                    <p className="text-[16px] font-bold text-slate-800 leading-relaxed mt-1">
                      {t(`onboard.how${n}Body` as 'onboard.how1Body')}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── 8／6. AI 方式（三選一）───────────────────────────── */}
          {stepId === 'mode' && (
            <div className="bg-white rounded-2xl p-4 border-2 border-blue-900">
              <AnalysisModePicker value={analysisMode} onChange={setAnalysisMode} />
            </div>
          )}

          {/* ── 9／7. 私隱條款與免責聲明 ＋ 明確同意 ──────────────── */}
          {stepId === 'privacy' && (
            <>
              <h1 className="text-[20px] font-black text-slate-950">
                {t('onboard.privacyTitle')}
              </h1>

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
              </div>

              {/* ⚠️ 條款本文是 12px —— 全站唯一例外（見 LegalNotice.tsx）。
                  ⚠️ 未勾選同意就不能完成引導頁。 */}
              <LegalNotice
                showAgree
                agreed={agreed}
                onAgreeChange={(next) => {
                  setAgreed(next);
                  if (next) setShowAgreeWarning(false);
                }}
                showAgreeWarning={showAgreeWarning}
              />
            </>
          )}
        </div>

        {/* 底部按鈕：固定在最後，長者不必找 */}
        <div className="flex items-center gap-3 pb-2">
          {/* 上一步。
              ★ 第一頁的「上一步」＝ 回到語言選擇 ——
                選錯語言的人在這裡就能改，不用先走完再進設定找。 */}
          <button
            type="button"
            onClick={() => {
              if (current === 0) {
                setLanguageChosen(false);
                return;
              }
              setStep((s) => Math.max(0, s - 1));
            }}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-white border-2 border-slate-400 text-slate-800 text-[18px] font-black whitespace-nowrap cursor-pointer flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            {t('onboard.back')}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isLast) {
                setStep((s) => s + 1);
                return;
              }
              // ⚠️ 沒勾同意就不放行，但要「按下後才顯示原因」——
              //    直接停用按鈕的話，使用者只會覺得按了沒反應。
              if (!agreed) {
                setShowAgreeWarning(true);
                return;
              }
              finish();
            }}
            aria-disabled={isLast && !agreed}
            className={`flex-1 min-h-[48px] px-4 py-2 rounded-xl text-white text-[18px] font-black whitespace-nowrap cursor-pointer flex items-center justify-center gap-2 ${
              isLast && !agreed ? 'bg-slate-400' : 'bg-blue-800'
            }`}
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
