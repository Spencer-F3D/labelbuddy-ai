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

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Camera,
  Cloud,
  WifiOff,
  ArrowRight,
  ArrowLeft,
  Check,
  HeartPulse,
  AlertTriangle,
  // 第一頁的功能清單圖示（2026-09-30）
  Calendar,
  GraduationCap,
  MessageCircleQuestion,
  SlidersHorizontal,
  // 向下捲動提示（2026-10-02）
  ChevronDown,
} from 'lucide-react';
import { AnalysisMode, LearnerProfileId } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { LearnerProfilePicker } from './LearnerProfilePicker';
import { LegalNotice } from './LegalNotice';
import { AnalysisModePicker } from './AnalysisModePicker';
// 語言閘門（2026-09-30）：全流程的第一頁，獨立於編號步驟之外。
import { OnboardingLanguageStep } from './OnboardingLanguageStep';
import { PHYSICAL_INDICATORS } from '../data/conditions';
import { conditionName } from '../data/bilingual';

/**
 * ★ 2026-10-02 使用者指定：**刪除有關稱呼、性別的東西**。
 *
 * 原本引導頁第 4 步是「要怎麼稱呼您？」（先生／小姐／不指定），
 * 連帶 `Gender` 型別、`OnboardingResult.gender`、
 * 以及後端的 `buildAddressRule`／`applyHonorific*` 全部移除。
 * 現在流程是：語言閘門 → 介紹 → 身分 → 慢性病與過敏 → 教學 → AI 方式 → 私隱。
 * （長者 8 頁、其他 6 頁 —— 比原本各少 1 頁。）
 */

export interface OnboardingResult {
  profileId: LearnerProfileId;
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
  | 'how1'
  | 'how2'
  | 'how3'
  | 'howAll'
  | 'mode'
  | 'privacy';

/** 依身分決定步驟序列。長者把教學拆成 3 頁，其他身分合併成 1 頁。 */
function buildSteps(profileId: LearnerProfileId): StepId[] {
  const common: StepId[] = ['intro', 'profile', 'conditions'];
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

  /**
   * 向下捲動提示（2026-10-02 使用者要求）。
   *
   * 【為什麼需要】
   *   引導頁有 5 頁的內容超出手機畫面（實測第 3 頁超出 859px，
   *   是螢幕的 1.3 倍高）。而**「下一步」按鈕在捲動容器裡面** ——
   *   也就是說，內容溢出的頁面，使用者**看不到按鈕**，
   *   會以為「這一頁卡住了、按不動」。
   *
   *   使用者原話：「如果一定要滾動才能展示，可以像一些普通頁面的
   *   新手教學一樣弄一個半透明的向下箭頭方塊作為輔助引導。」
   *
   * 【為什麼是「半透明方塊」而不是一條細線】
   *   長者對細微的視覺線索不敏感。一個有面積、會微微上下浮動的方塊，
   *   比一條 2px 的漸層線更容易被注意到。
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  /** 重新判斷「下面還有沒有內容」。捲動、換頁、視窗縮放都要呼叫。 */
  const updateScrollHint = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 留 24px 容差：捲到非常接近底部時就收起來，不要讓它閃來閃去
    const more = el.scrollHeight - el.scrollTop - el.clientHeight > 24;
    setShowScrollHint(more);
  }, []);

  /** 換頁之後重新判斷（新的一頁高度不同）。 */
  useEffect(() => {
    // 換頁時先回到頂端，否則會沿用上一頁的捲動位置
    scrollRef.current?.scrollTo({ top: 0 });
    updateScrollHint();
    // 內容有圖片／字型載入完成後高度會變，所以延後再量一次
    const timer = setTimeout(updateScrollHint, 300);
    return () => clearTimeout(timer);
  }, [step, languageChosen, updateScrollHint]);

  /** 視窗尺寸改變（例如轉橫向）也要重算。 */
  useEffect(() => {
    window.addEventListener('resize', updateScrollHint);
    return () => window.removeEventListener('resize', updateScrollHint);
  }, [updateScrollHint]);

  const steps = buildSteps(profileId);
  /**
   * ⚠️ 夾取：使用者可能回頭把身分從「長者」改成別的，
   *    此時 steps 會從 9 個變 7 個，原本的 step 可能超出範圍。
   *    不夾取就會拿到 undefined → 整頁空白（而且不會報錯）。
   */
  const current = Math.min(step, steps.length - 1);
  const stepId = steps[current];
  const isLast = current === steps.length - 1;

  const finish = () => onComplete({ profileId, analysisMode, conditions });

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
    /* ⚠️ `id="onboarding-flow"` 是給**檢查腳本**用的穩定錨點。
       以前它靠「第 N 步，共 M 步」偵測引導頁，但 2026-09-30 使用者要求
       移除進度指示 —— 那行字沒了，偵測就會失效（而且會靜默跳過整個引導頁）。
       改用 id 之後，文案怎麼改都不影響偵測。 */
    <div
      id="onboarding-flow"
      ref={scrollRef}
      onScroll={updateScrollHint}
      className="fixed inset-0 z-[60] bg-slate-100 overflow-y-auto"
    >
      {/* ⚠️ 內距與間距用明確 px：`:root{font-size:20px}` 讓 `p-4`/`gap-4`
          實際是 20px（不是 16px，Tailwind 的 rem 被放大了 1.25 倍）。 */}
      <div className="mx-auto w-full max-w-[560px] min-h-screen flex flex-col p-[16px] gap-[16px]">
        {/* ⚠️ 2026-09-30 使用者要求：移除上方的步數與進度條。
            理由：長者在引導頁只想趕快設定完，數字只會增加壓力，
            而且總頁數會依身分變動（長者 9／其他 7），顯示數字反而困惑。 */}
        <div className="pt-2" />

        <div className="flex-1 flex flex-col gap-4">
          {/* ── 1. 產品介紹（一眼看懂 ＋ 講到每一個功能）────────────
              ★ 這一頁要同時做到兩件事（使用者 09-30 指定）：
                ① 3 秒內知道這個 App 是做什麼的 → 標題 ＋ 功能清單
                ② **每一個功能都要提到** → 下方六條功能清單
              ★ 順序刻意是「先講結果，再講怎麼做」：
                「拍標籤 → 知道能不能買」比「拍一張，我幫您看」明確得多。
              ⚠️ 2026-09-30 使用者要求：**移除「營養標示圖解」**
                （原本的「模擬標籤 → 綠燈可以買」視覺對照）。
                連帶移除了 5 個 introShot* 翻譯鍵與那段模擬標籤的排版。 */}
          {stepId === 'intro' && (
            <>
              <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-5">
                <p className="text-[16px] font-black text-blue-200 tracking-wide">
                  {t('onboard.introKicker')}
                </p>
                <h1 className="text-[20px] font-black mt-1 leading-tight">
                  {t('onboard.introTitle')}
                </h1>
                <p className="text-[16px] font-bold mt-2 leading-relaxed text-blue-50">
                  {t('onboard.introBody')}
                </p>
              </div>

              {/* 功能清單：把 App 的每一個功能都講到（標題 ＋ 說明）
                  ★ 2026-10-02 使用者明確指示：**這一頁保留說明、接受滾動。**
                    「不用滾動」的要求是給**語言選擇頁**（見 OnboardingLanguageStep），
                    不是這一頁 —— 我先前把這裡的說明砍掉是修錯地方，已還原。
                    本頁高度約 1010px（畫面 640px），會出現向下捲動提示。 */}
              <div className="bg-white rounded-2xl p-4 border-2 border-slate-300 flex flex-col gap-3">
                <h2 className="text-[19px] font-black text-slate-950">
                  {t('onboard.featListTitle')}
                </h2>
                {[
                  { n: 1, Icon: Camera },
                  { n: 2, Icon: MessageCircleQuestion },
                  { n: 3, Icon: Calendar },
                  { n: 4, Icon: GraduationCap },
                  { n: 5, Icon: MessageCircleQuestion },
                  { n: 6, Icon: SlidersHorizontal },
                ].map(({ n, Icon }) => (
                  <div key={`feat-${n}`} className="flex items-start gap-3">
                    <Icon className="w-6 h-6 text-blue-800 shrink-0 mt-[3px]" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[18px] font-black text-slate-900 leading-snug">
                        {t(`onboard.feat${n}Title` as 'onboard.feat1Title')}
                      </p>
                      <p className="text-[16px] font-bold text-slate-600 leading-snug">
                        {t(`onboard.feat${n}Body` as 'onboard.feat1Body')}
                      </p>
                    </div>
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

              {/* 過敏原用紅色：與慢性病在視覺上區隔開（這是最容易誤食的一類） */}
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

        {/* ⚠️ 2026-10-01 使用者要求：刪除「之後可以隨時在設定裡換語言」提示。
            理由：引導頁最前面已經有語言閘門（而且有「之後可以隨時更改」的說明），
            每一頁底部再重複一次只是噪音。 */}
      </div>

      {/* ── 向下捲動提示（2026-10-02）────────────────────────────
          ★ 只在「下面還有內容」時出現，捲到底就自動收起。
          ★ 刻意用 `fixed` 定位在畫面底部：因為「下一步」按鈕本身
            也在捲動容器裡，內容溢出時它會落在畫面之外 ——
            使用者會以為這一頁壞掉了。這個提示告訴他「下面還有東西」。
          ⚠️ 它必須放在捲動容器 `#onboarding-flow` **裡面**才蓋得住內容，
             但用 fixed 定位所以不隨捲動移動。 */}
      {showScrollHint && (
        <button
          type="button"
          id="onboarding-scroll-hint"
          onClick={() => {
            const el = scrollRef.current;
            if (!el) return;
            // 捲「一個畫面高」的 80%，讓使用者看得出有進展但不會跳過內容
            el.scrollBy({ top: el.clientHeight * 0.8, behavior: 'smooth' });
          }}
          aria-label={t('onboard.scrollHint')}
          className="fixed bottom-[20px] left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-[2px] px-[18px] py-[10px] rounded-[16px] bg-blue-900/85 backdrop-blur-[2px] border-2 border-white/70 shadow-2xl cursor-pointer animate-bounce"
        >
          <ChevronDown className="w-[34px] h-[34px] text-white" aria-hidden="true" />
          <span className="text-[16px] font-black text-white whitespace-nowrap">
            {t('onboard.scrollHint')}
          </span>
        </button>
      )}
    </div>
  );
};
