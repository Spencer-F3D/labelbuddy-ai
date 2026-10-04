/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 建置指紋（build stamp）— 2026-10-04
 * ============================================================================
 *
 * 【為什麼需要這個】
 *   這個專案同時有「三個產物」要維持一致：
 *     ① GitHub 上的原始碼
 *     ② 線上 https://app.labelbuddy-ai.workers.dev
 *     ③ 桌面上的 Android APK（`營養放大鏡_YYYYMMDD.apk`）
 *
 *   實際發生過：APK 建好了，但裡面的 JS bundle 是**上一個版本**
 *   （`index-NGW5Huur.js`），而線上已經換成新的（`index-9t5DLi1e.js`）。
 *   這種事**不會有任何錯誤訊息** —— 只有在向評審展示時才會發現。
 *
 *   所以我們讓每個產物**自己說得出自己是哪一版**：
 *   建置時把一個指紋寫進 `dist/index.html` 的
 *   `<meta name="x-build-id" content="…">`，APK 與線上都會帶著它。
 *   → 「一致」就有了客觀定義：**三者的指紋都必須等於目前原始碼算出來的指紋**。
 *
 * 【指紋怎麼算】
 *   `<commit>-<dirty?>+<內容雜湊>`
 *   例：`d3e353a+9f2c1a4b7e30`
 *
 *   - `commit`：建置當下的 HEAD 短雜湊。
 *     ★ 這讓「**只改了文件**」也算不一致 —— 使用者明確要求
 *       「做了改動便要保證三者一致」，所以任何 commit 都必須重新同步。
 *   - `dirty`：建置時工作區不乾淨就加上去。這種產物**不該被部署**
 *     （它對應不到任何一個 commit），`check-consistency` 會直接判定失敗。
 *   - `內容雜湊`：對原始碼算出來的雜湊（見 `FINGERPRINT_PATHS`）。
 *     ★ 用途是抓「用髒的工作區建置、之後又改了東西」這種情況 ——
 *       只有 commit 的話看不出來。
 *
 * 【為什麼不用 `dist` 的修改時間判斷新舊】
 *   時間只能證明「檔案有被寫過」，不能證明「內容是同一份」。
 *   複製檔案、切換分支、重新 checkout 都會改時間但內容不變（或反之）。
 *   本專案已經吃過一次「時間對了但內容是舊的」的虧（見 `build-apk.mjs`）。
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * 會影響 App 行為的檔案／目錄。
 *
 * ⚠️ 刻意**不含** `public/`：那裡有約 19 MB 的 OCR 執行檔（WASM 與語言檔），
 *    每次建置都重算會拖慢建置，而且它們由 `package.json` 的依賴版本決定
 *    （版本變了 package.json 就會變 → 已經被涵蓋）。
 * ⚠️ 刻意**不含** `android/`：那是原生外殼，網頁資產由 `cap sync` 從 `dist/` 複製，
 *    內容已經被 `src/` 的雜湊涵蓋。
 */
const FINGERPRINT_PATHS = [
  'index.html',
  'worker.ts',
  'server.ts',
  'package.json',
  'package-lock.json',
  'wrangler.toml',
  'capacitor.config.ts',
  'vite.config.ts',
  'tsconfig.json',
  'src',
  'server',
];

/** 遞迴收集檔案清單（相對於專案根目錄、以 `/` 分隔、已排序） */
function collectFiles(root, relPath, out) {
  const abs = path.join(root, relPath);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return; // 檔案不存在就略過（例如尚未產生的檔案）
  }

  if (st.isFile()) {
    out.push(relPath);
    return;
  }
  if (!st.isDirectory()) return;

  for (const name of readdirSync(abs).sort()) {
    // 跳過不該進雜湊的目錄（版本控制、產物、隱藏目錄）
    if (name === 'node_modules' || name === 'dist' || name === 'android') continue;
    if (name.startsWith('.')) continue;
    collectFiles(root, `${relPath}/${name}`, out);
  }
}

/**
 * 把 CRLF 正規化成 LF。
 *
 * ⚠️ **一定要做**：這個 repo 的 `core.autocrlf=true`，同一份檔案在不同機器上
 *    可能是 LF 也可能是 CRLF。不正規化的話，指紋會因為「換行字元」而不同，
 *    於是產生一個永遠修不好的假警報。
 */
function normalizeEol(buf) {
  const out = Buffer.allocUnsafe(buf.length);
  let j = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a) continue; // 丟掉 CR
    out[j++] = buf[i];
  }
  return out.subarray(0, j);
}

/**
 * 對原始碼內容算雜湊（12 個十六進位字元）。
 *
 * 做法：把「相對路徑 + 檔案內容雜湊」依路徑排序後串起來再雜湊一次。
 * ★ 把路徑也餵進去，所以「檔案改名但內容不變」也會讓指紋改變（這是對的 ——
 *   改名確實改變了建置產物）。
 */
export function computeFingerprint(root) {
  const files = [];
  for (const p of FINGERPRINT_PATHS) collectFiles(root, p, files);
  files.sort();

  const h = createHash('sha256');
  for (const rel of files) {
    h.update(rel);
    h.update('\0');
    h.update(createHash('sha256').update(normalizeEol(readFileSync(path.join(root, rel)))).digest());
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

/** 建置當下的 HEAD 短雜湊；拿不到 git 時回 `nogit`（不要讓建置失敗） */
export function shortHead(root) {
  try {
    const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() || 'nogit';
  } catch {
    return 'nogit';
  }
}

/** 工作區是否不乾淨（有未提交的變更） */
export function isDirty(root) {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * 算出完整的建置指紋。
 *
 * @param {string} root 專案根目錄
 * @returns {{ id: string, commit: string, fingerprint: string, dirty: boolean }}
 */
export function computeBuildStamp(root) {
  const commit = shortHead(root);
  const fingerprint = computeFingerprint(root);
  const dirty = isDirty(root);
  return {
    commit,
    fingerprint,
    dirty,
    id: `${commit}${dirty ? '-dirty' : ''}+${fingerprint}`,
  };
}

/** 寫進 `dist/index.html` 的 meta 名稱（三個產物都靠它自我識別） */
export const BUILD_ID_META_NAME = 'x-build-id';
