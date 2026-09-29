# -*- coding: utf-8 -*-
"""
死檔二次驗證：用「字串出現」而非「import 語句」來交叉比對。

可達性分析只看 import 圖；這裡改成「這個檔名/元件名有沒有在任何地方被提到」，
兩種方法都判定為死，才可以安全刪除。
"""
import os, io, re

DEAD = [
    'AnalysisStatus', 'CameraViewfinderModal', 'CaptureSection', 'FunctionSwitchBar',
    'Header', 'HealthSettings', 'PhysicalIndicatorSection', 'ResultDisplay',
    'SeniorHealthQASection', 'SettingsModal', 'UsageGuideModal',
]

SKIP_DIRS = {'node_modules', 'dist', '.git', 'docs', 'shots', 'shots-accordion',
             'shots-i18n', 'shots-lang', 'shots-menu', 'shots-ocr', 'shots-scan-en',
             'shots-verify', 'shots-cjk', 'incoming-new', '.workbuddy-ai', 'build'}

files = []
for dp, dn, fn in os.walk('.'):
    dn[:] = [d for d in dn if d not in SKIP_DIRS]
    for f in fn:
        if f.endswith(('.ts', '.tsx', '.mjs', '.js', '.json', '.html', '.toml', '.bat')):
            files.append(os.path.normpath(os.path.join(dp, f)))

print(f'掃描 {len(files)} 個檔案\n')

for name in DEAD:
    refs = []
    for f in files:
        # 跳過元件自己的檔案
        if os.path.basename(f).startswith(name):
            continue
        # 跳過其他死檔（互相引用不算「有人用」）
        if any(os.path.basename(f).startswith(d) for d in DEAD):
            continue
        try:
            s = io.open(f, encoding='utf-8').read()
        except Exception:
            continue
        for i, line in enumerate(s.split('\n'), 1):
            if re.search(r'\b' + re.escape(name) + r'\b', line):
                refs.append(f'{f}:{i}: {line.strip()[:95]}')

    if refs:
        print(f'⚠️  {name} 仍有 {len(refs)} 處外部提及：')
        for r in refs[:6]:
            print(f'      {r}')
    else:
        print(f'✅ {name}  — 完全無人提及，可安全刪除')
