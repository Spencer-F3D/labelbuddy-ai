/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 日常生理指標（Daily Vital Metrics）
 * ============================================================================
 * 血壓、心跳、血糖、尿酸／血脂的輸入與即時評估。
 *
 * 【雙語設計（2026-09-28 第三階段）】
 *   狀態評估函式（getBpStatus 等）**只回傳「翻譯鍵」，不回傳字串**。
 *   原因：這些函式在 render 之外被呼叫（也算在 speech 字串裡），
 *   若直接回傳中文，就必須把 t() 一路傳進來，函式簽名會被污染。
 *   回傳鍵、在 render 時才 t()，是最小改動且不會漏翻的做法。
 */

import React from 'react';
import {
  HeartPulse,
  Activity,
  Droplet,
  Plus,
  Minus,
  Volume2,
} from 'lucide-react';
import { SeniorPhysicalIndicators } from '../types';
import { speakText, stopSpeech } from '../utils/tts';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

interface VitalMetricsSectionProps {
  indicators: SeniorPhysicalIndicators;
  onChangeIndicators: (updated: SeniorPhysicalIndicators) => void;
  onSyncConditionsWithVitals?: () => void;
}

/** 評估結果：只帶翻譯鍵，字串在 render 時才解析 */
interface StatusResult {
  level: 'red' | 'yellow' | 'green';
  badgeKey: TranslationKey;
  colorClass: string;
  adviceKey: TranslationKey;
}

export const VitalMetricsSection: React.FC<VitalMetricsSectionProps> = ({
  indicators,
  onChangeIndicators,
}) => {
  const { t } = useI18n();

  // 1. 血壓狀態評估
  const getBpStatus = (systolic: number, diastolic: number): StatusResult => {
    if (systolic >= 140 || diastolic >= 90) {
      return {
        level: 'red' as const,
        badgeKey: 'vitals.bp.statusHigh',
        colorClass: 'bg-rose-100 text-rose-950 border-rose-400',
        adviceKey: 'vitals.bp.adviceHigh',
      };
    }
    if (systolic >= 130 || diastolic >= 85) {
      return {
        level: 'yellow' as const,
        badgeKey: 'vitals.bp.statusSlight',
        colorClass: 'bg-amber-100 text-amber-950 border-amber-400',
        adviceKey: 'vitals.bp.adviceSlight',
      };
    }
    return {
      level: 'green' as const,
      badgeKey: 'vitals.bp.statusNormal',
      colorClass: 'bg-emerald-100 text-emerald-950 border-emerald-400',
      adviceKey: 'vitals.bp.adviceNormal',
    };
  };

  // 2. 心跳狀態評估
  const getHeartRateStatus = (hr: number): StatusResult => {
    if (hr > 100) {
      return {
        level: 'red' as const,
        badgeKey: 'vitals.hr.statusFast',
        colorClass: 'bg-rose-100 text-rose-950 border-rose-400',
        adviceKey: 'vitals.hr.adviceFast',
      };
    }
    if (hr < 55) {
      return {
        level: 'yellow' as const,
        badgeKey: 'vitals.hr.statusSlow',
        colorClass: 'bg-amber-100 text-amber-950 border-amber-400',
        adviceKey: 'vitals.hr.adviceSlow',
      };
    }
    return {
      level: 'green' as const,
      badgeKey: 'vitals.hr.statusNormal',
      colorClass: 'bg-emerald-100 text-emerald-950 border-emerald-400',
      adviceKey: 'vitals.hr.adviceNormal',
    };
  };

  // 3. 血糖狀態評估
  const getBloodSugarStatus = (
    val: number,
    unit: 'mmol/L' | 'mg/dL',
    timing: 'fasting' | 'post_meal'
  ): StatusResult => {
    const isMmol = unit === 'mmol/L';
    let isHigh = false;
    let isBorderline = false;

    if (timing === 'fasting') {
      // 空腹
      if (isMmol) {
        if (val >= 7.0) isHigh = true;
        else if (val >= 6.1) isBorderline = true;
      } else {
        if (val >= 126) isHigh = true;
        else if (val >= 100) isBorderline = true;
      }
    } else {
      // 飯後 2 小時
      if (isMmol) {
        if (val >= 10.0) isHigh = true;
        else if (val >= 7.8) isBorderline = true;
      } else {
        if (val >= 180) isHigh = true;
        else if (val >= 140) isBorderline = true;
      }
    }

    if (isHigh) {
      return {
        level: 'red' as const,
        badgeKey: 'vitals.bs.statusHigh',
        colorClass: 'bg-rose-100 text-rose-950 border-rose-400',
        adviceKey: 'vitals.bs.adviceHigh',
      };
    }
    if (isBorderline) {
      return {
        level: 'yellow' as const,
        badgeKey: 'vitals.bs.statusSlight',
        colorClass: 'bg-amber-100 text-amber-950 border-amber-400',
        adviceKey: 'vitals.bs.adviceSlight',
      };
    }
    return {
      level: 'green' as const,
      badgeKey: 'vitals.bs.statusNormal',
      colorClass: 'bg-emerald-100 text-emerald-950 border-emerald-400',
      adviceKey: 'vitals.bs.adviceNormal',
    };
  };

  const bpStatus = getBpStatus(indicators.systolicBp, indicators.diastolicBp);
  const hrStatus = getHeartRateStatus(indicators.heartRate || 72);
  const bsStatus = getBloodSugarStatus(
    indicators.bloodSugar,
    indicators.bloodSugarUnit,
    indicators.bloodSugarTiming
  );

  // 語音朗讀全部指標
  const handleSpeakVitals = () => {
    stopSpeech();
    const speechText = t('vitals.speech', {
      sys: indicators.systolicBp,
      dia: indicators.diastolicBp,
      bpStatus: t(bpStatus.badgeKey),
      hr: indicators.heartRate || 72,
      hrStatus: t(hrStatus.badgeKey),
      bs: indicators.bloodSugar,
      bsUnit:
        indicators.bloodSugarUnit === 'mmol/L'
          ? t('vitals.speech.unitMmol')
          : t('vitals.speech.unitMgdl'),
      bsStatus: t(bsStatus.badgeKey),
    });
    speakText(speechText, {
      rate: 0.88,
      preferLanguage: 'cantonese',
    });
  };

  // 血壓調整
  const updateBp = (systolicDelta: number, diastolicDelta: number) => {
    const newSys = Math.max(80, Math.min(220, indicators.systolicBp + systolicDelta));
    const newDia = Math.max(50, Math.min(140, indicators.diastolicBp + diastolicDelta));
    onChangeIndicators({
      ...indicators,
      systolicBp: newSys,
      diastolicBp: newDia,
    });
  };

  // 心跳調整
  const updateHr = (delta: number) => {
    const current = indicators.heartRate || 72;
    const newHr = Math.max(40, Math.min(180, current + delta));
    onChangeIndicators({
      ...indicators,
      heartRate: newHr,
    });
  };

  // 血糖調整
  const updateBs = (delta: number) => {
    const isMmol = indicators.bloodSugarUnit === 'mmol/L';
    let newBs = indicators.bloodSugar + delta;
    if (isMmol) {
      newBs = Math.max(2.5, Math.min(25.0, Math.round(newBs * 10) / 10));
    } else {
      newBs = Math.max(45, Math.min(450, Math.round(newBs)));
    }
    onChangeIndicators({
      ...indicators,
      bloodSugar: newBs,
    });
  };

  /** 血糖快選按鈕上的數值（依單位換算，只影響顯示） */
  const bsPreset = (mmol: string, mgdl: string) =>
    indicators.bloodSugarUnit === 'mmol/L' ? mmol : mgdl;

  return (
    <div className="flex flex-col space-y-4">
      {/* 標題與語音朗讀 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2.5">
          <Activity className="w-7 h-7 text-yellow-300 shrink-0" />
          <div>
            <h3 className="text-[20px] font-black leading-tight">{t('vitals.title')}</h3>
            <p className="text-[16px] font-bold text-blue-100">{t('vitals.subtitle')}</p>
          </div>
        </div>

        <button
          type="button"
          id="btn-speak-vitals"
          onClick={handleSpeakVitals}
          className="min-h-[48px] px-3.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-blue-950 font-black text-[16px] flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 shrink-0"
        >
          <Volume2 className="w-5 h-5" />
          <span>{t('vitals.speak')}</span>
        </button>
      </div>

      {/* 指標 1：血壓 (Blood Pressure) */}
      <div className="bg-slate-50 border-3 border-blue-900 rounded-2xl p-4 shadow-sm flex flex-col space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap border-b-2 border-slate-200 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <HeartPulse className="w-7 h-7 text-rose-600 shrink-0" />
            <span className="text-[20px] font-black text-slate-900">{t('vitals.bp.title')}</span>
          </div>
          <span
            className={`text-[16px] font-black px-3 py-1 rounded-full border-2 whitespace-nowrap shrink-0 ${bpStatus.colorClass}`}
          >
            {t(bpStatus.badgeKey)}
          </span>
        </div>

        {/* 數值顯示與加減按鈕 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 上壓 (收縮壓) */}
          <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
            <div>
              <span className="text-[16px] font-bold text-slate-600 block">
                {t('vitals.bp.systolic')}
              </span>
              <span className="text-[20px] font-black text-blue-950">{indicators.systolicBp}</span>
              <span className="text-[16px] font-bold text-slate-500 ml-1">mmHg</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                id="btn-bp-sys-minus"
                onClick={() => updateBp(-5, 0)}
                className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 flex items-center justify-center font-black text-[20px] border-2 border-slate-400 cursor-pointer active:scale-95"
                title={t('vitals.bp.minusSys')}
              >
                <Minus className="w-6 h-6 stroke-[3]" />
              </button>
              <button
                type="button"
                id="btn-bp-sys-plus"
                onClick={() => updateBp(5, 0)}
                className="w-12 h-12 rounded-xl bg-blue-900 hover:bg-blue-950 active:bg-blue-800 text-white flex items-center justify-center font-black text-[20px] border-2 border-blue-950 cursor-pointer active:scale-95"
                title={t('vitals.bp.plusSys')}
              >
                <Plus className="w-6 h-6 stroke-[3]" />
              </button>
            </div>
          </div>

          {/* 下壓 (舒張壓) */}
          <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
            <div>
              <span className="text-[16px] font-bold text-slate-600 block">
                {t('vitals.bp.diastolic')}
              </span>
              <span className="text-[20px] font-black text-blue-950">{indicators.diastolicBp}</span>
              <span className="text-[16px] font-bold text-slate-500 ml-1">mmHg</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                id="btn-bp-dia-minus"
                onClick={() => updateBp(0, -5)}
                className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 flex items-center justify-center font-black text-[20px] border-2 border-slate-400 cursor-pointer active:scale-95"
                title={t('vitals.bp.minusDia')}
              >
                <Minus className="w-6 h-6 stroke-[3]" />
              </button>
              <button
                type="button"
                id="btn-bp-dia-plus"
                onClick={() => updateBp(0, 5)}
                className="w-12 h-12 rounded-xl bg-blue-900 hover:bg-blue-950 active:bg-blue-800 text-white flex items-center justify-center font-black text-[20px] border-2 border-blue-950 cursor-pointer active:scale-95"
                title={t('vitals.bp.plusDia')}
              >
                <Plus className="w-6 h-6 stroke-[3]" />
              </button>
            </div>
          </div>
        </div>

        {/* 快速檔位選取 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[16px] font-bold text-slate-600">{t('vitals.quickPick')}</span>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, systolicBp: 118, diastolicBp: 78 })}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[16px] border border-emerald-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t('vitals.bp.presetNormal')}
          </button>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, systolicBp: 136, diastolicBp: 86 })}
            className="px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[16px] border border-amber-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t('vitals.bp.presetSlight')}
          </button>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, systolicBp: 152, diastolicBp: 95 })}
            className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 font-bold text-[16px] border border-rose-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t('vitals.bp.presetHigh')}
          </button>
        </div>

        {/* 貼心叮嚀小語 */}
        <p className="text-[16px] font-bold text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200">
          💡 {t(bpStatus.adviceKey)}
        </p>
      </div>

      {/* 指標 2：心跳脈搏 (Heart Rate / Pulse) */}
      <div className="bg-slate-50 border-3 border-blue-900 rounded-2xl p-4 shadow-sm flex flex-col space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap border-b-2 border-slate-200 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="w-7 h-7 text-indigo-600 shrink-0" />
            <span className="text-[20px] font-black text-slate-900">{t('vitals.hr.title')}</span>
          </div>
          <span
            className={`text-[16px] font-black px-3 py-1 rounded-full border-2 whitespace-nowrap shrink-0 ${hrStatus.colorClass}`}
          >
            {t(hrStatus.badgeKey)}
          </span>
        </div>

        {/* 數值與加減 */}
        <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
          <div>
            <span className="text-[16px] font-bold text-slate-600 block">
              {t('vitals.hr.label')}
            </span>
            <span className="text-[20px] font-black text-blue-950">
              {indicators.heartRate || 72}
            </span>
            <span className="text-[16px] font-bold text-slate-500 ml-1.5">
              {t('vitals.hr.unit')}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              id="btn-hr-minus"
              onClick={() => updateHr(-2)}
              className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 flex items-center justify-center font-black text-[20px] border-2 border-slate-400 cursor-pointer active:scale-95"
              title={t('vitals.hr.minus')}
            >
              <Minus className="w-6 h-6 stroke-[3]" />
            </button>
            <button
              type="button"
              id="btn-hr-plus"
              onClick={() => updateHr(2)}
              className="w-12 h-12 rounded-xl bg-blue-900 hover:bg-blue-950 active:bg-blue-800 text-white flex items-center justify-center font-black text-[20px] border-2 border-blue-950 cursor-pointer active:scale-95"
              title={t('vitals.hr.plus')}
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
          </div>
        </div>

        {/* 快速檔位選取 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[16px] font-bold text-slate-600">{t('vitals.quickPick')}</span>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, heartRate: 65 })}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[16px] border border-emerald-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t('vitals.hr.presetRest')}
          </button>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, heartRate: 75 })}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[16px] border border-emerald-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t('vitals.hr.presetNormal')}
          </button>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, heartRate: 88 })}
            className="px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[16px] border border-amber-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t('vitals.hr.presetActive')}
          </button>
          <button
            type="button"
            onClick={() => onChangeIndicators({ ...indicators, heartRate: 105 })}
            className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 font-bold text-[16px] border border-rose-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t('vitals.hr.presetFast')}
          </button>
        </div>

        {/* 貼心叮嚀小語 */}
        <p className="text-[16px] font-bold text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200">
          💡 {t(hrStatus.adviceKey)}
        </p>
      </div>

      {/* 指標 3：血糖 (Blood Sugar) */}
      <div className="bg-slate-50 border-3 border-blue-900 rounded-2xl p-4 shadow-sm flex flex-col space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap border-b-2 border-slate-200 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Droplet className="w-7 h-7 text-amber-500 shrink-0" />
            <span className="text-[20px] font-black text-slate-900">{t('vitals.bs.title')}</span>
          </div>
          <span
            className={`text-[16px] font-black px-3 py-1 rounded-full border-2 whitespace-nowrap shrink-0 ${bsStatus.colorClass}`}
          >
            {t(bsStatus.badgeKey)}
          </span>
        </div>

        {/* 量測時機與單位切換 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-slate-200 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => onChangeIndicators({ ...indicators, bloodSugarTiming: 'fasting' })}
              className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap transition-colors cursor-pointer ${
                indicators.bloodSugarTiming === 'fasting'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              {t('vitals.bs.fasting')}
            </button>
            <button
              type="button"
              onClick={() => onChangeIndicators({ ...indicators, bloodSugarTiming: 'post_meal' })}
              className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap transition-colors cursor-pointer ${
                indicators.bloodSugarTiming === 'post_meal'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              {t('vitals.bs.postMeal')}
            </button>
          </div>

          {/* 單位切換 */}
          <div className="flex items-center gap-1 bg-slate-200 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                if (indicators.bloodSugarUnit !== 'mmol/L') {
                  const mmolVal = Math.round((indicators.bloodSugar / 18) * 10) / 10;
                  onChangeIndicators({
                    ...indicators,
                    bloodSugarUnit: 'mmol/L',
                    bloodSugar: mmolVal,
                  });
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                indicators.bloodSugarUnit === 'mmol/L' ? 'bg-blue-900 text-white' : 'text-slate-700'
              }`}
            >
              {t('vitals.bs.unitMmol')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (indicators.bloodSugarUnit !== 'mg/dL') {
                  const mgVal = Math.round(indicators.bloodSugar * 18);
                  onChangeIndicators({
                    ...indicators,
                    bloodSugarUnit: 'mg/dL',
                    bloodSugar: mgVal,
                  });
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                indicators.bloodSugarUnit === 'mg/dL' ? 'bg-blue-900 text-white' : 'text-slate-700'
              }`}
            >
              {t('vitals.bs.unitMgdl')}
            </button>
          </div>
        </div>

        {/* 數值與加減 */}
        <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
          <div>
            <span className="text-[16px] font-bold text-slate-600 block">
              {indicators.bloodSugarTiming === 'fasting'
                ? t('vitals.bs.fastingValue')
                : t('vitals.bs.postMealValue')}
            </span>
            <span className="text-[20px] font-black text-blue-950">{indicators.bloodSugar}</span>
            <span className="text-[16px] font-bold text-slate-500 ml-1.5">
              {indicators.bloodSugarUnit}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              id="btn-bs-minus"
              onClick={() => updateBs(indicators.bloodSugarUnit === 'mmol/L' ? -0.2 : -5)}
              className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 flex items-center justify-center font-black text-[20px] border-2 border-slate-400 cursor-pointer active:scale-95"
              title={t('vitals.bs.minus')}
            >
              <Minus className="w-6 h-6 stroke-[3]" />
            </button>
            <button
              type="button"
              id="btn-bs-plus"
              onClick={() => updateBs(indicators.bloodSugarUnit === 'mmol/L' ? 0.2 : 5)}
              className="w-12 h-12 rounded-xl bg-blue-900 hover:bg-blue-950 active:bg-blue-800 text-white flex items-center justify-center font-black text-[20px] border-2 border-blue-950 cursor-pointer active:scale-95"
              title={t('vitals.bs.plus')}
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
          </div>
        </div>

        {/* 快速檔位選取 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[16px] font-bold text-slate-600">{t('vitals.quickPick')}</span>
          <button
            type="button"
            onClick={() => {
              const val = indicators.bloodSugarUnit === 'mmol/L' ? 5.2 : 94;
              onChangeIndicators({ ...indicators, bloodSugar: val, bloodSugarTiming: 'fasting' });
            }}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[16px] border border-emerald-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t('vitals.bs.presetFasting', { v: bsPreset('5.2', '94') })}
          </button>
          <button
            type="button"
            onClick={() => {
              const val = indicators.bloodSugarUnit === 'mmol/L' ? 7.2 : 130;
              onChangeIndicators({ ...indicators, bloodSugar: val, bloodSugarTiming: 'post_meal' });
            }}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[16px] border border-emerald-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t('vitals.bs.presetPostMeal', { v: bsPreset('7.2', '130') })}
          </button>
          <button
            type="button"
            onClick={() => {
              const val = indicators.bloodSugarUnit === 'mmol/L' ? 9.8 : 176;
              onChangeIndicators({ ...indicators, bloodSugar: val, bloodSugarTiming: 'post_meal' });
            }}
            className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 font-bold text-[16px] border border-rose-300 whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t('vitals.bs.presetHigh', { v: bsPreset('9.8', '176') })}
          </button>
        </div>

        {/* 貼心叮嚀小語 */}
        <p className="text-[16px] font-bold text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200">
          💡 {t(bsStatus.adviceKey)}
        </p>
      </div>

      {/* 指標 4：額外身體狀態（痛風/尿酸、血脂/膽固醇） */}
      <div className="bg-slate-50 border-3 border-blue-900 rounded-2xl p-4 shadow-sm flex flex-col space-y-3">
        <span className="text-[20px] font-black text-slate-900">{t('vitals.extra.title')}</span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 尿酸與痛風 */}
          <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
            <span className="text-[16px] font-black text-slate-800">
              {t('vitals.extra.uricAcid')}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onChangeIndicators({ ...indicators, uricAcidStatus: 'normal' })}
                className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                  indicators.uricAcidStatus === 'normal'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {t('vitals.extra.uricNormal')}
              </button>
              <button
                type="button"
                onClick={() => onChangeIndicators({ ...indicators, uricAcidStatus: 'high' })}
                className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                  indicators.uricAcidStatus !== 'normal'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {t('vitals.extra.uricHigh')}
              </button>
            </div>
          </div>

          {/* 血脂與膽固醇 */}
          <div className="bg-white rounded-xl p-3 border-2 border-slate-300 flex flex-col gap-2">
            <span className="text-[16px] font-black text-slate-800">
              {t('vitals.extra.cholesterol')}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onChangeIndicators({ ...indicators, cholesterolStatus: 'normal' })}
                className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                  indicators.cholesterolStatus === 'normal'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {t('vitals.extra.cholNormal')}
              </button>
              <button
                type="button"
                onClick={() => onChangeIndicators({ ...indicators, cholesterolStatus: 'high' })}
                className={`px-3 py-1.5 rounded-lg text-[16px] font-black whitespace-nowrap cursor-pointer ${
                  indicators.cholesterolStatus !== 'normal'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {t('vitals.extra.cholHigh')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
