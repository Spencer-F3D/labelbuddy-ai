import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { BUILD_ID_META_NAME, computeBuildStamp } from './scripts/build-stamp.mjs';

/**
 * 允許透過反向代理（Cloudflare Tunnel 等）存取開發伺服器。
 *
 * 【為什麼需要】
 *   Vite 預設會檢查請求的 Host 標頭，只接受 localhost 與本機 IP，
 *   用來防止 DNS rebinding 攻擊。但透過 Cloudflare Tunnel 存取時，
 *   Host 會是 `xxx.trycloudflare.com`，Vite 會直接回：
 *     403 Blocked request. This host is not allowed.
 *   實測：API 端點正常，但前端首頁被擋下（HTTP 403）。
 *
 * 【安全取捨】
 *   只放行 `*.trycloudflare.com`（臨時 tunnel 網域），不是 `true`（放行全部）。
 *   quick tunnel 的網址是隨機且短命的，實際風險很低。
 *   若之後改用自有網域，用環境變數覆寫即可：
 *     VITE_ALLOWED_HOSTS=".trycloudflare.com,.example.com"
 */
const extraAllowedHosts = (process.env.VITE_ALLOWED_HOSTS || '.trycloudflare.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * 建置指紋（2026-10-04）
 *
 * 【為什麼要有這個 plugin】
 *   這個專案有三個必須一致的產物：GitHub 原始碼／線上網站／桌面 APK。
 *   實際踩過：APK 裡的 JS bundle 是上一個版本，而線上已經換新的了 ——
 *   沒有任何錯誤訊息，只有向評審展示時才會發現。
 *
 *   這個 plugin 把指紋寫進 `dist/index.html` 的
 *   `<meta name="x-build-id">`。`cap sync` 會把整個 `dist/` 複製進 Android
 *   專案，所以 APK 也會帶著同一個指紋；線上網站同理。
 *   → `scripts/check-consistency.ts` 就能用同一個值比對三者。
 *
 *   指紋的組成與理由見 `scripts/build-stamp.mjs` 的檔頭。
 *
 * ⚠️ 只在 `vite build` 時注入（`apply: 'build'`）。
 *    開發伺服器不需要 —— 而且 dev 時工作區通常是髒的，注入只會誤導。
 */
function buildStampPlugin(): Plugin {
  const stamp = computeBuildStamp(import.meta.dirname);
  return {
    name: 'labelbuddy-build-stamp',
    apply: 'build',
    transformIndexHtml(html) {
      const meta = `<meta name="${BUILD_ID_META_NAME}" content="${stamp.id}" />`;
      return html.replace('</head>', `    ${meta}\n  </head>`);
    },
    config() {
      return { define: { __BUILD_ID__: JSON.stringify(stamp.id) } };
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), buildStampPlugin()],
    resolve: {
      alias: {
        // 使用 import.meta.dirname 而非 __dirname：
        // Vite 8 的 native config loader 不支援 __dirname，會發出棄用警告。
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // 開發時可設 DISABLE_HMR=true 關閉熱更新。
      // 注意：關閉 HMR 時必須一併停用檔案監看，否則自動化編輯期間會畫面閃爍並浪費 CPU。
      // 透過 tunnel 給手機測試時建議關閉：HMR 的 WebSocket 在代理後方不穩定。
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      allowedHosts: extraAllowedHosts,
    },
  };
});
