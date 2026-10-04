#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Typst 語法自查工具（本專案專用）

用途：在編譯前先掃出「不會讓編譯失敗、但會讓文件壞掉」的 Typst 陷阱。
這些陷阱的共同特徵是「編譯會過，只有目視才看得出來」——
本專案已踩過多次（Markdown 粗體、Markdown 表格、標題裡的標記符號）。

用法：
  python scripts/typst-lint.py <file.typ>          # 只檢查，不改檔案
  python scripts/typst-lint.py --fix <file.typ>    # 就地修正可自動修的項目

檢查項目：
  1. `**粗體**`      → Typst 只認單星號 `*粗體*`；留著會原樣顯示星號
  2. `| a | b |`     → Markdown 表格；Typst 會當純文字印出（不報錯）
  3. 標題內的 `★` 等   → 從純文字筆記搬過來時常見的殘留標記
  4. 行內程式碼含中文  → 若字型堆疊沒有中文字型，會靜默 fallback 到隸書
"""
import io
import re
import sys


BOLD = re.compile(r"\*\*([^*\n]+?)\*\*")
# Markdown 表格：以 | 開頭、以 | 結尾，且中間至少有一個分隔的 |
MD_ROW = re.compile(r"^\s*\|.*\|\s*$")
MD_SEP = re.compile(r"^\s*\|[\s:|-]+\|\s*$")
HEAD_MARK = re.compile(r"^(=+ .*|\s*#let\s+h[123]\b.*?)\[(.*?[★☆✅⚠️🔴🟡🟢❌].*?)\]", re.M)


def lint(path, fix=False):
    src = io.open(path, encoding="utf-8").read()
    original = src
    issues = []

    # 1. Markdown 粗體
    hits = list(BOLD.finditer(src))
    if hits:
        issues.append(("MD_BOLD", len(hits), "Markdown **粗體**（Typst 只認單星號）"))
        if fix:
            src = BOLD.sub(r"*\1*", src)

    # 2. Markdown 表格
    lines = src.split("\n")
    tbl = 0
    i = 0
    while i < len(lines):
        if MD_ROW.match(lines[i]) and i + 1 < len(lines) and MD_SEP.match(lines[i + 1]):
            tbl += 1
            i += 2
            while i < len(lines) and MD_ROW.match(lines[i]):
                i += 1
        else:
            i += 1
    if tbl:
        issues.append(("MD_TABLE", tbl, "Markdown 表格（Typst 會靜默印成純文字）"))
        # 表格無法自動修（要重建為 #table），只警告

    # 3. 標題內的殘留標記
    mh = HEAD_MARK.findall(src)
    if mh:
        issues.append(("HEAD_MARK", len(mh), "標題內含 ★ ✅ 等標記（從筆記搬來時的殘留）"))
        if fix:
            for _, body in mh:
                src = src.replace(body, re.sub(r"[★☆✅❌]", "", body))

    # 4. 行內 raw 含中文
    raw_cjk = re.findall(r"`[^`\n]*[\u4e00-\u9fff][^`\n]*`", src)
    if raw_cjk:
        issues.append(("RAW_CJK", len(raw_cjk), "行內程式碼含中文（需確認字型堆疊有中文字型）"))

    if fix and src != original:
        io.open(path, "w", encoding="utf-8", newline="\n").write(src)

    return issues


def main():
    args = sys.argv[1:]
    fix = "--fix" in args
    files = [a for a in args if not a.startswith("--")]
    if not files:
        print("用法: python scripts/typst-lint.py [--fix] <file.typ>")
        return 2

    total = 0
    for f in files:
        issues = lint(f, fix=fix)
        print(f"\n=== {f} ===")
        if not issues:
            print("  [OK] 沒有發現已知陷阱")
        for code, n, desc in issues:
            mark = "FIXED" if (fix and code in ("MD_BOLD", "HEAD_MARK")) else "WARN "
            print(f"  [{mark}] {n:>3} x {desc}")
            total += n
    print(f"\n合計 {total} 項" + ("（已就地修正可自動修的部分）" if fix else "（未修改，加 --fix 可自動修）"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
