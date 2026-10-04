/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 語音設定區塊（只有一條音量）— 2026-10-03 改版
 * ============================================================================
 * 【為什麼只剩一條音量】
 *   使用者指定：「移除『開始/試聽』，改由音量條直接控制」。
 *   原本是開關 ＋ 音量 ＋ 試聽按鈕三個控制項，但三者其實都在回答同一個問題
 *   （要不要出聲、多大聲）。合併成一條音量：
 *     0 = 關閉、> 0 = 開啟。
 *   這跟手機的媒體音量行為一致，長者不用學新的概念。
 *
 * 【為什麼放手時會自動唸一句】
 *   那是「試聽」被合併進來的方式 —— 使用者不必再找一顆按鈕確認，
 *   調到滿意的位置手放開就知道了。這正是「由音量條直接控制」的意思。
 *
 * 【為什麼還要顯示「已關閉」四個字】
 *   只看一條滑桿，長者不確定「拉到底」是安靜還是壞掉。
 *   文字要直接講出目前狀態，不要讓他猜。
 * ============================================================================
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Languages } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { getTtsSettings, setTtsVolume, setTtsVoiceLang, resolveVoiceLang } from '../utils/ttsSettings';
import { speakText, canSpeak, isNativeTts, type TTSLanguage } from '../utils/tts';

/** 朗讀語言的三個選項（2026-10-04 使用者指定） */
const VOICE_LANGS: TTSLanguage[] = ['cantonese', 'mandarin', 'english'];

export const TtsSettingsSection: React.FC = () => {
  const { t, language } = useI18n();
  const [volume, setVolume] = useState(() => getTtsSettings().volume);
  const [played, setPlayed] = useState(false);
  /** 目前生效的朗讀語言（使用者選過的優先，否則跟隨介面語言） */
  const [voiceLang, setVoiceLang] = useState<TTSLanguage>(() => resolveVoiceLang(language));

  const deviceCanSpeak = canSpeak();
  const percent = Math.round(volume * 100);
  const isOn = volume > 0;

  const pickVoiceLang = (next: TTSLanguage) => {
    setVoiceLang(next);
    setTtsVoiceLang(next);
    /**
     * 選完立刻唸一句 —— 語言這種東西**非聽不可**，
     * 只看「粵語／普通話」四個字，使用者無法確認差別。
     * ⚠️ 音量為 0 時不唸（使用者就是要安靜）。
     */
    if (volume > 0) {
      speakText(t('settings.sound.sample'), { rate: 0.88, volume, preferLanguage: next });
    }
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    setTtsVolume(v);
  };

  /** 放手時唸一句 —— 這就是原本「試聽」按鈕的功能，合併進音量條 */
  const previewOnRelease = () => {
    if (volume <= 0) return;
    setPlayed(true);
    speakText(t('settings.sound.sample'), {
      rate: 0.88,
      volume,
      preferLanguage: voiceLang,
    });
  };

  return (
    <div className="flex flex-col gap-[12px]">
      {/* 裝置不支援時要直接講，不要只把滑桿變灰（使用者會以為是壞掉） */}
      {!deviceCanSpeak && (
        <p className="text-[16px] font-bold text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-[12px] py-[10px] leading-snug">
          {t('settings.sound.unsupported')}
        </p>
      )}

      {/* ── 目前狀態（大字，長者不必猜）── */}
      <div className="flex items-center gap-[10px]">
        {isOn ? (
          <Volume2 className="w-[28px] h-[28px] shrink-0 text-blue-800" aria-hidden="true" />
        ) : (
          <VolumeX className="w-[28px] h-[28px] shrink-0 text-slate-500" aria-hidden="true" />
        )}
        {/* ⚠️ 兩行各自完整，不用 flex 並排 + truncate ——
            狀態摘要被截斷就等於這一行沒有用（見 UI_RULES）。 */}
        <span className="flex-1 min-w-0">
          <span
            className={`block text-[19px] font-black leading-snug ${
              isOn ? 'text-blue-900' : 'text-slate-700'
            }`}
          >
            {isOn ? t('settings.sound.on', { n: percent }) : t('settings.sound.muted')}
          </span>
          <span className="block text-[16px] font-bold text-slate-600 leading-snug">
            {isOn ? t('settings.sound.hint') : t('settings.sound.mutedHint')}
          </span>
        </span>
      </div>

      {/* ── 朗讀語言（2026-10-04 使用者指定：粵語／普通話／英文）──
          ★ 三個選項都是「發音語言」，與介面文字語言無關。
            （介面語言在上方的語言按鈕切換，兩者是不同的東西 ——
              英文介面也可以選粵語發音。） */}
      <div className="flex flex-col gap-[8px]">
        <span className="flex items-center gap-[6px] text-[18px] font-black text-slate-900">
          <Languages className="w-[22px] h-[22px] shrink-0 text-slate-700" aria-hidden="true" />
          {t('settings.sound.voiceLang')}
        </span>
        {/* ⚠️ 用 flex-wrap 讓按鈕整顆換行，不要用 overflow-x-auto 水平捲動 ——
            長者看不到「右邊還有東西」，會以為只有這兩個選項。 */}
        <div className="flex flex-wrap gap-[8px]" role="group" aria-label={t('settings.sound.voiceLang')}>
          {VOICE_LANGS.map((lang) => {
            const active = voiceLang === lang;
            return (
              <button
                key={lang}
                type="button"
                id={`tts-lang-${lang}`}
                aria-pressed={active}
                disabled={!deviceCanSpeak}
                onClick={() => pickVoiceLang(lang)}
                className={`min-h-[52px] px-[16px] rounded-xl border-2 text-[17px] font-black cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-blue-800 border-blue-900 text-white'
                    : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                {t(lang === 'cantonese' ? 'settings.sound.langCantonese' : lang === 'mandarin' ? 'settings.sound.langMandarin' : 'settings.sound.langEnglish')}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 音量（唯一的控制項）── */}
      <input
        type="range"
        id="tts-volume"
        min={0}
        max={100}
        step={5}
        value={percent}
        disabled={!deviceCanSpeak}
        aria-label={t('settings.sound.volume')}
        aria-valuetext={isOn ? `${percent}%` : t('settings.sound.muted')}
        onChange={(e) => changeVolume(Number(e.target.value) / 100)}
        // 放手就唸一句（＝原本的試聽），長者不必再找按鈕確認
        onMouseUp={previewOnRelease}
        onTouchEnd={previewOnRelease}
        onKeyUp={previewOnRelease}
        className="w-full h-[48px] cursor-pointer accent-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
      />

      {/* 試聽之後才顯示 —— 沒聽到聲音時要能判斷是哪一種問題 */}
      {played && isOn && deviceCanSpeak && (
        <p className="text-[16px] font-bold text-slate-600 leading-snug">
          {isNativeTts() ? t('settings.sound.checkNative') : t('settings.sound.checkBrowser')}
        </p>
      )}
    </div>
  );
};
