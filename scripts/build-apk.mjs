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
import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

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

/** 執行外部指令，即時顯示輸出（不要吞掉錯誤訊息，否則很難除錯） */
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
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
 * ⚠️⚠️ **確認 APK 真的比網頁新**（2026-10-02 新增）
 *
 * 【為什麼需要這道檢查】
 *   實際踩過：APK 建好了，但裡面的 JS bundle 是**上一個版本** ——
 *   gradle 因為「資產沒變」而跳過重新打包，於是你拿到一個
 *   看起來成功、內容卻是舊的 APK。
 *   這種錯誤**不會有任何錯誤訊息**，只會在你向評審展示時才發現。
 *
 * 【檢查方式】
 *   APK 的修改時間必須晚於 `dist/index.html`。
 *   如果 APK 比較舊，代表它沒有包含這次的網頁改動。
 */
const distIndex = path.join(ROOT, 'dist', 'index.html');
const apkMtime = statSync(apkPath).mtimeMs;
const distMtime = statSync(distIndex).mtimeMs;
if (apkMtime < distMtime) {
  die(
    'APK 比網頁還舊 —— 它沒有包含這次的改動。',
    `APK 時間：${new Date(apkMtime).toLocaleString()}\n` +
      `   網頁時間：${new Date(distMtime).toLocaleString()}\n` +
      '   請先清掉 Android 的建置快取再試：\n' +
      '     android\\gradlew.bat clean\n' +
      '   （或直接刪掉 android\\app\\build 目錄）'
  );
}
const sizeMb = (statSync(apkPath).size / 1024 / 1024).toFixed(1);
ok(`app-release.apk（${sizeMb} MB，比網頁新 ✅）`);

/* 步驟 4：複製到桌面（好找的地方） */
step(4, '複製到桌面');
const desktop = path.join(homedir(), 'Desktop');
const outDir = existsSync(desktop) ? desktop : ROOT;
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const outName = `LabelBuddyAI_${stamp}.apk`;
const outPath = path.join(outDir, outName);
try {
  copyFileSync(apkPath, outPath);
  ok(outPath);
} catch (e) {
  info(`複製到桌面失敗（${e.message}），APK 仍在：${apkPath}`);
}

console.log('\n' + '='.repeat(64));
console.log('  ✅ 完成');
console.log('='.repeat(64));
console.log('\n安裝方式：把 APK 傳到手機（USB／雲端硬碟／即時通訊軟體），');
console.log('點開後允許「安裝未知來源的應用程式」即可。\n');
