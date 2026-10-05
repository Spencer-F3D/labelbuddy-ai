/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 一鍵建置 Android APK（2026-10-01）
 * ============================================================================
 *
 * 【為什麼要有這支】
 *   改完程式碼之後要重新出 APK，正常流程是四個步驟：
 *     ① vite build        把網頁打包
 *     ② cap sync android  把網頁複製進 Android 專案
 *     ③ gradlew assembleRelease  編譯並簽章
 *     ④ 把 APK 複製到好找的地方
 *   少做任何一步都會產生「看起來成功但內容是舊的」APK。
 *   這支把它們串起來，並且**每一步都驗證產物真的存在**。
 *
 * ⚠️ 關鍵環境需求（少一個就建不起來）：
 *   - JDK 21（Capacitor 8.x 要求 `JavaVersion.VERSION_21`）
 *     ⚠️ JDK 17 **不行** —— 會得到 `error: invalid source release: 21`
 *   - Android SDK（platforms;android-34 + build-tools;34.0.0）
 *
 * 用法：npm run apk        或        雙擊「建立APK.bat」
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync, unlinkSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { BUILD_ID_META_NAME } from './build-stamp.mjs';
import { readBuildIdFromHtml, readZipEntry } from './lib/zip.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ANDROID_DIR = path.join(ROOT, 'android');

/* ── 小工具 ─────────────────────────────────────────────────────── */

const ok = (m) => console.log(`  ✅ ${m}`);
const info = (m) => console.log(`  ℹ️  ${m}`);
const step = (n, m) => console.log(`\n[${n}/4] ${m}`);
const die = (m, hint) => {
  console.error(`\n❌ ${m}`);
  if (hint) console.error(`   ${hint}`);
  process.exit(1);
};

/**
 * 執行外部指令，即時顯示輸出（不要吞掉錯誤訊息，否則很難除錯）
 *
 * ⚠️⚠️ Windows 上**不能直接 spawn `.bat`／`.cmd`**：
 *     從 Node 18.20.2 / 20.12.2 / 21.7.3 起，為了修 CVE-2024-27980
 *     （Windows 批次檔的參數注入），`spawnSync('gradlew.bat', …)` 會直接回
 *     `EINVAL`，連執行都不執行。
 *
 *   症狀很容易誤判：錯誤訊息長這樣 ——
 *     `Error: spawnSync gradlew.bat EINVAL  errno: -4071`
 *   它**看起來像找不到檔案或權限問題**，其實是 Node 的安全檢查。
 *   本專案就踩過一次：APK 建置在 gradle 那一步失敗，
 *   而前面的 vite build 與 cap sync 都成功，所以畫面看起來像「gradle 壞了」。
 *
 *   解法：批次檔一律透過 `cmd.exe /d /s /c` 執行。
 *   ★ 不要改用 `shell: true` —— 那會讓整個指令字串經過 shell 解析，
 *     路徑含空白或特殊字元時反而更危險（那正是 CVE 的成因）。
 */
function run(cmd, args, opts = {}) {
  const isBatch = /\.(bat|cmd)$/i.test(cmd);
  const realCmd = isBatch ? process.env.ComSpec || 'cmd.exe' : cmd;
  const realArgs = isBatch ? ['/d', '/s', '/c', cmd, ...args] : args;

  return execFileSync(realCmd, realArgs, {
    cwd: opts.cwd ?? ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...opts.env },
    shell: false,
  });
}

/* ── 0. 找 JDK 21 ──────────────────────────────────────────────── */

function findJdk21() {
  const candidates = [
    process.env.JAVA_HOME,
    'D:\\Java\\jdk-21.0.12.1+1',
    'C:\\Program Files\\Microsoft\\jdk-21.0.12.101-hotspot',
    'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.12.101-hotspot',
  ].filter(Boolean);

  // 掃 D:\Java 底下所有 jdk-21* 目錄（版本號會變，不要寫死）
  if (existsSync('D:\\Java')) {
    for (const d of readdirSync('D:\\Java')) {
      if (d.startsWith('jdk-21')) candidates.push(path.join('D:\\Java', d));
    }
  }

  for (const c of candidates) {
    if (c && existsSync(path.join(c, 'bin', 'java.exe'))) {
      /**
       * ⚠️ 確認真的是 21（避免使用者的 JAVA_HOME 還指向 JDK 17）。
       *
       * ⚠️⚠️ **`java -version` 把版本印在 stderr，不是 stdout**，
       *     而且結束碼是 0（成功）。
       *     所以 `execFileSync` 的「成功回傳值」是空字串 ——
       *     用它判斷版本會永遠找不到 JDK。
       *     這裡必須用 `spawnSync` 才能同時拿到 stdout 與 stderr。
       */
      const r = spawnSync(path.join(c, 'bin', 'java.exe'), ['-version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const txt = `${r.stdout ?? ''}${r.stderr ?? ''}`;
      if (/version "21\./.test(txt)) return c;
    }
  }
  return null;
}

/* ── 1. 找 Android SDK ─────────────────────────────────────────── */

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    'D:\\Android\\Sdk',
    path.join(homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (c && existsSync(path.join(c, 'platforms', 'android-34', 'android.jar'))) return c;
  }
  return null;
}

/* ── 主流程 ────────────────────────────────────────────────────── */

console.log('='.repeat(64));
console.log('  LabelBuddy AI — 建置 Android APK');
console.log('='.repeat(64));

const JAVA_HOME = findJdk21();
if (!JAVA_HOME) {
  die(
    '找不到 JDK 21。',
    'Capacitor 8.x 需要 JDK 21（JDK 17 會得到 "invalid source release: 21"）。\n' +
      '   免安裝版下載：https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip\n' +
      '   解壓到 D:\\Java\\ 之後再跑一次即可。'
  );
}
info(`JDK 21：${JAVA_HOME}`);

const ANDROID_HOME = findAndroidSdk();
if (!ANDROID_HOME) {
  die(
    '找不到 Android SDK（缺 platforms/android-34/android.jar）。',
    '請用 sdkmanager 安裝 "platforms;android-34" 與 "build-tools;34.0.0"。'
  );
}
info(`Android SDK：${ANDROID_HOME}`);

const nodeExe = process.execPath;

/* 步驟 1：打包網頁 */
step(1, '打包網頁（vite build）');
run(nodeExe, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  die('vite build 結束了，但 dist/index.html 不存在。');
}
ok(`dist/index.html（${(statSync(path.join(ROOT, 'dist', 'index.html')).size / 1024).toFixed(1)} KB）`);

/* 步驟 2：複製進 Android 專案 */
step(2, '複製網頁資產進 Android 專案（cap sync）');
run(nodeExe, [path.join(ROOT, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'sync', 'android']);
const syncedIndex = path.join(
  ANDROID_DIR,
  'app',
  'src',
  'main',
  'assets',
  'public',
  'index.html'
);
if (!existsSync(syncedIndex)) {
  die('cap sync 結束了，但 Android 專案裡的 index.html 不存在。');
}
ok('網頁資產已同步（含離線 OCR 引擎）');

/* 步驟 3：編譯 APK */
step(3, '編譯並簽章（gradlew assembleRelease）');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, ['assembleRelease', '--no-daemon'], {
  cwd: ANDROID_DIR,
  env: { JAVA_HOME, ANDROID_HOME, PATH: `${path.join(JAVA_HOME, 'bin')};${process.env.PATH}` },
});

const apkPath = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apkPath)) {
  die('gradle 回報成功，但找不到 app-release.apk。');
}

/**
 * ⚠️⚠️ **確認 APK 真的含有這次的網頁內容**（2026-10-02 建立、2026-10-05 改為比指紋）
 *
 * 【為什麼需要這道檢查】
 *   實際踩過：APK 建好了，但裡面的 JS bundle 是**上一個版本** ——
 *   gradle 因為「資產沒變」而跳過重新打包，於是你拿到一個
 *   看起來成功、內容卻是舊的 APK。
 *   這種錯誤**不會有任何錯誤訊息**，只會在你向評審展示時才發現。
 *
 * 【為什麼從「比時間」改成「比建置指紋」（2026-10-05）】
 *   舊做法：`apkMtime < distMtime` 就報錯。
 *   ★ 問題：gradle 對「資產沒變」的建置會合理地判 `packageRelease` UP-TO-DATE
 *     → APK 時間比 `dist/index.html` 舊，但**內容其實完全相同**。
 *     於是每次「沒改程式碼也重新 ship」都會亮紅燈 ——
 *     這正是 MEMORY 說的「狼來了」：真的紅燈會被淹沒在假警報裡。
 *   → 新做法：直接讀 **APK 裡的建置指紋**（`assets/public/index.html` 的
 *     `<meta name="x-build-id">`），與目前 `dist` 的指紋比對。
 *     · *指紋相同* → 內容正確，**通過**（即使 APK 的檔案時間較舊）。
 *     · *指紋不同* → 這才是真的拿到舊包，**失敗**（並提示清快取）。
 *   ★ 為什麼不看檔案時間：時間只證明「檔案被寫過」，
 *     複製、checkout、切分支都會改時間但內容不變（或反之）。
 *     真正的一致性只有比*內容*才算數 —— 這也是 `check-consistency.ts` 的判準。
 */
const distIndex = path.join(ROOT, 'dist', 'index.html');
const distHtml = readFileSync(distIndex, 'utf8');
const distStamp = readBuildIdFromHtml(distHtml, BUILD_ID_META_NAME);

const apkIndexBuf = readZipEntry(apkPath, 'assets/public/index.html');
const apkStamp = apkIndexBuf ? readBuildIdFromHtml(apkIndexBuf.toString('utf8'), BUILD_ID_META_NAME) : null;

/**
 * ★★ 只比「內容指紋」，不比 commit（2026-10-05）。
 *
 * 【為什麼】
 *   指紋格式是 `<commit>[-dirty]+<內容雜湊>`。
 *   若比整個字串，那麼「只改了文件、沒動 App 程式碼」的新 commit
 *   會讓 APK 的 commit 標記落後 → 被誤判為內容不同而失敗。
 *   （實測：APK 為 `9fbd870+3eadec…`、dist 為 `6bcaf91+3eadec…`，
 *    內容雜湊相同、只是期間提交了一份文件。）
 *   → 與 `check-consistency.ts` 一致：**內容雜湊相同 = 同一份程式碼**，
 *     commit 落後只是「警告」級，不是失敗。
 *
 * @returns {string | null} `+` 後面的內容雜湊；格式不符時回 null
 */
const contentFingerprint = (stamp) => {
  const m = stamp && stamp.match(/\+([0-9a-f]+)$/);
  return m ? m[1] : null;
};

const distFp = contentFingerprint(distStamp);
const apkFp = contentFingerprint(apkStamp);

if (!distFp) {
  die(
    'dist/index.html 沒有建置指紋（x-build-id）—— 網頁可能沒有正確建置。',
    '請確認 vite.config.ts 的 buildStampPlugin 有生效，再重新執行。'
  );
}

if (!apkFp) {
  die(
    'APK 內找不到網頁資產或建置指紋（assets/public/index.html）。',
    'APK 可能沒有跑過 `cap sync`，或資產沒有被打包進去。\n' +
      '   請先清掉 Android 的建置快取再試：\n' +
      '     android\\gradlew.bat clean'
  );
}

if (apkFp !== distFp) {
  // 真正的失敗：APK 的*內容*與目前網頁不同 → 它沒有包含這次的改動
  const apkMtime = statSync(apkPath).mtimeMs;
  const distMtime = statSync(distIndex).mtimeMs;
  die(
    'APK 的內容與目前網頁不同 —— 它沒有包含這次的改動。',
    `APK 內容指紋：${apkFp}\n` +
      `   網頁內容指紋：${distFp}\n` +
      `   （APK 完整指紋：${apkStamp}\n` +
      `     網頁完整指紋：${distStamp}）\n` +
      `   （APK 時間：${new Date(apkMtime).toLocaleString()}\n` +
      `     網頁時間：${new Date(distMtime).toLocaleString()}）\n` +
      '   請先清掉 Android 的建置快取再試：\n' +
      '     android\\gradlew.bat clean\n' +
      '   （或直接刪掉 android\\app\\build 目錄）'
  );
}

const sizeMb = (statSync(apkPath).size / 1024 / 1024).toFixed(1);
ok(`app-release.apk（${sizeMb} MB，內容指紋 ${apkFp} ✅）`);

/**
 * 刪除「舊的」APK（2026-10-04 使用者要求自動化）。
 *
 * 【為什麼要自動】
 *   每建置一次就多一個檔在桌面，使用者要自己比對日期才知道哪個是新的。
 *
 * ★★ 安全性：**只刪這個腳本自己產生過的命名模式**
 *      `營養放大鏡_*.apk`（2026-10-02 起的命名）
 *      `LabelBuddyAI_*.apk`（更早的命名，同一條建置流程的產物）
 *    ⚠️ 刻意**不用** `*.apk` 萬用字元 ——
 *       桌面可能有使用者自己下載或收藏的 APK，那不該被建置腳本清掉。
 *    ⚠️ 同名的 `.pdf` / `.typ`（例如 LabelBuddyAI_計劃_20261002.pdf）
 *       完全不受影響，因為這裡只比對 `.apk` 結尾。
 *    ⚠️ 本次剛複製出去的那一個一定保留（用絕對路徑比對，不是用檔名猜）。
 *
 * 【為什麼直接刪除，而不是移到資源回收筒】
 *   這是**建置腳本的產物**、每次都能重新產生，且使用者明確要求自動清理。
 *   為了移回收筒而多一層外部程序呼叫，會讓建置變慢且更容易失敗。
 *   → 每一筆刪除都會列印出來，使用者看得到刪了什麼。
 */
function cleanOldApks(dir, keepPath) {
  const PATTERNS = [/^營養放大鏡_.*\.apk$/i, /^LabelBuddyAI_.*\.apk$/i];
  const keep = path.resolve(keepPath);
  let removed = 0;

  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch (e) {
    info(`無法列出桌面檔案，略過清理（${e.message}）`);
    return;
  }

  for (const name of entries) {
    if (!PATTERNS.some((re) => re.test(name))) continue;
    const full = path.join(dir, name);
    if (path.resolve(full) === keep) continue; // 剛產出的那一個
    try {
      unlinkSync(full);
      info(`已刪除舊 APK：${name}`);
      removed += 1;
    } catch (e) {
      info(`刪不掉舊 APK（${name}）：${e.message}`);
    }
  }

  if (removed === 0) info('沒有需要清理的舊 APK');
}

/* 步驟 4：複製到桌面（好找的地方） */
step(4, '複製到桌面');
const desktop = path.join(homedir(), 'Desktop');
const outDir = existsSync(desktop) ? desktop : ROOT;
/**
 * 檔名上的日期用**本機時區**，不是 UTC。
 *
 * ⚠️ 原本用 `new Date().toISOString().slice(0,10)` —— 那是 UTC。
 *    中國澳門是 UTC+8，所以**每天 16:00 之後**建置出來的檔名會是「昨天」：
 *    實測 10/03 00:40 建置 → 檔名寫成 20261002。
 *    使用者要靠檔名判斷新舊，差一天會直接讓人拿錯檔案。
 */
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
// ★ 2026-10-02 使用者指定：APK 檔名用**中文名**。
//   中文檔名在部分舊工具鏈會出現亂碼，但使用者要依事實找到檔案，
//   而這只只是**複製出來的副本**（源檔仍是 app-release.apk）。
const outName = `營養放大鏡_${stamp}.apk`;
const outPath = path.join(outDir, outName);
try {
  copyFileSync(apkPath, outPath);
  ok(outPath);
  cleanOldApks(outDir, outPath);
} catch (e) {
  info(`複製到桌面失敗（${e.message}），APK 仍在：${apkPath}`);
}

console.log('\n' + '='.repeat(64));
console.log('  ✅ 完成');
console.log('='.repeat(64));
console.log('\n安裝方式：把 APK 傳到手機（USB／雲端硬碟／即時通訊軟體），');
console.log('點開後允許「安裝未知來源的應用程式」即可。\n');
