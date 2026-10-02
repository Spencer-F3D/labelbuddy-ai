/**
 * Capacitor 設定（2026-10-01）
 *
 * ============================================================================
 * 【設計決定：把網頁「打包進去」，不用 server.url 指向線上網站】
 * ============================================================================
 *
 * Capacitor 有兩種做法：
 *
 *   ① `server.url = 'https://app.labelbuddy-ai.workers.dev'`
 *      → APK 只是一個「瀏覽器外殼」，每次打開都連線載入線上網站。
 *      → 缺點：沒網路就整個打不開；而且看起來不像一個真的 App。
 *
 *   ② 把 `dist/` 打包進去（本檔採用）
 *      → 介面、圖示、食育教材、**離線 OCR 引擎**全部在裝置上。
 *      → 打開就秒開，飛航模式也能瀏覽教材與紀錄。
 *      → 只有「雲端 AI 分析」需要連網 —— 那本來就是設計上要連網的部分。
 *
 * ★ 採用 ② 的關鍵理由：本專案的「只在本機」模式承諾**完全不連網**。
 *   如果連介面都要從網路載入，那個承諾就不可能成立。
 *
 * ⚠️ 用 ② 就必須處理 API 的絕對網址 —— 見 `src/utils/apiBase.ts`。
 *    WebView 的 origin 是 `https://localhost`，相對路徑會打到 localhost。
 */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  /** 反向網域命名。發佈後不可更改（改了等於換一個 App）。 */
  appId: 'ai.labelbuddy.app',
  appName: 'LabelBuddy AI',
  /** Vite 的輸出目錄 —— 這裡面的東西會被複製進 APK */
  webDir: 'dist',

  android: {
    /**
     * ⚠️ 保持 false：本 App 的 API 是 HTTPS，不需要混合內容。
     *    開放混合內容會讓「只在本機」的隱私承諾變得模糊。
     */
    allowMixedContent: false,
    /**
     * 相機／相簿：本專案用的是 `<input type="file" capture="environment">`，
     * Capacitor 的 WebView 會透過 `onShowFileChooser` 處理，
     * 不需要額外的 Capacitor 相機外掛。
     * 權限宣告寫在 `android/app/src/main/AndroidManifest.xml`。
     */
  },

  ios: {
    contentInset: 'always',
  },
};

export default config;
