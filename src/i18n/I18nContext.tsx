/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 語言 Context（i18n）
 * ============================================================================
 * 提供 `useI18n()` 給整個 App：
 *   const { t, language, setLanguage } = useI18n();
 *   <p>{t('home.greeting')}</p>
 *
 * 【為什麼用 Context 而不是把 language 一路傳下去】
 *   介面文字散在 App.tsx 與十幾個元件裡，
 *   用 props 傳會變成「每個元件都要多收一個 language」，
 *   而且中間層元件明明不用翻譯卻被迫傳遞。Context 直接解決這件事。
 *
 * 【存哪裡】
 *   localStorage（與本專案其他設定一致，見 HealthSettings / learnerProfiles 的用法）。
 *   語言是「這台裝置的偏好」，不需要上傳到伺服器，也不會離開裝置。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { TRANSLATIONS, type Language, type TranslationKey } from './translations';

const STORAGE_KEY = 'labelbuddy-language';

/** 預設語言：繁體中文。主要使用者是長者，不該因為要符合規範而改變他們的體驗。 */
const DEFAULT_LANGUAGE: Language = 'zh-TW';

function isLanguage(v: unknown): v is Language {
  return v === 'zh-TW' || v === 'en';
}

/** 讀取已儲存的語言。任何異常都安全退回預設值，不讓 App 因讀取失敗而白畫面。 */
function readStoredLanguage(): Language {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isLanguage(raw) ? raw : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export interface I18nValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /**
   * 取翻譯字串。
   *
   * @param key  翻譯鍵（來自 translations.ts，有型別保護，打錯字會編譯失敗）
   * @param vars 取代字串中的 `{name}` 佔位符，例如 t('x.count', { n: 5 })
   */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* 無痕模式可能寫不進去；語言在這一次瀏覽仍然有效，不影響使用 */
    }
  }, []);

  /**
   * 同步 `<html lang>` 與**瀏覽器分頁標題**。
   *
   * 【為什麼重要】
   *   - `<html lang>`：螢幕閱讀器依這個屬性決定發音
   *     （中文用中文語音、英文用英文語音）。不設的話，英文介面會用中文語音朗讀。
   *   - `document.title`：分頁標籤、書籤、分享預覽都會顯示它。
   *     `index.html` 裡寫死的是中文，英文模式若不同步就會在分頁上漏出中文。
   */
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-Hant';
    const dict = TRANSLATIONS[language] ?? TRANSLATIONS[DEFAULT_LANGUAGE];
    if (dict['app.documentTitle']) document.title = dict['app.documentTitle'];
  }, [language]);

  const t = useCallback<I18nValue['t']>(
    (key, vars) => {
      const dict = TRANSLATIONS[language] ?? TRANSLATIONS[DEFAULT_LANGUAGE];
      // 理論上不會缺鍵（型別已強制），但字典若被手動改壞也要有安全網
      let text = dict[key] ?? TRANSLATIONS[DEFAULT_LANGUAGE][key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [language]
  );

  const value = useMemo<I18nValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 取用翻譯。必須放在 `<I18nProvider>` 之內。 */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n 必須在 <I18nProvider> 內使用（請檢查 App 的最外層）');
  }
  return ctx;
}
