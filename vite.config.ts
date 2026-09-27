import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

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

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
