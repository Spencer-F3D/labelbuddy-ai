/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 語音朗讀設定區塊（開關 ＋ 音量）— 2026-10-03 新增
 * ============================================================================
 * 【為什麼要有這一區】
 *   使用者回報「語音功能用不到，完成識別後沒有聲音，按按鈕也沒有聲音」。
 *   根因是 APK 的 Android WebView 沒有 Web Speech API（已改走原生 TTS）。
 *   但同時也暴露一件事：**使用者沒有任何地方可以確認語音是開還是關。**
 *   所以這一區除了開關與音量，還要能回答兩個問題：
 *     ① 現在是開的嗎？
 *     ② 這台裝置到底能不能發出聲音？
 *   第 ② 點很重要 —— 「設定關掉了」和「裝置做不到」的處理方式完全不同。
 *
 * 【為什麼音量用滑桿而不是幾段式按鈕】
 *   長者的聽力差異很大，三格（小／中／大）常常找不到合適的那一格。
 *   滑桿可以連續調整，而且**放手時就會試聽**，不用另外按按鈕確認。
 * ============================================================================
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import {
  getTtsSettings,
  setTtsEnabled,
  setTtsVolume,
  type TtsSettings,
} from '../utils/ttsSettings';
import { speakText, stopSpeech, canSpeak, isNativeTts } from '../utils/tts';

export const TtsSettingsSection: React.FC = () => {
  const { t, language } = useI18n();
  const [settings, setSettings] = useState<TtsSettings>(() => getTtsSettings());
  const [played, setPlayed] = useState(false);

  const deviceCanSpeak = canSpeak();

  const toggle = () => {
    const next = setTtsEnabled(!settings.enabled);
    setSettings({ ...next });
    if (next.enabled) playSample(next.volume);
    else stopSpeech();
  };

  const changeVolume = (v: number) => {
    const next = setTtsVolume(v);
    setSettings({ ...next });
  };

  /** 試聽：讓使用者不必離開設定頁就知道音量合不合適 */
  const playSample = (volume: number) => {
    setPlayed(true);
    speakText(t('settings.sound.sample'), {
      rate: 0.88,
      volume,
      preferLanguage: language === 'en' ? 'english' : 'cantonese',
      // 音量用即時參數，不必等設定寫入
    });
  };

  const percent = Math.round(settings.volume * 100);

  return (
    <div className="flex flex-col gap-[14px]">
      {/* ── 裝置不支援時的明確說明 ───────────────────────────
          ⚠️ 這種情況不要只把開關變灰 —— 使用者會以為是壞掉。
             要直接講「這個裝置做不到」，他才不會一直找。 */}
      {!deviceCanSpeak && (
        <p className="text-[16px] font-bold text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-[12px] py-[10px] leading-snug">
          {t('settings.sound.unsupported')}
        </p>
      )}

      {/* ── 開關 ─────────────────────────────────────────── */}
      <button
        type="button"
        id="tts-toggle"
        onClick={toggle}
        disabled={!deviceCanSpeak}
        aria-pressed={settings.enabled}
        className={`w-full min-h-[64px] rounded-2xl border-2 px-[16px] py-[12px] flex items-center gap-[12px] text-left transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          settings.enabled ? 'bg-blue-800 border-blue-900 text-white' : 'bg-white border-slate-300 text-slate-800'
        }`}
      >
        {settings.enabled ? (
          <Volume2 className="w-[28px] h-[28px] shrink-0" aria-hidden="true" />
        ) : (
          <VolumeX className="w-[28px] h-[28px] shrink-0" aria-hidden="true" />
        )}
        <span className="flex-1 min-w-0">
          {/* ⚠️ 不要用 flex 並排 + truncate：狀態摘要被截斷就等於這一行沒有用
                （見 UI_RULES）。這裡用兩行文字，各自完整顯示。 */}
          <span className="block text-[19px] font-black leading-snug">
            {settings.enabled ? t('settings.sound.on') : t('settings.sound.off')}
          </span>
          <span className={`block text-[16px] font-bold leading-snug ${settings.enabled ? 'text-blue-100' : 'text-slate-600'}`}>
            {t('settings.sound.hint')}
          </span>
        </span>
      </button>

      {/* ── 音量 ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-[8px]">
        <div className="flex items-baseline justify-between gap-[8px]">
          <span className="text-[18px] font-black text-slate-900">
            {t('settings.sound.volume')}
          </span>
          {/* 用 aria-live 讓讀屏軟體也知道數值變了 */}
          <span className="text-[18px] font-black text-blue-900" aria-live="polite">
            {percent}%
          </span>
        </div>

        <input
          type="range"
          id="tts-volume"
          min={0}
          max={100}
          step={5}
          value={percent}
          disabled={!deviceCanSpeak || !settings.enabled}
          aria-label={t('settings.sound.volume')}
          onChange={(e) => changeVolume(Number(e.target.value) / 100)}
          // 放手時試聽 —— 長者不需要「調完再找按鈕確認」
          onMouseUp={() => playSample(settings.volume)}
          onTouchEnd={() => playSample(settings.volume)}
          className="w-full h-[44px] cursor-pointer accent-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
        />

        <button
          type="button"
          id="tts-try"
          onClick={() => playSample(settings.volume)}
          disabled={!deviceCanSpeak || !settings.enabled}
          className="self-start min-h-[48px] px-[16px] rounded-xl bg-blue-100 hover:bg-blue-200 border-2 border-blue-800 text-blue-950 text-[17px] font-black flex items-center gap-[8px] cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="w-[20px] h-[20px] shrink-0" aria-hidden="true" />
          {t('settings.sound.try')}
        </button>

        {/* 試聽過之後才顯示的即時回饋 —— 沒聽到聲音時要能判斷是哪一種問題 */}
        {played && settings.enabled && deviceCanSpeak && (
          <p className="text-[16px] font-bold text-slate-600 leading-snug">
            {isNativeTts() ? t('settings.sound.checkNative') : t('settings.sound.checkBrowser')}
          </p>
        )}
      </div>
    </div>
  );
};
