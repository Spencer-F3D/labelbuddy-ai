/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 一致性驗證：GitHub ／ 線上 ／ 桌面 APK 必須是同一版（2026-10-04）
 * ============================================================================
 *
 * 【為什麼一定要有這支】
 *   使用者原話：「不管是你還是另一個 AI，做了改動便要保證線上／GitHub／APK
 *   三者要一致。」
 *
 *   實際踩過：APK 建好了，但裡面的 JS bundle 是**上一個版本**
 *   （`index-NGW5Huur.js`），而線上已經換成新的（`index-9t5DLi1e.js`）。
 *   這種事**不會有任何錯誤訊息** —— 只有向評審展示時才會發現。
 *
 * 【怎麼判斷「一致」】
 *   建置時（`vite.config.ts` 的 `buildStampPlugin`）會把一個指紋寫進
 *   `dist/index.html`：
 *     <meta name="x-build-id" content="d3e353a+9f2c1a4b7e30">
 *   `cap sync` 會把整個 `dist/` 複製進 Android 專案，所以 APK 也帶著它；
 *   線上網站同理。指紋的組成見 `scripts/build-stamp.mjs` 的檔頭。
 *
 *   這支腳本做四件事：
 *     ① GitHub：工作區乾淨（沒有未提交的變更）＋ 本機 `main` == `origin/main`
 *     ② 本機 `dist`：指紋 == 目前原始碼算出來的指紋；bundle 的 sha256
 *     ③ 線上：首頁的指紋一致，且下載回來的 bundle 的 sha256 與本機相同
 *     ④ APK：解開桌面最新的 APK，指紋一致，bundle 的 sha256 與本機相同
 *
 *   ★ 為什麼要比 **sha256** 而不只比檔名：
 *     檔名是建置工具算出來的內容雜湊，正常情況下會一致 ——
 *     但「檔名一樣、內容不同」是可能的（例如手動改過 dist 裡的檔案）。
 *     真正的一致性只有比內容才算數。
 *   ★ 為什麼**不靠時間**判斷新舊：
 *     時間只能證明「檔案被寫過」。複製、checkout、切分支都會改時間；
 *     本專案已經吃過一次「時間對了但內容是舊的」的虧。
 *
 * 用法：npm run check:consistency
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { BUILD_ID_META_NAME, computeBuildStamp } from './build-stamp.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const APP_URL = process.env.APP_URL || 'https://app.labelbuddy-ai.workers.dev';
const DESKTOP = path.join(homedir(), 'Desktop');

/** APK 的命名模式（與 `build-apk.mjs` 的清理邏輯一致） */
const APK_PATTERNS = [/^營養放大鏡_.*\.apk$/i, /^LabelBuddyAI_.*\.apk$/i];

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}
function section(title: string) {
  console.log(`\n── ${title} ──`);
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/** 從 HTML 取出建置指紋 */
function readBuildId(html: string): string | null {
  const m = html.match(new RegExp(`<meta\\s+name="${BUILD_ID_META_NAME}"\\s+content="([^"]+)"`, 'i'));
  return m ? m[1] : null;
}

/** 從 HTML 取出主要 JS bundle 的檔名（例如 `assets/index-9t5DLi1e.js`） */
function readBundlePath(html: string): string | null {
  const m = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
  return m ? m[0] : null;
}

/**
 * 從 ZIP（APK 就是 ZIP）取出單一檔案的內容。
 *
 * 【為什麼自己實作，不呼叫 `unzip`／`jar`】
 *   - `unzip` 在 Windows 上不是內建指令，使用者雙擊 .bat 時不一定有。
 *   - `jar` 只能列出或解到磁碟，不能把內容印到 stdout。
 *   → 自己讀 ZIP 的 central directory 最可靠，而且沒有額外依賴。
 *
 * APK 的 assets 用 deflate 壓縮，所以要 `inflateRawSync`。
 */
function readZipEntry(zipPath: string, entryName: string): Buffer | null {
  const buf = readFileSync(zipPath);

  // 1. 從檔尾往前找 EOCD（End Of Central Directory，簽章 0x06054b50）
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const cdCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory 的起始位移

  // 2. 走訪 central directory，找目標檔名
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    if (name === entryName) {
      // 3. 讀 local header 才能算出資料真正的起點（local 的 extra 長度可能不同）
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return Buffer.from(data); // stored
      if (method === 8) return inflateRawSync(data); // deflate
      return null; // 其他壓縮法（APK 的 assets 不會用到）
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** 找出桌面最新的 APK */
function findNewestApk(): string | null {
  let entries: string[];
  try {
    entries = readdirSync(DESKTOP);
  } catch {
    return null;
  }
  const apks = entries
    .filter((n) => APK_PATTERNS.some((re) => re.test(n)))
    .map((n) => path.join(DESKTOP, n))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return apks[0] ?? null;
}

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/* ═══════════════════════════════════════════════════════════════════════ */

console.log('='.repeat(66));
console.log('  一致性驗證：GitHub ／ 線上 ／ 桌面 APK');
console.log('='.repeat(66));

// ── 0. 基準：目前原始碼應該是什麼指紋 ─────────────────────────────────
const expected = computeBuildStamp(ROOT);
console.log(`\n  目前原始碼指紋：${expected.id}`);

/* ── 1. GitHub ───────────────────────────────────────────────────────── */
section('1. GitHub（原始碼）');

let worktreeClean = false;
let pushed = false;
try {
  const status = git(['status', '--porcelain']);
  worktreeClean = status.length === 0;
  check(
    '工作區乾淨（沒有未提交的變更）',
    worktreeClean,
    worktreeClean ? '' : '有未提交的變更 → 先 commit 再同步'
  );

  const head = git(['rev-parse', 'HEAD']);
  const remote = git(['rev-parse', 'origin/main']);
  pushed = head === remote;
  check(
    '本機 main 已推上 GitHub（origin/main）',
    pushed,
    pushed ? '' : '有未推送的 commit → git push origin main'
  );
} catch (e: any) {
  check('可以讀取 git 狀態', false, String(e?.message ?? e).split('\n')[0]);
}

/* ── 2. 本機 dist ────────────────────────────────────────────────────── */
section('2. 本機 dist（建置產物）');

const distIndex = path.join(ROOT, 'dist', 'index.html');
let distHtml = '';
let distBundlePath: string | null = null;
let distBundleHash = '';

if (!existsSync(distIndex)) {
  check('dist/index.html 存在', false, '先跑 vite build（或 npm run ship）');
} else {
  check('dist/index.html 存在', true);
  distHtml = readFileSync(distIndex, 'utf8');
  const distId = readBuildId(distHtml);
  check(
    `dist 的建置指紋等於目前原始碼（${expected.id}）`,
    distId === expected.id,
    distId ? `dist 是 ${distId} → 原始碼已改，要重新建置` : 'dist 裡沒有建置指紋'
  );

  distBundlePath = readBundlePath(distHtml);
  if (distBundlePath) {
    const abs = path.join(ROOT, 'dist', distBundlePath);
    if (existsSync(abs)) {
      distBundleHash = sha256(readFileSync(abs));
      check(`dist 的 bundle 存在（${distBundlePath}）`, true);
    } else {
      check(`dist 的 bundle 存在（${distBundlePath}）`, false, 'index.html 指向的檔案不存在');
    }
  } else {
    check('dist/index.html 有引用 JS bundle', false);
  }
}

/* ── 3. 線上 ─────────────────────────────────────────────────────────── */
section(`3. 線上 ${APP_URL}`);

let liveBundlePath: string | null = null;
try {
  const res = await fetch(`${APP_URL}/`, { headers: { 'cache-control': 'no-cache' } });
  const html = await res.text();
  const liveId = readBuildId(html);
  check(
    `線上的建置指紋等於目前原始碼（${expected.id}）`,
    liveId === expected.id,
    liveId ? `線上還是 ${liveId} → 要重新部署` : '線上首頁沒有建置指紋（可能是舊版）'
  );

  liveBundlePath = readBundlePath(html);
  check(
    '線上引用的 bundle 與本機 dist 相同',
    !!liveBundlePath && liveBundlePath === distBundlePath,
    `線上 ${liveBundlePath ?? '(無)'} vs 本機 ${distBundlePath ?? '(無)'}`
  );

  // 內容比對：檔名一樣不代表內容一樣
  if (liveBundlePath && distBundleHash) {
    const jsRes = await fetch(`${APP_URL}/${liveBundlePath}`);
    const liveHash = sha256(Buffer.from(await jsRes.arrayBuffer()));
    check(
      '線上 bundle 的內容（sha256）與本機 dist 相同',
      liveHash === distBundleHash,
      `線上 ${liveHash.slice(0, 12)}… vs 本機 ${distBundleHash.slice(0, 12)}…`
    );
  }
} catch (e: any) {
  check('可以連上線上網站', false, String(e?.message ?? e).split('\n')[0]);
}

/* ── 4. 桌面 APK ─────────────────────────────────────────────────────── */
section('4. 桌面 APK');

const apkPath = findNewestApk();
if (!apkPath) {
  check('桌面有 APK（營養放大鏡_*.apk）', false, '先跑 npm run apk（或 npm run ship）');
} else {
  check(`找到 APK：${path.basename(apkPath)}`, true);

  const apkIndexHtml = readZipEntry(apkPath, 'assets/public/index.html');
  if (!apkIndexHtml) {
    check('APK 內有網頁資產（assets/public/index.html）', false, 'APK 可能沒跑過 cap sync');
  } else {
    const apkHtml = apkIndexHtml.toString('utf8');
    const apkId = readBuildId(apkHtml);
    check(
      `APK 的建置指紋等於目前原始碼（${expected.id}）`,
      apkId === expected.id,
      apkId ? `APK 是 ${apkId} → 要重新建置 APK` : 'APK 首頁沒有建置指紋（可能是舊版）'
    );

    const apkBundlePath = readBundlePath(apkHtml);
    check(
      'APK 內引用的 bundle 與本機 dist 相同',
      !!apkBundlePath && apkBundlePath === distBundlePath,
      `APK ${apkBundlePath ?? '(無)'} vs 本機 ${distBundlePath ?? '(無)'}`
    );

    // 內容比對：把 APK 裡的 JS 解出來算 sha256
    if (apkBundlePath && distBundleHash) {
      const apkJs = readZipEntry(apkPath, `assets/public/${apkBundlePath}`);
      if (!apkJs) {
        check('可以從 APK 取出 JS bundle', false, `找不到 assets/public/${apkBundlePath}`);
      } else {
        const apkHash = sha256(apkJs);
        check(
          'APK bundle 的內容（sha256）與本機 dist 相同',
          apkHash === distBundleHash,
          `APK ${apkHash.slice(0, 12)}… vs 本機 ${distBundleHash.slice(0, 12)}…`
        );
      }
    }
  }
}

/* ── 結論 ────────────────────────────────────────────────────────────── */
console.log('\n' + '='.repeat(66));
if (fail === 0) {
  console.log(`  ✅ 三個產物一致：${pass} 項全部通過`);
  console.log(`     建置指紋 ${expected.id}`);
  console.log('='.repeat(66));
} else {
  console.log(`  ❌ 不一致：${fail} 項失敗（通過 ${pass} 項）`);
  console.log('');
  console.log('  修正方式（缺哪一個就跑哪一個）：');
  console.log('    · GitHub 落後   → git push origin main');
  console.log('    · dist 落後     → vite build');
  console.log('    · 線上落後      → vite build && wrangler deploy');
  console.log('    · APK 落後      → npm run apk');
  console.log('    · 全部一次做完  → npm run ship');
  console.log('='.repeat(66));
}
process.exit(fail === 0 ? 0 : 1);
