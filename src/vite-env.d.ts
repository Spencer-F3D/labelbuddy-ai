/// <reference types="vite/client" />

/**
 * 建置指紋（由 `vite.config.ts` 的 `buildStampPlugin` 用 Vite 的 `define` 注入）。
 *
 * 值長這樣：`d3e353a+9f2c1a4b7e30`（commit 短雜湊 ＋ 原始碼內容雜湊）。
 * 組成與理由見 `scripts/build-stamp.mjs` 的檔頭。
 *
 * 【為什麼需要這個宣告】
 *   `define` 是在**打包時**把識別字換成字串常值，所以 TypeScript 看不到它。
 *   沒有這一行，`tsc --noEmit` 會報 `Cannot find name '__BUILD_ID__'`。
 *
 * ★ 它讓 App 能自我識別版本：開發者面板會顯示它，
 *   而線上網站／APK 的首頁也帶著同一個值（`<meta name="x-build-id">`），
 *   三者的「一致」因此可以被程式驗證（`scripts/check-consistency.ts`）。
 */
declare const __BUILD_ID__: string;
