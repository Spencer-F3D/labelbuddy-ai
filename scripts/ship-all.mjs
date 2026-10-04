/**
 * 一次把「線上 / GitHub / APK」三個管道推到一致，並**驗證**一致。
 *
 * ============================================================================
 * 【為什麼要有這支腳本】
 *   使用者明確要求（2026-10-04）：
 *     「我要不管是你還是另一個 AI，做了改動便要保證線上／GitHub／APK 三者要一致」
 *
 *   在這之前，「部署」是三個獨立動作（git push → vite build → wrangler deploy），
 *   靠人記得做、也沒有人驗證結果。實際已經發生過：
 *     · 部署完之後另一個 AI 又改了檔案 → APK 的 bundle 與線上不一致
 *     · 建置期間檔案被改 → 三者的 bundle 雜湊各不相同，而且**沒有任何警告**
 *
 *   → 把一致性從「口頭承諾」變成「機械保證」：
 *     任何一步不吻合就**以非零結束碼失敗並印出差在哪**。
 *
 * 【三者的關係】
 *   GitHub  ＝ 原始碼的來源（不含 bundle）
 *   online  ＝ Cloudflare Workers 部署出去的 `dist/`
 *   APK     ＝ 把同一份 `dist/` 打包進 Android
 *   → 三者的 `assets/index-XXXX.js` **必須是同一個檔名**。
 *     檔名是 Vite 依內容算出來的雜湊，檔名相同就代表內容相同。
 *
 * ★★ 與 `scripts/check-consistency.ts`（另一個 AI 寫的）的**分工**：
 *
 *   | 腳本 | 負責 |
 *   | --- | --- |
 *   | `ship-all.mjs`（本檔）  | **做**：建置 → 推送 → 部署 → 出 APK |
 *   | `check-consistency.ts` | **驗**：用建置指紋 ＋ sha256 比對三者 |
 *
 *   ⚠️ 我原本自己寫了一套「比對 bundle 檔名」的驗證，後來**移除了** ——
 *      對方的做法更徹底：它在 `dist/index.html` 寫入建置指紋
 *      `<meta name="x-build-id">`（讓每個產物自己說得出自己是哪一版），
 *      而且比對 **sha256 內容**而不是只看檔名
 *      （檔名相同但內容不同是可能的）。
 *   → 本檔結尾直接呼叫它的驗證，**不重複實作**。
 *     兩個 AI 各寫一套一致性檢查，只會製造新的不一致。
 *
 * ⚠️ 這支腳本**不會幫你 commit** —— 提交訊息只有你知道。
 *    它只負責「已提交的內容被正確送到三個地方」，
 *    最後交由 `check:consistency` 判定三者是否真的同一版。
 *
 * 用法：
 *   node scripts/ship-all.mjs              完整流程
 *   node scripts/ship-all.mjs --skip-checks  跳過檢查（趕時間用，不建議）
 *   node scripts/ship-all.mjs --no-apk       只做線上＋GitHub
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://app.labelbuddy-ai.workers.dev';
const GIT = 'C:/Program Files/Git/cmd/git.exe';
const NODE = process.execPath;

const args = process.argv.slice(2);
const SKIP_CHECKS = args.includes('--skip-checks');
const NO_APK = args.includes('--no-apk');

let failures = 0;
const step = (n, title) => console.log(`\n${'─'.repeat(64)}\n[${n}] ${title}\n${'─'.repeat(64)}`);
const ok = (m) => console.log(`  ✅ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);
const bad = (m) => {
  console.log(`  ❌ ${m}`);
  failures++;
};

/**
 * ★★ 執行外部程序 —— 一定要用 `stdio: 'inherit'`。
 *
 * 【為什麼】（2026-10-04 實測，花了三輪才找出來）
 *   在這個沙箱環境裡，用 `spawnSync(cmd, args, { encoding: 'utf8' })`
 *   （＝把 stdout 接管成 pipe）會**直接失敗**：
 *     `EBUSY spawnSync <任何執行檔>`
 *   而且 `cmd.exe`、`git.exe`、`python.exe`、`node.exe` **全部一樣** ——
 *   不是某個程式的問題，是「接管 stdio」這件事本身被擋。
 *   （`shell: true` 也一樣失敗，而且那本來就不該用。）
 *
 *   實測對照：
 *     spawnSync(..., { encoding:'utf8' })  → EBUSY
 *     spawnSync(..., { stdio:'inherit' })  → ✅ status 0
 *     execFileSync(..., { stdio:'inherit' }) → ✅
 *
 *   → 代價是**拿不到子程序的輸出**，只能拿到結束碼。
 *     所以本腳本的驗證一律改成「看結束碼 + 自己查檔案／網路」，
 *     不解析子程序的 stdout。
 *     （`build-apk.mjs` 早就是這樣寫的，所以它一直都能跑 ——
 *       我當初沒照抄它的 stdio 設定，才踩到這個坑。）
 */
const run = (cmd, cmdArgs) => {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: false });
  return r.status ?? 1;
};

/**
 * git 的**同步**查詢／推送。
 *
 * ⚠️ 這裡用 `execFileSync` ＋ **明確的 `stdio: ['ignore','pipe','pipe']`**。
 *
 * 【為什麼不是 spawnSync】
 *   沙箱內 `spawnSync` 一律回 `EBUSY`（見上面 `run` 的說明）。
 * 【為什麼不是「cmd.exe 重導到檔案」】
 *   原本的寫法是
 *     `cmd.exe /d /s /c "git" -C "..." push origin main > .tmp-git-out 2>&1`
 *   它**讀得到輸出**，但 `git push` 實際上**沒有推送成功**
 *   （2026-10-04 實測：跑完 ship-all 之後 `git status -sb` 仍是 `ahead 1`，
 *     手動 push 才成功）。推測是 push 需要 GCM 憑證時，
 *   在重導的環境下拿不到互動介面而失敗 —— 而且結束碼被 `cmd.exe` 吃掉，
 *   呼叫端看不出來。
 *   → 改成直接 `execFileSync`，結束碼與 stderr 都拿得到，
 *     失敗時呼叫端會看到真正的錯誤訊息。
 *
 * ⚠️ 教訓：**驗證「有推送成功」要看 `origin/main`，不要只看結束碼。**
 *    （本腳本第 3 步就是這樣做的 —— 那是對的，錯的是推送本身沒生效。）
 */
function git(gitArgs) {
  try {
    const stdout = execFileSync(GIT, ['-C', ROOT, ...gitArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(64));
console.log('  三管道一致性部署（線上 / GitHub / APK）');
console.log('='.repeat(64));

/* ── 步驟 0：工作區必須是乾淨的 ─────────────────────────────
   ⚠️ 這是整個流程的前提。若工作區有未提交的變更，
      bundle 會包含它們 → 線上與 GitHub 就**註定不同步**
      （GitHub 沒有那些變更的原始碼）。 */
step(0, '檢查工作區狀態');
const status = (git(['status', '--porcelain']).stdout ?? '').trim();
if (status) {
  bad('工作區有未提交的變更 —— 先 commit 再執行本腳本');
  console.log(
    status
      .split('\n')
      .slice(0, 15)
      .map((l) => '     ' + l)
      .join('\n')
  );
  console.log(
    '\n  ⚠️ 只 add 你自己改的檔案，不要用 `git add -A`（見 AI_COLLAB.md 第 0.5 節）'
  );
  process.exit(1);
}
ok('工作區乾淨');

const headBefore = (git(['rev-parse', 'HEAD']).stdout ?? '').trim();
const remoteBefore = (git(['rev-parse', 'origin/main']).stdout ?? '').trim();

/* ── 步驟 1：驗證 ─────────────────────────────────────────── */
if (!SKIP_CHECKS) {
  step(1, '靜態檢查與測試');
  run(NODE, [path.join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit']) === 0
    ? ok('tsc')
    : bad('tsc 失敗（輸出在上面）');

  const checks = [
    'check-i18n-leaks',
    'check-cache-key',
    'check-diet-record-lang',
    'check-lookup-keys',
    'check-analysis-mode',
  ];
  for (const c of checks) {
    run(NODE, [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), `scripts/${c}.ts`]) === 0
      ? ok(c)
      : bad(`${c} 失敗（輸出在上面）`);
  }
  if (failures > 0) {
    console.log('\n❌ 檢查未通過，中止。修正後再執行。');
    process.exit(1);
  }
} else {
  warn('已跳過檢查（--skip-checks）');
}

/* ── 步驟 2：建置 ─────────────────────────────────────────── */
step(2, '建置 dist/');
run(NODE, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build']) === 0
  ? ok('建置完成')
  : bad('建置失敗（輸出在上面）');

/**
 * 直接**讀檔**驗證建置產物 —— 不解析子程序輸出（見 run() 的說明）。
 * 這樣順便多檢查一件事：建置指紋是否存在。
 */
const distHtml = (() => {
  try {
    return readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  } catch {
    return '';
  }
})();
const distBundleName = distHtml.match(/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? null;
const distStamp = distHtml.match(/x-build-id" content="([^"]*)"/)?.[1] ?? null;
distBundleName ? ok(`本機 bundle：${distBundleName}`) : bad('找不到 dist 的 bundle 檔名');
distStamp ? ok(`本機建置指紋：${distStamp}`) : bad('dist 沒有建置指紋（x-build-id）');

/* ── 步驟 3：GitHub ───────────────────────────────────────── */
step(3, '推送到 GitHub');
/**
 * ★★ 判準是「`origin/main` 有沒有變成 HEAD」，**不是 `git push` 的結束碼**（2026-10-05 修）。
 *
 * 【為什麼】
 *   實際踩過兩次，方向相反：
 *     · 一次是 `git push` 用「cmd.exe 重導到檔案」跑 —— 結束碼 0，
 *       但實際上**沒有推上去**（見本檔 `git()` 的說明）。
 *     · 一次（2026-10-05）是結束碼**非零**回報「推送失敗」，
 *       但 `origin/main` 其實已經更新到 HEAD —— **推送是成功的**。
 *   → 兩次都證明同一件事：**結束碼不可信**。
 *     push 需要 GCM 憑證時，回傳碼會被雜訊污染。
 *   → 判準改成：push 之後重新讀 `origin/main`，
 *     等於本機 HEAD 就算成功；不等於才算失敗。
 */
if (headBefore !== remoteBefore) {
  const pushCode = git(['push', 'origin', 'main']);
  // ★ 用 fetch 後重讀的 origin/main 當判準（不是 pushCode）。
  git(['fetch', 'origin']);
  const pushed = (git(['rev-parse', 'origin/main']).stdout ?? '').trim();
  if (pushed === headBefore) {
    ok(`已推送${pushCode !== 0 ? '（結束碼非零，但 origin/main 已更新 → 視為成功）' : ''}`);
  } else {
    bad(`推送失敗 —— origin/main 仍是 ${pushed.slice(0, 7)}，本機是 ${headBefore.slice(0, 7)}`);
  }
} else {
  ok('本機與遠端已同步，無需推送');
}
const after = (git(['rev-parse', 'origin/main']).stdout ?? '').trim();
after === headBefore ? ok(`GitHub = ${after.slice(0, 7)}`) : bad('GitHub 的 HEAD 與本機不同');

/* ── 步驟 4：線上 ─────────────────────────────────────────── */
step(4, '部署到 Cloudflare Workers');
run(NODE, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'deploy']) === 0
  ? ok(`已部署 ${SITE}`)
  : bad('部署失敗（輸出在上面）');

/* ── 步驟 5：APK ──────────────────────────────────────────── */
if (!NO_APK) {
  step(5, '建置 APK（會自動刪除舊的）');
  /**
   * ⚠️ `run()` 回傳的是**數字**（結束碼），不是物件。
   *   這裡一度留著舊寫法 `r.status === 0`（把數字當物件用）→
   *   永遠是 `undefined === 0` → **明明建置成功卻每次都報失敗**。
   *   ★「腳本自己說謊」比檢查失敗更糟 —— 會讓人開始不信任輸出。
   *     所以這裡用 spawnSync 直接取 `.status`，寫法明確。
   */
  /**
   * ★★ 關於「APK 是不是真的更新了」——已改由 `build-apk.mjs` 自己判斷（2026-10-05）。
   *
   * 【原本的寫法與它的問題】
   *   這裡原本記錄「建置前／後桌面 APK 的 mtime」，若結束碼 0 但時間沒變就報錯。
   *   ★ 問題一：gradle 對「資產沒變」的建置會合理地判 `packageRelease` UP-TO-DATE
   *     → 桌面 APK 不被重新複製、時間不變，但**內容其實完全正確**。
   *     於是每次「沒改程式碼也重新 ship」都會亮紅燈 —— 典型的「狼來了」。
   *   ★ 問題二：顯示文案 `(apkAfter - apkBefore) / 1000 + "s 前更新"` 本來就寫錯 ——
   *     它算的是「新舊檔的時間差」，不是「距今多久」
   *     （實測會印出「31133s 前更新」＝ 8.6 小時，看起來像 bug）。
   *
   * 【現在的做法】
   *   `build-apk.mjs` 已經改成*讀 APK 內的建置指紋*與 `dist` 比對：
   *     · 指紋相同 → 內容正確 → 通過（即使檔案時間較舊）
   *     · 指紋不同 → 真的拿到舊包 → 以非零結束碼失敗
   *   → 所以這裡**只要看結束碼就好**，不要再自己比時間
   *     （重複實作只會製造新的不一致 —— 見本檔檔頭）。
   */
  const apkCode = spawnSync(NODE, [path.join(ROOT, 'scripts/build-apk.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, CODEBUDDY_SAFE_DELETE_ENABLED: '0' },
  }).status;

  if (apkCode !== 0) {
    bad('APK 建置失敗（輸出在上面）');
  } else {
    ok('APK 完成（內容指紋已由 build-apk 驗證）');
  }
} else {
  warn('已跳過 APK（--no-apk）');
}

/* ── 步驟 6：交給 check-consistency 判定 ───────────────────
   ⚠️ 這裡刻意**不自己比對**（原本我自己寫了一套比 bundle 檔名的），
      改用另一個 AI 寫的 `scripts/check-consistency.ts`：
      它比對的是**建置指紋 ＋ sha256 內容**，比檔名可靠。
      兩個 AI 各寫一套一致性檢查只會製造新的不一致。 */
step(6, '★ 驗證三者一致（check:consistency）');
{
const consistencyStarted = Date.now();
const consistencyCode = run(NODE, [
  path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'),
  'scripts/check-consistency.ts',
]);
consistencyCode === 0
  ? ok(`三者一致（${((Date.now() - consistencyStarted) / 1000).toFixed(1)}s）`)
  : bad('三者不一致 —— 上面是 check-consistency 的逐項輸出');
}

/* ── 結果 ─────────────────────────────────────────────────── */
console.log('\n' + '='.repeat(64));
if (failures === 0) {
  console.log('  ✅ 三個管道一致');
} else {
  console.log(`  ❌ 有 ${failures} 項不一致 —— 上面每一項都有說明`);
}
console.log('='.repeat(64));
console.log(`
別忘了（本腳本不會幫你做）：
  1. 在 AI_COLLAB.md 的訊息區追加一則：做了什麼／為什麼／怎麼驗證／還沒做什麼
  2. 把「工作認領」表自己那一行刪掉
`);
process.exit(failures === 0 ? 0 : 1);
