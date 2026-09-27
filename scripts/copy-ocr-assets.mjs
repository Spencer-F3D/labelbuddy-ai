/**
 * 複製 tesseract.js 的瀏覽器執行檔到 public/
 *
 * 【為什麼需要這一步】
 *   tesseract.js 在瀏覽器端需要三個東西：
 *     1. worker.min.js          —— Web Worker 進入點
 *     2. tesseract-core-*.wasm.js + .wasm —— 辨識引擎（WASM）
 *     3. 語言模型 traineddata   —— 我們自己的（public/tessdata/）
 *
 *   第 1、2 項預設會從 CDN（cdn.jsdelivr.net）下載。這在比賽場合是風險：
 *   現場網路不穩、或 CDN 被擋，離線備用方案就失效了。
 *   所以我們把它們複製成自己的靜態資源，完全本機化。
 *
 * 【為什麼用腳本複製，而不是直接提交檔案】
 *   這些檔案本來就在 node_modules 裡（是 npm 依賴），
 *   直接提交等於把 10 MB 的第三方二進位檔放進版控、且可能與 package.json 版本不一致。
 *   用腳本在每次啟動／建置前從 node_modules 複製，永遠與安裝的版本同步。
 *
 * 【核心檔案的選擇邏輯（實際讀 tesseract.js 原始碼得知）】
 *   它會依裝置能力挑其中一個：
 *     支援 relaxedsimd → tesseract-core-relaxedsimd-lstm.wasm.js
 *     支援 simd       → tesseract-core-simd-lstm.wasm.js
 *     都不支援        → tesseract-core-lstm.wasm.js
 *   我們用 OEM 1（LSTM），所以只需要這三個 LSTM 變體，不必複製非 LSTM 的版本。
 */

import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CORE_SRC = path.join(ROOT, 'node_modules', 'tesseract.js-core');
const DIST_SRC = path.join(ROOT, 'node_modules', 'tesseract.js', 'dist');

const OUT_DIR = path.join(ROOT, 'public');
const CORE_OUT = path.join(OUT_DIR, 'tesseract-core');

/** OEM 1（LSTM）會用到的三種核心變體 */
const CORE_VARIANTS = [
  'tesseract-core-lstm',
  'tesseract-core-simd-lstm',
  'tesseract-core-relaxedsimd-lstm',
];

const C = { reset: '\u001b[0m', green: '\u001b[32m', yellow: '\u001b[33m', red: '\u001b[31m', dim: '\u001b[2m' };

/** 已存在且大小相同就跳過，避免每次都重寫 10 MB */
function copyIfNeeded(src, dest) {
  if (!existsSync(src)) {
    return { ok: false, reason: `找不到來源 ${path.relative(ROOT, src)}` };
  }
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) {
    return { ok: true, skipped: true };
  }
  copyFileSync(src, dest);
  return { ok: true, skipped: false };
}

function main() {
  if (!existsSync(CORE_SRC) || !existsSync(DIST_SRC)) {
    console.error(`${C.red}[copy-ocr-assets] 找不到 tesseract.js 套件。請先執行 npm install。${C.reset}`);
    process.exit(1);
  }

  mkdirSync(CORE_OUT, { recursive: true });

  const jobs = [];

  // Web Worker 進入點
  jobs.push(['worker.min.js', path.join(OUT_DIR, 'tesseract-worker.min.js')]);

  // 三種核心變體（.wasm.js 是載入器，.wasm 是引擎本體）
  for (const name of CORE_VARIANTS) {
    jobs.push([`${name}.wasm.js`, path.join(CORE_OUT, `${name}.wasm.js`)]);
    jobs.push([`${name}.wasm`, path.join(CORE_OUT, `${name}.wasm`)]);
  }

  let copied = 0;
  let skipped = 0;
  const errors = [];

  for (const [rel, dest] of jobs) {
    const src = rel === 'worker.min.js' ? path.join(DIST_SRC, rel) : path.join(CORE_SRC, rel);
    const r = copyIfNeeded(src, dest);
    if (!r.ok) {
      errors.push(r.reason);
      continue;
    }
    if (r.skipped) skipped++;
    else copied++;
  }

  if (errors.length > 0) {
    console.error(`${C.red}[copy-ocr-assets] 有檔案複製失敗：${C.reset}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const totalMb = jobs.reduce((sum, [, dest]) => sum + (existsSync(dest) ? statSync(dest).size : 0), 0) / 1048576;
  console.log(
    `${C.green}[copy-ocr-assets]${C.reset} OCR 執行檔就緒：` +
      `複製 ${copied} 個、略過 ${skipped} 個，共 ${totalMb.toFixed(1)} MB ${C.dim}(public/)${C.reset}`
  );
}

main();
