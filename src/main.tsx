import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { I18nProvider } from './i18n/I18nContext.tsx';
import { TRANSLATIONS } from './i18n/translations';
import './index.css';

/**
 * 進入點。
 *
 * ⚠️ `I18nProvider` 必須包在 `App` 外面：
 *    App 自己的函式本體就會呼叫 `useI18n()`。
 *    若把 Provider 寫在 App 的 return 裡面，App 本身就取不到 context 而拋錯。
 */

/* ── 在 React 掛載「之前」先把語言相關的屬性設好 ────────────────────
 * `index.html` 裡寫死的是中文標題。`I18nContext` 也會同步它，但那是
 * `useEffect` —— 要等第一次 render 之後才跑。
 *
 * 這中間有個空窗：英文使用者會看到分頁標籤**先閃一下中文**，
 * 瀏覽器測試也確實抓到過（`02-history`：LabelBuddy AI - 您的超市健康小幫手）。
 * 標題不像畫面內容會被 React 重繪蓋掉，它會一直留著，
 * 所以在掛載前先設一次是必要的，不是多餘的最佳化。
 */
try {
  const stored = localStorage.getItem('labelbuddy-language');
  const lang: 'zh-TW' | 'en' = stored === 'en' ? 'en' : 'zh-TW';
  const dict = TRANSLATIONS[lang];
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
  if (dict?.['app.documentTitle']) document.title = dict['app.documentTitle'];
} catch {
  // localStorage 被封鎖（無痕模式等）時不影響啟動
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
