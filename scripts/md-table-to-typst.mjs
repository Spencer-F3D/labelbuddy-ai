/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * Markdown 表格 → Typst #table() 轉換器
 * ============================================================================
 *
 * 【為什麼要有這支】
 *   寫 Typst 文件時很容易「手滑」用 Markdown 的表格語法：
 *
 *     | 項目 | 內容 |
 *     | --- | --- |
 *     | 賽事 | ... |
 *
 *   Typst **不認這種語法** —— 它不會報錯，而是把整段當成*純文字*印出來，
 *   畫面上一堆直線和減號，看起來像壞掉的文件。
 *
 *   ★ 這跟 `**粗體**` 是同一種錯誤（Typst 只認單一個 `*`）：
 *     兩種都不會報錯，只是安靜地顯示成錯的東西。
 *     本專案的記憶檔早就記過這件事，我還是踩了 ——
 *     所以直接寫成工具，下次不用靠記憶。
 *
 * 用法：node scripts/md-table-to-typst.mjs <檔案.typ>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('用法：node scripts/md-table-to-typst.mjs <檔案.typ>');
  process.exit(1);
}

const src = readFileSync(file, 'utf8');
const lines = src.split('\n');
const out = [];
let converted = 0;

/** 把一行 `| a | b |` 切成 ['a', 'b'] */
function cells(line) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** 這一列是不是 Markdown 的分隔列（| --- | :---: |） */
function isSeparator(line) {
  const cs = cells(line);
  return cs.length > 0 && cs.every((c) => /^:?-{2,}:?$/.test(c));
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // 不是表格的開頭就原樣輸出
  if (!line.startsWith('|')) {
    out.push(line);
    continue;
  }

  // 收集整張表
  const block = [];
  while (i < lines.length && lines[i].startsWith('|')) {
    block.push(lines[i]);
    i++;
  }
  i--; // 迴圈會再 +1

  // 至少要「表頭 + 分隔列 + 一列內容」才算是表格
  if (block.length < 3 || !isSeparator(block[1])) {
    // 不是表格（可能只是剛好以 | 開頭的文字）→ 原樣輸出
    out.push(...block);
    continue;
  }

  const header = cells(block[0]);
  const body = block.slice(2).map(cells);
  const cols = header.length;

  /**
   * 欄寬：依「該欄最長內容」按比例分配。
   *
   * ⚠️ 不用等寬 —— 中文文件裡常見「一個短標籤 ＋ 一大段說明」，
   *    等寬會讓短欄留一堆空白、長欄擠成一團。
   */
  const maxLen = header.map((h, ci) => {
    const inBody = body.map((r) => (r[ci] ?? '').length);
    return Math.max(h.length, ...inBody, 2);
  });
  // 上限 3.2fr：避免某一欄獨佔整個寬度
  const weights = maxLen.map((n) => Math.min(3.2, Math.max(0.55, n / 8)));
  const colSpec = weights.map((w) => `${w.toFixed(2)}fr`).join(', ');

  const esc = (s) => s.replace(/^#/, '\\#');
  const row = (r) => header.map((_, ci) => `[${esc(r[ci] ?? '')}]`).join(', ');

  out.push('#table(');
  out.push(`  columns: (${colSpec}),`);
  out.push(`  align: (${header.map(() => 'left').join(', ')}),`);
  out.push('  stroke: 0.4pt + luma(200),');
  out.push(`  table.header(${row(header)}),`);
  for (const r of body) out.push(`  ${row(r)},`);
  out.push(')');
  converted++;
}

writeFileSync(file, out.join('\n'), 'utf8');
console.log(`✅ 已轉換 ${converted} 張 Markdown 表格 → Typst #table()`);
if (converted === 0) {
  console.log('   （沒有找到 Markdown 表格 —— 若文件裡有表格，請確認每列都以 | 開頭）');
}

/* ── 第二遍：清掉標題裡的 ★ 標記 ──────────────────────────────
 *
 * 【為什麼】
 *   `★` 是我在「純文字記憶檔」裡標重點用的符號（那些檔案沒有排版功能）。
 *   但寫進 Typst 的*標題*時，`★★ 檢查腳本的假通過` 讀起來就像沒清掉的 Markdown。
 *   內文用 `★` 當項目符號是好的（那是有意的視覺標記），
 *   但標題本身已經是粗體大字，不需要再加星號。
 */
let headings = 0;
const cleaned = readFileSync(file, 'utf8')
  .split('\n')
  .map((l) => {
    if (!/^=+ /.test(l) || !l.includes('★')) return l;
    headings++;
    // 移除所有 ★（含連續的），並把可能留下的多餘空白收乾淨
    return l.replace(/★/g, '').replace(/\s{2,}/g, ' ').replace(/\s+$/, '');
  })
  .join('\n');
writeFileSync(file, cleaned, 'utf8');
console.log(`✅ 已清理 ${headings} 個標題裡的 ★ 標記`);
