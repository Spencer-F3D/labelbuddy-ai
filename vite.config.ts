import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

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
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
