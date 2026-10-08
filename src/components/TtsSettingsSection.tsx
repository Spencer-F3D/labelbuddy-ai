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
import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, Languages } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { getTtsSettings, setTtsVolume, setTtsVoiceLang, resolveVoiceLang } from '../utils/ttsSettings';
import {
  speakText,
  canSpeak,
  isNativeTts,
  describeVoiceFor,
  getLastTtsDiagnostic,
  isLanguageAvailable,
  listAvailableLanguages,
  describeNativeVoice,
  loadNativeVoices,
  type TTSLanguage,
} from '../utils/tts';

/** 朗讀語言的三個選項（2026-10-04 使用者指定） */
const VOICE_LANGS: TTSLanguage[] = ['cantonese', 'mandarin', 'english'];

/**
 * 音量區塊（標題由呼叫端提供：「音量」）。
 */
export const TtsVolumeSection: React.FC = () => {
  const { t, language } = useI18n();
  const [volume, setVolume] = useState(() => getTtsSettings().volume);
  const [played, setPlayed] = useState(false);
  /**
   * ★★ 2026-10-08：音量 0 時按下測試鈕要**說出原因**，不能靜默不做事。
   *
   * 【為什麼】使用者原話：「線上網站有聲音（區塊）顯示沒有，但音量已是最大的」——
   *   他調的是**手機／電腦的音量**，而 App 自己的朗讀音量是 0
   *   （非長者身分的預設值）。舊版在音量 0 時：
   *     ① 滑桿放手試聽 `return` 掉
   *     ② 語言試聽 `if (volume > 0)` 跳過
   *     ③ 診斷區塊整個不顯示
   *   三條路都靜默 → 使用者只看得到「按了沒反應」，無法自行診斷。
   */
  const [zeroWarning, setZeroWarning] = useState(false);

  const deviceCanSpeak = canSpeak();
  const percent = Math.round(volume * 100);
  const isOn = volume > 0;

  const changeVolume = (v: number) => {
    setVolume(v);
    setTtsVolume(v);
    if (v > 0) setZeroWarning(false);
  };

  /**
   * 放手時唸一句 —— 這就是原本「試聽」按鈕的功能，合併進音量條。
   * ⚠️ 放手**不算「按下去」**：音量 0 時靜默是合理的（他就是不想聽）。
   *    要能「按下去問為什麼沒聲音」的是下面那顆獨立的測試鈕。
   */
  const previewOnRelease = () => {
    if (volume <= 0) return;
    setPlayed(true);
    speakText(t('settings.sound.sample'), {
      rate: 0.88,
      volume,
      preferLanguage: resolveVoiceLang(language),
    });
  };

  /**
   * ★ 獨立的「🔊 測試語音」按鈕（2026-10-08）。
   *
   * 【為什麼要獨立一顆】
   *   原本唯一的試聽入口是「放開滑桿」—— 那是一個**隱性**手勢：
   *   使用者不會知道有東西可以按，而音量 0 時它又完全沒反應。
   *   這顆按鈕存在的意義是「按下去一定給你一個交代」。
   */
  const testVoice = () => {
    if (volume <= 0) {
      setPlayed(false);
      setZeroWarning(true);
      return;
    }
    setZeroWarning(false);
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

      {/* ── 測試語音（2026-10-08）────────────────────────────────
          ★ 按下去**一定給一個交代**：有聲音就唸、音量 0 就說出原因。
            不再有「按了完全沒反應」這種無從診斷的狀態。 */}
      <button
        type="button"
        id="tts-test-voice"
        disabled={!deviceCanSpeak}
        onClick={testVoice}
        className="min-h-[52px] rounded-xl border-2 border-blue-800 bg-blue-50 text-blue-900 text-[17px] font-black cursor-pointer transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t('settings.sound.testVoice')}
      </button>

      {/* 音量 0 時按下測試鈕 → 直接說出原因（不再靜默跳過） */}
      {zeroWarning && (
        <p className="text-[16px] font-bold text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-[12px] py-[10px] leading-snug">
          {t('settings.sound.volumeZero')}
        </p>
      )}

      {/* 試聽之後才顯示 —— 沒聽到聲音時要能判斷是哪一種問題
          ★★ 2026-10-04：使用者回報「朗讀示範完全沒有聲」，
             但實測程式是對的（三種語言都挑到正確語音、事件正常）。
             → 與其再猜，不如把**實際發生的事**顯示出來：
               挑了哪個語音、有沒有送出去、有沒有被瀏覽器擋下。
             這四種原因的處理方式完全不同，不該都只說「沒聲音」。
          ★★ 2026-10-08：條件由 `played && isOn && deviceCanSpeak`
             改為 `played && deviceCanSpeak` —— **音量 0 也要看得到原因**。
             舊條件在音量 0 時把整個區塊藏起來，正是使用者求助無門的原因。 */}
      {played && deviceCanSpeak && (
        <div className="flex flex-col gap-[4px]">
          {(() => {
            const d = getLastTtsDiagnostic();
            const outcomeLabel =
              d.outcome === 'started'
                ? t('settings.sound.sentOk')
                : d.outcome === 'blocked'
                  ? t('settings.sound.blocked')
                  : d.outcome === 'disabled'
                    ? t('settings.sound.muted')
                    : d.outcome === 'unsupported'
                      ? t('settings.sound.unsupportedShort')
                      : d.outcome === 'no-voice'
                        ? t('settings.sound.noVoiceShort')
                        : d.outcome === 'silent'
                          ? t('settings.sound.silent')
                          : t('settings.sound.sentNo');
            return (
              <p
                className={`text-[15px] font-bold rounded-lg px-[10px] py-[6px] break-all leading-snug ${
                  d.outcome === 'started'
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'bg-amber-50 text-amber-900'
                }`}
              >
                {t('settings.sound.voiceUsed')}: {d.voiceName ?? t('settings.sound.noVoice')}
                {' · '}
                {outcomeLabel}
                {d.error ? ` · ${d.error}` : ''}
              </p>
            );
          })()}
          {/* ★★ 網頁版缺語音時，把「可以怎麼做」講清楚（2026-10-08）——
              原本只有原生（APK）才有這種指引，網頁版只顯示一行
              「找不到這個語言的語音（請在系統設定安裝）」，
              但網頁版要裝的是**作業系統**的語音，說法完全不同。 */}
          {!isNativeTts() && getLastTtsDiagnostic().outcome === 'no-voice' && (
            <p className="text-[15px] font-bold text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-[10px] py-[8px] leading-snug">
              {t('settings.sound.noVoiceWeb')}
            </p>
          )}
          <p className="text-[16px] font-bold text-slate-600 leading-snug">
            {isNativeTts() ? t('settings.sound.checkNative') : t('settings.sound.checkBrowser')}
          </p>
        </div>
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
  const [voiceLang, setVoiceLang] = useState<TTSLanguage>(() => resolveVoiceLang(language));
  /**
   * ★ 2026-10-08：音量 0 時選語言要說出原因。
   *
   * ⚠️ 這裡原本是 `const [volume] = useState(() => getTtsSettings().volume)` ——
   *    **掛載時的快照**。使用者在上面（音量區塊）把音量拉起來之後，
   *    這個元件不會重算，於是「選語言完全沒聲音」且沒有任何提示。
   *    → 改成點擊當下才讀（見 `pick`）。
   */
  const [langZeroWarning, setLangZeroWarning] = useState(false);
  const deviceCanSpeak = canSpeak();

  /**
   * ★★ 手機（原生）上檢查這台裝置**有沒有**目前選的語言（2026-10-04）。
   *
   * 【為什麼】使用者回報「有的手機APP只說普通話」——
   *   因為那台手機沒有裝粵語語音資料，Android 收到 zh-HK 會退回預設語言。
   *   那不是 App 的問題，但使用者只會覺得「壞了」。
   *   → 主動檢查並講清楚「要去系統設定安裝」，他才知道能做什麼。
   */
  const [nativeSupport, setNativeSupport] = useState<{
    lang: TTSLanguage;
    supported: boolean | null;
    languages: string[] | null;
    /**
     * ★ 這台手機**實際**會用來唸該語言的語音名稱（原生才有）。
     *
     * 【為什麼不能只看「支不支援」】
     *   實測有些 Android TTS 引擎回報支援 zh-HK，
     *   實際卻用預設（國語）發音 —— 問「支不支援」會得到誤導的答案。
     *   所以額外顯示**實際挑到哪一個語音**（`getSupportedVoices()` 的比對結果）。
     *   `null` 就代表挑不到，那正是「只說普通話」的原因。
     */
    voiceName: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadNativeVoices();
      const supported = await isLanguageAvailable(voiceLang);
      const languages = supported === false ? await listAvailableLanguages() : null;
      const voiceName = await describeNativeVoice(voiceLang);
      if (!cancelled) setNativeSupport({ lang: voiceLang, supported, languages, voiceName });
    })();
    return () => {
      cancelled = true;
    };
  }, [voiceLang]);


  /** 每個語言對應的示範句鍵（用該語言本身寫的句子，不是介面語言那句） */
  const SAMPLE_KEY = {
    cantonese: 'settings.sound.sampleCantonese',
    mandarin: 'settings.sound.sampleMandarin',
    english: 'settings.sound.sampleEnglish',
  } as const;

  const pick = (next: TTSLanguage) => {
    setVoiceLang(next);
    setTtsVoiceLang(next);
    /**
     * 選完立刻唸一句 —— 語言這種東西**非聽不可**，
     * 只看「粵語／普通話」四個字，使用者無法確認差別。
     *
     * ★★ 兩個關鍵（2026-10-04 修）：
     *   ① 唸的是**該語言自己的示範句**，不是介面語言那句
     *   ② `forceLanguage: true` —— 不然示範句若含中文，
     *      會被「依文字字集改寫」的邏輯改成中文語音，
     *      使用者按 English 卻聽到粵語（實測回報的現象）
     * ⚠️ 音量為 0 時不唸（使用者就是要安靜）—— 但**要說出來**，
     *    不能像以前那樣靜默跳過（見上方 `langZeroWarning` 的說明）。
     */
    const v = getTtsSettings().volume;
    if (v > 0) {
      setLangZeroWarning(false);
      speakText(t(SAMPLE_KEY[next]), {
        rate: 0.88,
        volume: v,
        preferLanguage: next,
        forceLanguage: true,
      });
    } else {
      setLangZeroWarning(true);
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
      {/* ★ 顯示這台裝置對「目前選的語言」實際會用哪個語音。
          `null` = 這個裝置沒有該語言的語音 —— 使用者需要知道，
          否則他會一直以為是 App 壞了（而那是系統層面的限制）。 */}
      {(() => {
        /**
         * ★ 手機（原生）與網頁走不同的查法：
         *   原生 → `getSupportedVoices()` 實際比對出來的語音名稱
         *   網頁 → `describeVoiceFor()`（Web Speech 的 getVoices()）
         *   兩者都可能回 null（＝這台裝置沒有該語言的語音）。
         */
        const name =
          nativeSupport && nativeSupport.lang === voiceLang
            ? nativeSupport.voiceName
            : describeVoiceFor(voiceLang);
        return (
          <p
            className={`text-[15px] font-bold rounded-lg px-[10px] py-[6px] break-all leading-snug ${
              name ? 'bg-slate-50 text-slate-700' : 'bg-amber-50 text-amber-900'
            }`}
          >
            {t('settings.sound.voiceUsed')}: {name ?? t('settings.sound.noVoice')}
          </p>
        );
      })()}

      {/* ★ 手機上的額外檢查：這台裝置到底有沒有這個語言的語音？
          沒有的話要**講清楚怎麼修**，否則使用者只會覺得 App 壞了。 */}
      {nativeSupport && nativeSupport.lang === voiceLang && nativeSupport.supported === false && (
        <p className="text-[15px] font-bold text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-[12px] py-[8px] break-all leading-snug">
          {t('settings.sound.nativeMissing')}
          {nativeSupport.languages && nativeSupport.languages.length > 0 && (
            <>
              {' '}
              {t('settings.sound.nativeHas')}
              {nativeSupport.languages.slice(0, 6).join('、')}
            </>
          )}
        </p>
      )}
      {/* ★★ 網頁版也要講清楚「沒有這個語言的語音」可以怎麼辦（2026-10-08）。
          原本只有原生（APK）走 `isLanguageAvailable` 那條才有這個提示，
          網頁版只顯示一行「找不到這個語言的語音（請在系統設定安裝）」——
          但網頁要裝的是**作業系統**的語音，說法完全不同。
          實測（`scripts/probe-tts-voices.mjs`）：Windows 上唯一的中文粵語語音
          是 Google／Microsoft 的「網路語音」，裝置沒裝就完全沒聲音。 */}
      {!isNativeTts() && describeVoiceFor(voiceLang) === null && (
        <p className="text-[15px] font-bold text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-[12px] py-[8px] leading-snug">
          {t('settings.sound.noVoiceWeb')}
        </p>
      )}
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

      {/* 音量 0 時選語言 → 說出原因，不要靜默跳過 */}
      {langZeroWarning && (
        <p className="text-[16px] font-bold text-amber-900 bg-amber-50 border-2 border-amber-300 rounded-xl px-[12px] py-[10px] leading-snug">
          {t('settings.sound.volumeZero')}
        </p>
      )}
    </div>
  );
};
