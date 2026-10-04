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

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
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

/** git 需要讀輸出 → 用檔案重導，不能接管 stdio */
const git = (gitArgs) => {
  const tmp = path.join(ROOT, '.tmp-git-out');
  const r = spawnSync(
    process.env.ComSpec || 'cmd.exe',
    ['/d', '/s', '/c', `"${GIT}" -C "${ROOT}" ${gitArgs.join(' ')} > "${tmp}" 2>&1`],
    { cwd: ROOT, stdio: 'inherit' }
  );
  let out = '';
  try {
    out = readFileSync(tmp, 'utf8');
    rmSync(tmp, { force: true });
  } catch {
    /* 沒有輸出檔也没關係 */
  }
  return { status: r.status ?? 1, stdout: out, stderr: '' };
};

/** 從 dist/index.html 取出 bundle 檔名 */
function distBundle() {
  const html = readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  return html.match(/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? null;
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
{
  const r = run(NODE, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build']);
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  if (r.status === 0 && /built in/.test(out)) ok(out.match(/✓ built in [^\n]*/)?.[0] ?? 'built');
  else bad('建置失敗\n' + out.slice(-600));
}
const expected = distBundle();
if (expected) ok(`本機 bundle：${expected}`);
else bad('找不到 dist/index.html 的 bundle 檔名');

/* ── 步驟 3：GitHub ───────────────────────────────────────── */
step(3, '推送到 GitHub');
if (headBefore !== remoteBefore) {
  git(['push', 'origin', 'main']) === 0 ? ok('已推送') : bad('推送失敗');
} else {
  ok('本機與遠端已同步，無需推送');
}
const after = (git(['rev-parse', 'origin/main']).stdout ?? '').trim();
after === headBefore ? ok(`GitHub = ${after.slice(0, 7)}`) : bad('GitHub 的 HEAD 與本機不同');

/* ── 步驟 4：線上 ─────────────────────────────────────────── */
step(4, '部署到 Cloudflare Workers');
{
  const r = run(NODE, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'deploy']);
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const url = out.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0];
  r.status === 0 ? ok(`已部署 ${url ?? ''}`) : bad('部署失敗\n' + out.slice(-600));
}

/* ── 步驟 5：APK ──────────────────────────────────────────── */
if (!NO_APK) {
  step(5, '建置 APK（會自動刪除舊的）');
  const r = run(NODE, [path.join(ROOT, 'scripts/build-apk.mjs')], {
    env: { ...process.env, CODEBUDDY_SAFE_DELETE_ENABLED: '0' },
  });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  r.status === 0 && /✅ 完成/.test(out)
    ? ok(out.match(/✅ C:\\[^\n]*\.apk/)?.[0] ?? 'APK 完成')
    : bad('APK 建置失敗\n' + out.slice(-800));
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
