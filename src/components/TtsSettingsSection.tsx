/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 語音設定 — 2026-10-04 拆成兩個獨立區塊
 * ============================================================================
 * 【為什麼要拆】
 *   使用者指定：「把朗讀語言和音量分開，標題分別要是『朗讀語言』和『音量』」。
 *   原本兩者擠在同一個「語音朗讀」區塊裡，只剩一個標題 ——
 *   使用者要調音量時，得先看懂「朗讀語言」那三個按鈕與自己無關。
 *
 * ★ 兩者其實是**不同的問題**，分開才說得清楚：
 *     「朗讀語言」＝用什麼語言發音（與介面文字語言無關）
 *     「音量」    ＝要不要出聲、多大聲
 *   把它們並排在同一區，使用者會以為「選了粵語就等於開啟語音」。
 *
 * 【音量區塊保留「目前沒有聲音／語音大小：80%」那一行】
 *   只看一條滑桿，長者不確定「拉到底」是安靜還是壞掉 ——
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

/**
 * 音量區塊（標題由呼叫端提供：「音量」）。
 */
export const TtsVolumeSection: React.FC = () => {
  const { t, language } = useI18n();
  const [volume, setVolume] = useState(() => getTtsSettings().volume);
  const [played, setPlayed] = useState(false);

  const deviceCanSpeak = canSpeak();
  const percent = Math.round(volume * 100);
  const isOn = volume > 0;

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
      preferLanguage: resolveVoiceLang(language),
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

/**
 * 朗讀語言區塊（標題由呼叫端提供：「朗讀語言」）。
 *
 * ★ 這三個選項是**發音語言**，與介面文字語言無關 ——
 *   英文介面也可以選粵語發音。區塊內要講清楚，否則會被誤解。
 */
export const TtsVoiceLangSection: React.FC = () => {
  const { t, language } = useI18n();
  const [volume] = useState(() => getTtsSettings().volume);
  const [voiceLang, setVoiceLang] = useState<TTSLanguage>(() => resolveVoiceLang(language));
  const deviceCanSpeak = canSpeak();

  const pick = (next: TTSLanguage) => {
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

  return (
    <div className="flex flex-col gap-[10px]">
      {!deviceCanSpeak && (
        <p className="text-[16px] font-bold text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-[12px] py-[10px] leading-snug">
          {t('settings.sound.unsupported')}
        </p>
      )}
      <p className="text-[16px] font-bold text-slate-600 leading-snug">
        {t('settings.sound.voiceLangDesc')}
      </p>
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
              onClick={() => pick(lang)}
              className={`min-h-[52px] px-[18px] rounded-xl border-2 text-[17px] font-black cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                active ? 'bg-blue-800 border-blue-900 text-white' : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              {t(
                lang === 'cantonese'
                  ? 'settings.sound.langCantonese'
                  : lang === 'mandarin'
                    ? 'settings.sound.langMandarin'
                    : 'settings.sound.langEnglish'
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
