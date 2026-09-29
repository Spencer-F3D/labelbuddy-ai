# -*- coding: utf-8 -*-
"""
死檔分析：從進入點走 import 圖，找出真正不可達的檔案。

⚠️ 為什麼不能只靠 grep：
   - 動態 import（`import('./x')`）、字串引用會騙過 grep
   - 被死檔 import 的檔案「看起來有人用」，其實是連帶死的
   只有走完整的可達性圖才能分辨。
"""
import os, re, io, json

SRC_EXT = ('.ts', '.tsx', '.mjs', '.js')
SKIP_DIRS = {'node_modules', 'dist', '.git', 'public', 'docs', 'shots',
             'shots-accordion', 'shots-i18n', 'shots-lang', 'shots-menu',
             'shots-ocr', 'shots-scan-en', 'shots-verify', 'shots-cjk',
             'incoming-new', '.workbuddy-ai', 'build'}


def read(p):
    try:
        return io.open(p, encoding='utf-8').read()
    except Exception:
        return ''


def resolve(base, spec):
    """把 import 路徑解析成實際檔案"""
    if not spec.startswith('.'):
        return None
    p = os.path.normpath(os.path.join(os.path.dirname(base), spec))
    for ext in ('', '.tsx', '.ts', '.mjs', '.js', '/index.tsx', '/index.ts', '/index.js'):
        if os.path.isfile(p + ext):
            return p + ext
    return None


def imports_of(path):
    s = read(path)
    out = set()
    # 靜態 import ... from '...'
    for m in re.finditer(r"""from\s+['"](\.[^'"]+)['"]""", s):
        out.add(m.group(1))
    # 動態 import('...')  /  require('...')
    for m in re.finditer(r"""(?:import|require)\s*\(\s*['"](\.[^'"]+)['"]\s*\)""", s):
        out.add(m.group(1))
    return out


def reachable(entries):
    seen, stack = set(), list(entries)
    while stack:
        f = stack.pop()
        f = os.path.normpath(f)
        if f in seen or not os.path.isfile(f):
            continue
        seen.add(f)
        for spec in imports_of(f):
            r = resolve(f, spec)
            if r and r not in seen:
                stack.append(r)
    return seen


def all_source_files():
    out = []
    for dp, dn, fn in os.walk('.'):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            if f.endswith(SRC_EXT):
                out.append(os.path.normpath(os.path.join(dp, f)))
    return sorted(out)


# ── 前端 ─────────────────────────────────────────────────────────
front_entries = ['src/main.tsx']
front_reach = reachable(front_entries)

# ── 後端（Express 與 Workers 兩個進入點）────────────────────────
back_entries = ['server.ts', 'worker.ts']
back_reach = reachable(back_entries)

allf = all_source_files()
front_only = [f for f in allf if f.startswith('src')]
back_only = [f for f in allf if f.startswith('server') or f in ('server.ts', 'worker.ts')]
script_only = [f for f in allf if f.startswith('scripts')]

print('=' * 74)
print('前端（從 src/main.tsx 走）')
print('=' * 74)
print(f'可達 {len([f for f in front_only if f in front_reach])} / {len(front_only)} 檔')
dead_front = [f for f in front_only if f not in front_reach]
for f in dead_front:
    print(f'  ⚠️  不可達  {f}')

print()
print('=' * 74)
print('後端（從 server.ts / worker.ts 走）')
print('=' * 74)
print(f'可達 {len([f for f in back_only if f in back_reach])} / {len(back_only)} 檔')
dead_back = [f for f in back_only if f not in back_reach]
for f in dead_back:
    print(f'  ⚠️  不可達  {f}')

# ── scripts/：由 package.json 的 scripts 決定是否還在用 ───────────
pkg = json.load(io.open('package.json', encoding='utf-8'))
script_cmds = ' '.join(pkg.get('scripts', {}).values())
print()
print('=' * 74)
print('scripts/（由 package.json 判斷）')
print('=' * 74)
for f in script_only:
    used = os.path.basename(f) in script_cmds
    print(f'  {"✅ 使用中" if used else "⚠️  未被任何 npm script 引用"}  {f}')

# ── 根目錄其他檔案 ───────────────────────────────────────────────
print()
print('=' * 74)
print('其他可疑項目')
print('=' * 74)
for extra in ['incoming-new', 'build-verification-report.html', 'metadata.json',
              'start-website.bat', '啟動網頁.bat']:
    exists = os.path.exists(extra)
    if not exists:
        continue
    if os.path.isdir(extra):
        n = sum(len(f) for _, _, f in os.walk(extra))
        print(f'  📁 {extra}/  （{n} 個檔案）')
    else:
        sz = os.path.getsize(extra)
        print(f'  📄 {extra}  （{sz} bytes）')

# ── 交叉引用檢查：誰 import 了某個檔 ─────────────────────────────
print()
print('=' * 74)
print('被死檔「連帶」的檔案（自身可達性取決於呼叫者）')
print('=' * 74)
for target in sorted(set(front_only) | set(back_only)):
    users = []
    for f in allf:
        if f == target:
            continue
        if any(resolve(f, s) == target for s in imports_of(f)):
            users.append(f)
    if not users:
        continue
    # 若所有使用者都不可達，這個檔也是連帶死的
    if all(u not in front_reach and u not in back_reach for u in users):
        print(f'  ⚠️  {target}')
        print(f'       只被 {users} 引用 → 全部不可達')
