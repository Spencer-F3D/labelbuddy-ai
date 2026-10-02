/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 健身專區（Fitness zone）
 * ============================================================================
 *
 * 【這一頁什麼時候會出現】
 *   只有當學習者身分是「健身人士」時，才會出現在側邊選單。
 *   其他身分完全看不到 —— 理由：對一般人來說，「組數／次數／休息」是噪音，
 *   而本專案的最高原則之一是「**不要在頁面上有不用給用戶看的字**」。
 *
 * 【為什麼分成三個分頁，而不是一頁到底】
 *   三塊的**使用時機完全不同**：
 *     ┌ 個人化課表  ── 在家裡規劃時看（一次性）
 *     ├ 訓練紀錄    ── 在健身房、每做完一組就記（高頻、要快）
 *     └ 飲食與熱量  ── 吃飯前後記（一天 2～4 次）
 *   混在一頁會讓「正在健身房滿手汗要記一組」的人滑很久才找到輸入框。
 *
 * 【資料存在哪】
 *   全部在裝置上（`labelbuddy_fitness_v1`），與本 App 的隱私架構一致 ——
 *   沒有帳號、沒有雲端備份。這是刻意的：沒有雲端資料，就沒有雲端外洩。
 *   ★ 「清除所有資料」用前綴掃描（`startsWith('labelbuddy')`），
 *     所以新增這個鍵**不必**回去改清除邏輯。
 *
 * 【不做的事（刻意的）】
 *   - 不預填任何示範資料：使用者打開時就是空的（2026-10-01 使用者已明確要求過）。
 *   - 不使用 AI 生成課表（見 `src/data/fitnessContent.ts` 的說明）。
 *   - 不給醫療建議：熱量與營養素都是**估算值**，畫面上必須寫明。
 */

import React, { useMemo, useState } from 'react';
import {
  Dumbbell,
  CalendarRange,
  Flame,
  Plus,
  Trash2,
  Info,
  TrendingUp,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { apiUrl } from '../utils/apiBase';
import {
  FITNESS_GOALS,
  DAYS_OPTIONS,
  GROUP_LABEL,
  CARDIO_ADVICE,
  buildPlan,
  calcMacros,
  pick,
  type FitnessGoal,
} from '../data/fitnessContent';

/* ---------------------------------------------------------------------------
 * 型別與儲存
 * ------------------------------------------------------------------------- */

export interface WorkoutLog {
  id: string;
  /** YYYY-MM-DD（本機時區） */
  date: string;
  /** 課表名稱（自由文字，例如「推（胸肩三頭）」） */
  sessionName: string;
  /** 動作名稱（自由文字） */
  exerciseName: string;
  weightKg: number;
  sets: number;
  reps: number;
  restSec: number;
}

export interface MealLog {
  id: string;
  date: string;
  label: string;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

export type BodySex = 'male' | 'female' | 'unspecified';

export interface FitnessState {
  goal: FitnessGoal;
  daysPerWeek: number;
  body: {
    weightKg: number;
    heightCm: number;
    age: number;
    sex: BodySex;
  };
  logs: WorkoutLog[];
  meals: MealLog[];
}

export const FITNESS_STORAGE_KEY = 'labelbuddy_fitness_v1';

/** 預設狀態：**刻意不預填任何紀錄**，只給課表規劃需要的預設選項 */
export const DEFAULT_FITNESS_STATE: FitnessState = {
  goal: 'muscle',
  daysPerWeek: 3,
  body: { weightKg: 0, heightCm: 0, age: 0, sex: 'unspecified' },
  logs: [],
  meals: [],
};

export function loadFitnessState(): FitnessState {
  if (typeof window === 'undefined') return DEFAULT_FITNESS_STATE;
  try {
    const raw = localStorage.getItem(FITNESS_STORAGE_KEY);
    if (!raw) return DEFAULT_FITNESS_STATE;
    const parsed = JSON.parse(raw);
    // 逐欄位驗證：舊版或損毀的資料不可以讓整個模組炸掉
    return {
      goal: FITNESS_GOALS.some((g) => g.id === parsed?.goal) ? parsed.goal : DEFAULT_FITNESS_STATE.goal,
      daysPerWeek: (DAYS_OPTIONS as readonly number[]).includes(parsed?.daysPerWeek)
        ? parsed.daysPerWeek
        : DEFAULT_FITNESS_STATE.daysPerWeek,
      body: { ...DEFAULT_FITNESS_STATE.body, ...(parsed?.body || {}) },
      logs: Array.isArray(parsed?.logs) ? parsed.logs : [],
      meals: Array.isArray(parsed?.meals) ? parsed.meals : [],
    };
  } catch {
    return DEFAULT_FITNESS_STATE;
  }
}

function save(state: FitnessState) {
  try {
    localStorage.setItem(FITNESS_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/** 今天（本機時區）的 YYYY-MM-DD */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type ZoneTab = 'plan' | 'log' | 'nutrition';

/** AI 週報的回應形狀（與 server/fitnessReport.ts 的 FitnessReport 對應） */
interface FitnessReportData {
  /** ai = 雲端模型產生；local = 後端規則備援（AI 不可用時） */
  source: 'ai' | 'local';
  model?: string;
  headline: string;
  observations: string[];
  suggestions: string[];
  encouragement: string;
}

/* ---------------------------------------------------------------------------
 * 主元件
 * ------------------------------------------------------------------------- */

export const FitnessZone: React.FC = () => {
  const { t, language } = useI18n();
  const lang: 'zh-TW' | 'en' = language === 'en' ? 'en' : 'zh-TW';
  const [state, setState] = useState<FitnessState>(() => loadFitnessState());
  const [tab, setTab] = useState<ZoneTab>('plan');

  const update = (next: FitnessState) => {
    setState(next);
    save(next);
  };

  const plan = useMemo(() => buildPlan(state.goal, state.daysPerWeek), [state.goal, state.daysPerWeek]);

  const macros = useMemo(() => {
    const b = state.body;
    if (!b.weightKg || !b.heightCm || !b.age) return null;
    return calcMacros({
      weightKg: b.weightKg,
      heightCm: b.heightCm,
      age: b.age,
      sex: b.sex,
      daysPerWeek: state.daysPerWeek,
      goal: state.goal,
    });
  }, [state.body, state.daysPerWeek, state.goal]);

  const TABS: Array<{ id: ZoneTab; label: string; Icon: typeof Dumbbell }> = [
    { id: 'plan', label: t('fit.tabPlan'), Icon: Dumbbell },
    { id: 'log', label: t('fit.tabLog'), Icon: CalendarRange },
    { id: 'nutrition', label: t('fit.tabNutrition'), Icon: Flame },
  ];

  return (
    <div className="flex flex-col space-y-[16px]">
      {/* 標題 */}
      <div className="bg-gradient-to-r from-orange-700 to-amber-700 text-white rounded-2xl p-[16px]">
        <div className="flex items-center gap-[10px]">
          <Dumbbell className="w-[28px] h-[28px] shrink-0" aria-hidden="true" />
          <h1 className="text-[20px] font-black leading-tight">{t('fit.title')}</h1>
        </div>
        <p className="text-[16px] font-bold mt-[6px] leading-snug text-amber-50">
          {t('fit.subtitle')}
        </p>
      </div>

      {/* 分頁切換 */}
      <nav className="grid grid-cols-3 gap-[8px]" role="tablist" aria-label={t('fit.title')}>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            id={`fit-tab-${id}`}
            onClick={() => setTab(id)}
            className={`min-h-[68px] rounded-2xl flex flex-col items-center justify-center gap-[4px] cursor-pointer transition-all active:scale-95 ${
              tab === id
                ? 'bg-orange-800 text-white font-black shadow-md ring-2 ring-amber-400'
                : 'bg-slate-100 text-slate-800 font-bold border-2 border-slate-300'
            }`}
          >
            <Icon className="w-[22px] h-[22px] shrink-0" aria-hidden="true" />
            <span className="text-[16px] leading-tight text-center px-[4px]">{label}</span>
          </button>
        ))}
      </nav>

      {tab === 'plan' && (
        <PlanTab state={state} update={update} plan={plan} lang={lang} t={t} />
      )}
      {tab === 'log' && (
        <LogTab state={state} update={update} lang={lang} t={t} macros={macros} />
      )}
      {tab === 'nutrition' && (
        <NutritionTab state={state} update={update} macros={macros} lang={lang} t={t} />
      )}
    </div>
  );
};

/* ---------------------------------------------------------------------------
 * 分頁 1：個人化課表與規劃
 * ------------------------------------------------------------------------- */

const PlanTab: React.FC<{
  state: FitnessState;
  update: (s: FitnessState) => void;
  plan: ReturnType<typeof buildPlan>;
  lang: 'zh-TW' | 'en';
  /** ⚠️ 用 TranslationKey 而不是 any —— 打錯或漏加翻譯鍵要**編譯失敗**，
     不能等到使用者看到 undefined 才發現。 */
  t: (k: TranslationKey, v?: Record<string, string | number>) => string;
}> = ({ state, update, plan, lang, t }) => (
  <div className="flex flex-col space-y-[16px]">
    {/* 目標選擇 */}
    <section className="bg-white rounded-2xl p-[16px] border-2 border-slate-300 flex flex-col gap-[12px]">
      <h2 className="text-[19px] font-black text-slate-950">{t('fit.goalTitle')}</h2>
      <div className="flex flex-col gap-[8px]">
        {FITNESS_GOALS.map((g) => {
          const on = state.goal === g.id;
          return (
            <button
              key={g.id}
              type="button"
              id={`fit-goal-${g.id}`}
              aria-pressed={on}
              onClick={() => update({ ...state, goal: g.id })}
              className={`w-full text-left rounded-xl border-2 px-[12px] py-[10px] cursor-pointer transition-all active:scale-[0.99] ${
                on ? 'bg-orange-800 text-white border-orange-900' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <span className="block text-[18px] font-black">{pick(g.label, lang)}</span>
              <span className={`block text-[16px] font-bold leading-snug mt-[2px] ${on ? 'text-amber-100' : 'text-slate-600'}`}>
                {pick(g.hint, lang)}
              </span>
            </button>
          );
        })}
      </div>
    </section>

    {/* 每週天數 */}
    <section className="bg-white rounded-2xl p-[16px] border-2 border-slate-300 flex flex-col gap-[12px]">
      <h2 className="text-[19px] font-black text-slate-950">{t('fit.daysTitle')}</h2>
      <div className="flex flex-wrap gap-[8px]">
        {DAYS_OPTIONS.map((d) => {
          const on = state.daysPerWeek === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => update({ ...state, daysPerWeek: d })}
              aria-pressed={on}
              className={`min-h-[52px] px-[16px] rounded-xl border-2 text-[18px] font-black cursor-pointer transition-all active:scale-95 ${
                on ? 'bg-orange-800 text-white border-orange-900' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              {t('fit.daysUnit', { n: d })}
            </button>
          );
        })}
      </div>
    </section>

    {/* 產生的課表 */}
    <section className="bg-white rounded-2xl p-[16px] border-2 border-orange-800 flex flex-col gap-[12px]">
      <h2 className="text-[19px] font-black text-orange-950">
        {t('fit.planTitle', { n: plan.length })}
      </h2>
      {plan.map((session, i) => (
        <div key={`s-${i}`} className="rounded-xl border-2 border-slate-200 bg-slate-50 p-[12px]">
          <p className="text-[18px] font-black text-slate-950">
            {t('fit.dayN', { n: i + 1 })}　{pick(session.name, lang)}
          </p>
          <ul className="mt-[6px] flex flex-col gap-[4px]">
            {session.items.map((it) => (
              <li key={it.exercise.id} className="text-[16px] font-bold text-slate-800 leading-snug">
                {pick(it.exercise.name, lang)}
                <span className="text-slate-600">
                  {' '}
                  ｜{t('fit.prescription', { sets: it.sets, reps: it.reps, rest: it.restSec })}
                </span>
                <span className="text-slate-500"> ｜{pick(it.exercise.equipment, lang)}</span>
              </li>
            ))}
          </ul>
          {session.cardio && (
            <p className="mt-[6px] text-[16px] font-bold text-orange-900 bg-amber-50 rounded-lg px-[8px] py-[6px]">
              {t('fit.cardioAfter')}
            </p>
          )}
        </div>
      ))}

      {/* 有氧建議（增肌目標不顯示） */}
      {CARDIO_ADVICE[state.goal] && (
        <p className="text-[16px] font-bold text-slate-800 bg-sky-50 border border-sky-200 rounded-xl px-[12px] py-[10px] leading-snug">
          {pick(CARDIO_ADVICE[state.goal]!, lang)}
        </p>
      )}

      <p className="flex items-start gap-[6px] text-[16px] font-bold text-slate-600 leading-snug">
        <Info className="w-[18px] h-[18px] shrink-0 mt-[1px]" aria-hidden="true" />
        {t('fit.planNote')}
      </p>
    </section>
  </div>
);

/* ---------------------------------------------------------------------------
 * 分頁 2：訓練與進度記錄
 * ------------------------------------------------------------------------- */

const LogTab: React.FC<{
  state: FitnessState;
  update: (s: FitnessState) => void;
  lang: 'zh-TW' | 'en';
  /** ⚠️ 用 TranslationKey 而不是 any —— 打錯或漏加翻譯鍵要**編譯失敗**，
     不能等到使用者看到 undefined 才發現。 */
  t: (k: TranslationKey, v?: Record<string, string | number>) => string;
  /** 每日目標（AI 週報要拿來和使用者的實際攝取比較） */
  macros: ReturnType<typeof calcMacros> | null;
}> = ({ state, update, lang, t, macros }) => {
  const [form, setForm] = useState({
    sessionName: '',
    exerciseName: '',
    weightKg: '',
    sets: '3',
    reps: '10',
    restSec: '90',
  });

  const add = () => {
    const weightKg = Number(form.weightKg);
    const sets = Number(form.sets);
    const reps = Number(form.reps);
    const restSec = Number(form.restSec);
    if (!form.exerciseName.trim() || !(sets > 0) || !(reps > 0)) return;
    const log: WorkoutLog = {
      id: `w-${Date.now()}`,
      date: today(),
      sessionName: form.sessionName.trim(),
      exerciseName: form.exerciseName.trim(),
      weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0,
      sets,
      reps,
      restSec: Number.isFinite(restSec) && restSec >= 0 ? restSec : 0,
    };
    update({ ...state, logs: [log, ...state.logs] });
    setForm((f) => ({ ...f, exerciseName: '', weightKg: '' }));
  };

  const remove = (id: string) => update({ ...state, logs: state.logs.filter((l) => l.id !== id) });

  /* ── AI 週報 ──────────────────────────────────────────────
     ⚠️ 只送「彙總數字」，不送逐筆紀錄（見 server/fitnessReport.ts 的說明）。
        前端也必須把這件事寫在畫面上 —— 使用者有權在按下按鈕前知道。 */
  const [report, setReport] = useState<FitnessReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(false);

  const generateReport = async () => {
    setReportLoading(true);
    setReportError(false);
    setReport(null);
    try {
      // 近 7 天（與圖表同一段區間）
      const since = weekly[0]?.date ?? today();
      const recent = state.logs.filter((l) => l.date >= since);
      const days = new Set(recent.map((l) => l.date));
      const totalVolume = recent.reduce((s, l) => s + l.weightKg * l.sets * l.reps, 0);
      const exercises = [...new Set(recent.map((l) => l.exerciseName))].slice(0, 8);

      const daysInWindow = 7;
      const meals = state.meals.filter((m) => m.date >= since);
      const loggedDays = new Set(meals.map((m) => m.date)).size || 1;
      const avgKcal = meals.reduce((s, m) => s + m.kcal, 0) / loggedDays;
      const avgProteinG = meals.reduce((s, m) => s + m.proteinG, 0) / loggedDays;

      const res = await fetch(apiUrl('/api/fitness-report'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: lang,
          goal: state.goal,
          daysPerWeek: state.daysPerWeek,
          trainedDays: days.size,
          totalVolume,
          exercises,
          avgKcal,
          avgProteinG,
          targetKcal: macros?.target ?? 0,
          targetProteinG: macros?.proteinG ?? 0,
          daysInWindow,
        }),
      });
      const json = await res.json();
      if (json?.success && json.data) {
        setReport(json.data as FitnessReportData);
      } else {
        setReportError(true);
      }
    } catch {
      setReportError(true);
    } finally {
      setReportLoading(false);
    }
  };

  /**
   * 每週訓練量（Σ 重量 × 組數 × 次數）。
   *
   * ⚠️ 只算「有填重量」的紀錄。自重訓練（伏地挺身、平板支撐）重量是 0，
   *    算進去會讓圖表看起來像「這週沒練」—— 那是**錯誤的視覺暗示**。
   *    所以圖表下方要說明「只計算有填重量的動作」。
   */
  const weekly = useMemo(() => {
    const days: Array<{ date: string; volume: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const p = (n: number) => String(n).padStart(2, '0');
      const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      const volume = state.logs
        .filter((l) => l.date === key)
        .reduce((s, l) => s + l.weightKg * l.sets * l.reps, 0);
      days.push({ date: key, volume });
    }
    return days;
  }, [state.logs]);

  const maxVolume = Math.max(1, ...weekly.map((d) => d.volume));

  const inputCls =
    'w-full min-h-[52px] px-[12px] rounded-xl border-2 border-slate-300 bg-white text-[18px] font-bold text-slate-900 focus:border-orange-700 focus:outline-hidden';

  return (
    <div className="flex flex-col space-y-[16px]">
      {/* 輸入 */}
      <section className="bg-white rounded-2xl p-[16px] border-2 border-slate-300 flex flex-col gap-[10px]">
        <h2 className="text-[19px] font-black text-slate-950">{t('fit.addTitle')}</h2>
        <input
          id="fit-input-exercise"
          className={inputCls}
          placeholder={t('fit.phExercise')}
          value={form.exerciseName}
          onChange={(e) => setForm({ ...form, exerciseName: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder={t('fit.phSession')}
          value={form.sessionName}
          onChange={(e) => setForm({ ...form, sessionName: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-[8px]">
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder={t('fit.phWeight')}
            value={form.weightKg}
            onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
          />
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder={t('fit.phSets')}
            value={form.sets}
            onChange={(e) => setForm({ ...form, sets: e.target.value })}
          />
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder={t('fit.phReps')}
            value={form.reps}
            onChange={(e) => setForm({ ...form, reps: e.target.value })}
          />
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder={t('fit.phRest')}
            value={form.restSec}
            onChange={(e) => setForm({ ...form, restSec: e.target.value })}
          />
        </div>
        <button
          type="button"
          id="fit-add-log"
          onClick={add}
          disabled={!form.exerciseName.trim()}
          className="w-full min-h-[60px] rounded-2xl bg-orange-800 hover:bg-orange-900 disabled:opacity-50 text-white text-[19px] font-black flex items-center justify-center gap-[8px] cursor-pointer active:scale-95 border-2 border-orange-950"
        >
          <Plus className="w-[22px] h-[22px] shrink-0" aria-hidden="true" />
          {t('fit.addButton')}
        </button>
      </section>

      {/* 圖表 */}
      <section className="bg-white rounded-2xl p-[16px] border-2 border-slate-300 flex flex-col gap-[10px]">
        <h2 className="text-[19px] font-black text-slate-950 flex items-center gap-[6px]">
          <TrendingUp className="w-[22px] h-[22px] shrink-0 text-orange-800" aria-hidden="true" />
          {t('fit.chartTitle')}
        </h2>
        <div className="flex items-end justify-between gap-[6px] h-[120px]" role="img" aria-label={t('fit.chartTitle')}>
          {weekly.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-[4px] h-full">
              <div
                className={`w-full rounded-t-md ${d.volume > 0 ? 'bg-orange-700' : 'bg-slate-200'}`}
                style={{ height: `${Math.max(4, (d.volume / maxVolume) * 96)}px` }}
                title={`${d.date}: ${d.volume} kg`}
              />
              <span className="text-[16px] font-bold text-slate-600">{d.date.slice(8)}</span>
            </div>
          ))}
        </div>
        <p className="text-[16px] font-bold text-slate-600 leading-snug">{t('fit.chartNote')}</p>
      </section>

      {/* 紀錄清單 */}
      <section className="bg-white rounded-2xl p-[16px] border-2 border-slate-300 flex flex-col gap-[10px]">
        <h2 className="text-[19px] font-black text-slate-950">
          {t('fit.logTitle', { n: state.logs.length })}
        </h2>
        {state.logs.length === 0 ? (
          <p className="text-[16px] font-bold text-slate-500 bg-slate-50 rounded-xl px-[12px] py-[10px]">
            {t('fit.logEmpty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-[8px]">
            {state.logs.slice(0, 30).map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-[8px] rounded-xl border border-slate-200 bg-slate-50 px-[12px] py-[8px]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[18px] font-black text-slate-950 truncate">
                    {l.exerciseName}
                    {l.weightKg > 0 && <span className="text-orange-900">　{l.weightKg} kg</span>}
                  </p>
                  <p className="text-[16px] font-bold text-slate-600">
                    {t('fit.logDetail', { sets: l.sets, reps: l.reps, rest: l.restSec })}｜{l.date}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(l.id)}
                  aria-label={t('fit.deleteAria', { name: l.exerciseName })}
                  className="w-[44px] h-[44px] shrink-0 rounded-xl bg-white border-2 border-slate-300 hover:border-rose-400 text-rose-700 flex items-center justify-center cursor-pointer active:scale-90"
                >
                  <Trash2 className="w-[20px] h-[20px]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── AI 週報（2026-10-02）──────────────────────────────
          ⚠️ 隱私：健身紀錄平常完全留在裝置上（專區介紹頁也這樣寫）。
             所以這顆按鈕**必須自己講清楚**它會送出什麼 ——
             與標籤辨識的同意閘門是同一條原則：
             「不可以在使用者不知道的情況下上傳」。 */}
      <section className="bg-white rounded-2xl p-[16px] border-2 border-indigo-700 flex flex-col gap-[10px]">
        <h2 className="text-[19px] font-black text-indigo-950 flex items-center gap-[6px]">
          <Sparkles className="w-[22px] h-[22px] shrink-0 text-indigo-700" aria-hidden="true" />
          {t('fit.reportTitle')}
        </h2>
        <p className="text-[16px] font-bold text-slate-700 leading-snug">{t('fit.reportNote')}</p>

        <button
          type="button"
          id="fit-generate-report"
          onClick={generateReport}
          disabled={reportLoading || state.logs.length === 0}
          className="w-full min-h-[60px] rounded-2xl bg-indigo-800 hover:bg-indigo-900 disabled:opacity-50 text-white text-[19px] font-black flex items-center justify-center gap-[8px] cursor-pointer active:scale-95 border-2 border-indigo-950"
        >
          {reportLoading ? (
            <>
              <Loader2 className="w-[22px] h-[22px] shrink-0 animate-spin" aria-hidden="true" />
              {t('fit.reportLoading')}
            </>
          ) : (
            <>
              <Sparkles className="w-[22px] h-[22px] shrink-0" aria-hidden="true" />
              {t('fit.reportButton')}
            </>
          )}
        </button>

        {reportError && (
          <p className="text-[16px] font-bold text-rose-800 bg-rose-50 border-2 border-rose-300 rounded-xl px-[12px] py-[10px] leading-snug">
            {t('fit.reportError')}
          </p>
        )}

        {report && (
          <div className="flex flex-col gap-[8px]" id="fit-report-result">
            {/* 來源標籤：AI 或本機。使用者有權知道自己拿到的是哪一種。 */}
            <span
              className={`self-start text-[16px] font-black px-[10px] py-[2px] rounded-full ${
                report.source === 'ai'
                  ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                  : 'bg-slate-100 text-slate-700 border border-slate-300'
              }`}
            >
              {report.source === 'ai' ? t('fit.reportSourceAi') : t('fit.reportSourceLocal')}
            </span>

            <p className="text-[19px] font-black text-slate-950 leading-snug">{report.headline}</p>

            {report.observations.length > 0 && (
              <div>
                <p className="text-[16px] font-black text-slate-800">{t('fit.reportObs')}</p>
                <ul className="mt-[4px] flex flex-col gap-[4px]">
                  {report.observations.map((o) => (
                    <li key={o} className="text-[16px] font-bold text-slate-700 leading-snug">
                      ・{o}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.suggestions.length > 0 && (
              <div>
                <p className="text-[16px] font-black text-slate-800">{t('fit.reportSuggest')}</p>
                <ul className="mt-[4px] flex flex-col gap-[4px]">
                  {report.suggestions.map((s) => (
                    <li key={s} className="text-[16px] font-bold text-slate-700 leading-snug">
                      ・{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.encouragement && (
              <p className="text-[16px] font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-xl px-[12px] py-[8px] leading-snug">
                {report.encouragement}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

/* ---------------------------------------------------------------------------
 * 分頁 3：飲食與熱量追蹤
 * ------------------------------------------------------------------------- */

const NutritionTab: React.FC<{
  state: FitnessState;
  update: (s: FitnessState) => void;
  macros: ReturnType<typeof calcMacros> | null;
  lang: 'zh-TW' | 'en';
  /** ⚠️ 用 TranslationKey 而不是 any —— 打錯或漏加翻譯鍵要**編譯失敗**，
     不能等到使用者看到 undefined 才發現。 */
  t: (k: TranslationKey, v?: Record<string, string | number>) => string;
}> = ({ state, update, macros, lang, t }) => {
  const [meal, setMeal] = useState({ label: '', kcal: '', proteinG: '', carbG: '', fatG: '' });

  const body = state.body;
  const setBody = (patch: Partial<FitnessState['body']>) =>
    update({ ...state, body: { ...body, ...patch } });

  const addMeal = () => {
    const kcal = Number(meal.kcal);
    if (!(kcal > 0)) return;
    update({
      ...state,
      meals: [
        {
          id: `m-${Date.now()}`,
          date: today(),
          label: meal.label.trim(),
          kcal,
          proteinG: Number(meal.proteinG) || 0,
          carbG: Number(meal.carbG) || 0,
          fatG: Number(meal.fatG) || 0,
        },
        ...state.meals,
      ],
    });
    setMeal({ label: '', kcal: '', proteinG: '', carbG: '', fatG: '' });
  };

  const todayMeals = state.meals.filter((m) => m.date === today());
  const sum = todayMeals.reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      proteinG: a.proteinG + m.proteinG,
      carbG: a.carbG + m.carbG,
      fatG: a.fatG + m.fatG,
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 }
  );

  const inputCls =
    'w-full min-h-[52px] px-[12px] rounded-xl border-2 border-slate-300 bg-white text-[18px] font-bold text-slate-900 focus:border-orange-700 focus:outline-hidden';

  /** 一列「目標 vs 今日」 */
  const Bar = ({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) => {
    const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
    return (
      <div className="flex flex-col gap-[4px]">
        <div className="flex items-baseline justify-between gap-[8px]">
          <span className="text-[16px] font-black text-slate-800">{label}</span>
          <span className="text-[16px] font-bold text-slate-600 whitespace-nowrap">
            {Math.round(value)} / {Math.round(target)} {unit}（{pct}%）
          </span>
        </div>
        <div className="w-full h-[12px] bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-orange-700" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col space-y-[16px]">
      {/* 身體資料 */}
      <section className="bg-white rounded-2xl p-[16px] border-2 border-slate-300 flex flex-col gap-[10px]">
        <h2 className="text-[19px] font-black text-slate-950">{t('fit.bodyTitle')}</h2>
        <div className="grid grid-cols-2 gap-[8px]">
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder={t('fit.phBodyWeight')}
            value={body.weightKg || ''}
            onChange={(e) => setBody({ weightKg: Number(e.target.value) || 0 })}
          />
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder={t('fit.phBodyHeight')}
            value={body.heightCm || ''}
            onChange={(e) => setBody({ heightCm: Number(e.target.value) || 0 })}
          />
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder={t('fit.phBodyAge')}
            value={body.age || ''}
            onChange={(e) => setBody({ age: Number(e.target.value) || 0 })}
          />
          <select
            className={inputCls}
            aria-label={t('fit.bodySexAria')}
            value={body.sex}
            onChange={(e) => setBody({ sex: e.target.value as BodySex })}
          >
            <option value="unspecified">{t('fit.sexUnspecified')}</option>
            <option value="male">{t('fit.sexMale')}</option>
            <option value="female">{t('fit.sexFemale')}</option>
          </select>
        </div>
      </section>

      {/* 目標 */}
      {macros ? (
        <section className="bg-white rounded-2xl p-[16px] border-2 border-orange-800 flex flex-col gap-[12px]">
          <h2 className="text-[19px] font-black text-orange-950">{t('fit.targetTitle')}</h2>
          <p className="text-[20px] font-black text-slate-950">
            {t('fit.kcalTarget', { n: macros.target })}
          </p>
          <div className="flex flex-col gap-[10px]">
            <Bar label={t('fit.macroProtein')} value={sum.proteinG} target={macros.proteinG} unit={t('fit.unitG')} />
            <Bar label={t('fit.macroCarb')} value={sum.carbG} target={macros.carbG} unit={t('fit.unitG')} />
            <Bar label={t('fit.macroFat')} value={sum.fatG} target={macros.fatG} unit={t('fit.unitG')} />
          </div>
          <p className="text-[16px] font-bold text-slate-700 leading-snug">{pick(macros.note, lang)}</p>
          <p className="flex items-start gap-[6px] text-[16px] font-bold text-slate-600 leading-snug">
            <Info className="w-[18px] h-[18px] shrink-0 mt-[1px]" aria-hidden="true" />
            {t('fit.estimateNote')}
          </p>
        </section>
      ) : (
        <p className="text-[16px] font-bold text-slate-600 bg-amber-50 border-2 border-amber-300 rounded-2xl px-[12px] py-[10px]">
          {t('fit.needBody')}
        </p>
      )}

      {/* 今日紀錄 */}
      <section className="bg-white rounded-2xl p-[16px] border-2 border-slate-300 flex flex-col gap-[10px]">
        <h2 className="text-[19px] font-black text-slate-950">{t('fit.todayTitle')}</h2>
        <input
          className={inputCls}
          placeholder={t('fit.phMeal')}
          value={meal.label}
          onChange={(e) => setMeal({ ...meal, label: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-[8px]">
          <input className={inputCls} inputMode="numeric" placeholder={t('fit.phKcal')} value={meal.kcal} onChange={(e) => setMeal({ ...meal, kcal: e.target.value })} />
          <input className={inputCls} inputMode="decimal" placeholder={t('fit.phProtein')} value={meal.proteinG} onChange={(e) => setMeal({ ...meal, proteinG: e.target.value })} />
          <input className={inputCls} inputMode="decimal" placeholder={t('fit.phCarb')} value={meal.carbG} onChange={(e) => setMeal({ ...meal, carbG: e.target.value })} />
          <input className={inputCls} inputMode="decimal" placeholder={t('fit.phFat')} value={meal.fatG} onChange={(e) => setMeal({ ...meal, fatG: e.target.value })} />
        </div>
        <button
          type="button"
          id="fit-add-meal"
          onClick={addMeal}
          disabled={!(Number(meal.kcal) > 0)}
          className="w-full min-h-[60px] rounded-2xl bg-orange-800 hover:bg-orange-900 disabled:opacity-50 text-white text-[19px] font-black flex items-center justify-center gap-[8px] cursor-pointer active:scale-95 border-2 border-orange-950"
        >
          <Plus className="w-[22px] h-[22px] shrink-0" aria-hidden="true" />
          {t('fit.addMeal')}
        </button>

        <p className="text-[18px] font-black text-slate-950">
          {t('fit.todayKcal', { n: Math.round(sum.kcal) })}
        </p>

        {todayMeals.length > 0 && (
          <ul className="flex flex-col gap-[6px]">
            {todayMeals.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-[8px] rounded-xl border border-slate-200 bg-slate-50 px-[12px] py-[8px]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[18px] font-black text-slate-950 truncate">
                    {m.label || t('fit.unnamedMeal')}
                  </p>
                  <p className="text-[16px] font-bold text-slate-600">
                    {m.kcal} kcal｜P {m.proteinG}／C {m.carbG}／F {m.fatG} g
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => update({ ...state, meals: state.meals.filter((x) => x.id !== m.id) })}
                  aria-label={t('fit.deleteAria', { name: m.label || t('fit.unnamedMeal') })}
                  className="w-[44px] h-[44px] shrink-0 rounded-xl bg-white border-2 border-slate-300 hover:border-rose-400 text-rose-700 flex items-center justify-center cursor-pointer active:scale-90"
                >
                  <Trash2 className="w-[20px] h-[20px]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="flex items-start gap-[6px] text-[16px] font-bold text-slate-600 leading-snug">
          <Info className="w-[18px] h-[18px] shrink-0 mt-[1px]" aria-hidden="true" />
          {t('fit.mealNote')}
        </p>
        <p className="text-[16px] font-bold text-slate-500 leading-snug">
          {t('fit.groupHint', { list: Object.values(GROUP_LABEL).map((g) => pick(g, lang)).join('・') })}
        </p>
      </section>
    </div>
  );
};
