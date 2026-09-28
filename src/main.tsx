import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { I18nProvider } from './i18n/I18nContext.tsx';
import './index.css';

/**
 * 進入點。
 *
 * ⚠️ `I18nProvider` 必須包在 `App` 外面：
 *    App 自己的函式本體就會呼叫 `useI18n()`。
 *    若把 Provider 寫在 App 的 return 裡面，App 本身就取不到 context 而拋錯。
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
