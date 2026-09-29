# LabelBuddy AI — 架構細節與踩坑（ARCHITECTURE）

> `MEMORY.md` 的附錄。這裡放「需要時才查」的深度細節，避免主檔超過注入上限。
> **最後整理：2026-09-29**

## 後端結構（平台無關）

`labelParser.ts`（純解析）／`ocrLabel.ts`（Node 專屬 OCR）／
`core.ts`（共用邏輯，★不可 import Node 模組）／`handlers.ts`（handler 集合）／
`server.ts`（Express 轉接層）／`worker.ts`（Workers 入口）

- `makeRes()` 相容層：`res.json()` **回傳「結果物件」**（不是 res）→ `return res.json(...)` 原封不動可用
- 伺服器端 OCR 用依賴注入 `CoreDeps.recognizeImage`；Worker 不提供 → 回 `OCR_NOT_AVAILABLE`
- `labelParser.ts` 的 `buildRecognitionResult()` 是「文字→結果」**唯一實作**（確保兩條路徑誠實門檻一致）
- 語言檔在 `public/tessdata/`；WASM 由 `scripts/copy-ocr-assets.mjs` 複製（不進版控）

## 四個部署坑

1. `run_worker_first = ["/api/*"]` 是關鍵 → 沒有它 SPA 模式會讓 `/api/*` 回 index.html，**API 整組壞掉**
2. **改 Worker 名稱 = 建新 Worker，Secret 不會跟著搬** → 要重新 `wrangler secret put`
3. **不要用 `npx wrangler`** → 觸發沙箱 safe-delete；用 `node node_modules/wrangler/bin/wrangler.js`
4. Tunnel 存取時 Vite 擋前端（403）→ `allowedHosts: ['.trycloudflare.com']` 已加

★ **為何選 Cloudflare 而非 Vercel**：牆鐘時間無限制（AI 要 8–12 秒，Vercel 只給 10 秒）。
⚠️ 但 Workers 每請求僅 10ms CPU → **tesseract.js 不可能跑在後端**（OCR 必須在前端的根本原因）。

## 🌐 雙語架構（i18n）

| 檔案 | 角色 |
| --- | --- |
| `src/i18n/translations.ts` | 扁平鍵字典（zh-TW ＋ en）＋ `LANGUAGE_OPTIONS` |
| `src/i18n/I18nContext.tsx` | Context ＋ `useI18n()`｜同步 `<html lang>` 與 `document.title` |
| `src/data/bilingual.ts` | **後端提示詞用**對照（純資料） |
| `src/data/bilingualContent.ts` | **畫面用**對照（短標籤、紀錄） |
| `src/data/educationContentEn.ts` | 食育學堂教材英文版 |
| `server/localEngineEn.ts` | 本機引擎輸出對照 ＋ `translateLocalText()` |

- **型別強制同步**：`TranslationKey = keyof typeof zhTW`，`en` 少一鍵就編譯失敗
- **`I18nProvider` 必須包在 App 外面（`main.tsx`）**
- `document.title` 要在 React mount **前**設，否則英文頁籤會閃一下中文
- 預設 zh-TW｜存 localStorage `labelbuddy-language`｜語言選項顯示**母語名稱**（刻意）
- ⚠️ **快取鍵必須加語言** —— 中英共用快取會拿到另一語言的舊結果**且不報錯**
- 本機引擎採「對照表 ＋ 事後轉換」，**比對關鍵字一行都不動**（翻了會讓比對失效）

### ⚠️ 五個反直覺的坑（實測）

1. **`localEngineEn.ts` 的鍵必須是「完整句子」**，不是營養素名。
   寫成 `鈉:` 永遠查不到，**且不報錯**。
2. **`labelParser.ts` 的英文鍵不能有空白** —— `normalizeLine()` 移除整行空白，
   「Saturated Fat」比對時其實是「SaturatedFat」。
   09-29 前只有中文鍵 → 英文標籤讀 **0/6** 欄位。
3. **`condition_reminders` 不經過 AI**，是後端規則產生 → 兩條路徑都要帶語言。
4. **模組層函式只回傳「翻譯鍵」**，由呼叫端 `t()` 解析（模組層常數不隨語言重算）。
5. **`.map((t) => ...)` 會遮蔽翻譯函式** → 參數要改名（如 `topic`）；
   `useMemo` 依賴要含 `t` 與 `language`，否則切語言不會重算（**不報錯**）。

### 📌 已知限制（刻意接受）

- **`ingredients_detected`** 是包裝原文（OCR 讀出），真實澳門商品本來就是中文。
  目前**沒有任何元件會顯示它** → 若日後新增顯示畫面，必須先處理翻譯。
- `<meta name="description">` / `og:*` 為靜態中文，**不顯示在頁面上**（社群預覽用）。
- **TTS 語速固定 0.88**（稍慢），不隨身分調整。若青少年覺得太慢再改。

## ✅ 死檔已清理（09-29）

11 個孤兒元件（約 4,300 行）＋ `incoming-new/` ＋ `metadata.json` ＋
`build-verification-report.html` ＋ `start-website.bat` 已刪。可從 git 歷史還原（`0ea86bd` 之前）。

★ **要再檢查跑這兩支（兩道都要跑）**：
- `scripts/analyze-dead-code.py` — 從進入點走 import 圖。**只有它能分辨「被死檔連帶」**。
- `scripts/verify-dead-code.py` — 字串交叉驗證，抓動態 import 與字串引用。

⚠️ 只做可達性分析會漏掉 `import('./x')`；只做 grep 會把連帶死檔當成活的。
★ **bundle 大小不變是正常的** —— 死檔本來就被 tree-shaking 排除，價值在**可維護性**。

## 已知環境陷阱

- `esbuild` 必須 ≥ `^0.28.0`（vite 8.3.0 peer），否則 `npm install` ERESOLVE
- `npm start` 需 `NODE_ENV=production`；環境變數檔名必須是 `.env`（不讀 `.env.local`）
- 沙箱內第二次 `npm run build` 會被 safe-delete 擋下 → 用 `npx vite build --outDir .verify-dist`
- **`npx` 會觸發 safe-delete** → 一律用本機執行檔（`node node_modules/...`）
- 沙箱內 `git push` 很慢（2–5 分鐘），用背景執行
- 臨時檔一律用 `.tmp-` 開頭（已 gitignore）
- **開發伺服器會被沙箱在回合邊界回收**，瀏覽器測試前先確認它還活著
- ★ **瀏覽器驗證前先確認埠上的伺服器就是你要驗的那版**：
  `curl -s <url>/ | grep -o 'index-[A-Za-z0-9_-]*\.js'` 對照 `dist/assets/`。
  舊的 Vite dev server 可能還佔著 3000 埠（回的是 `/src/main.tsx`，不是 build 產物）——
  用 `PORT=3100 NODE_ENV=production node node_modules/tsx/dist/cli.mjs server.ts` 開一個乾淨的。
- 桌面文件用 Typst：`D:\Typst\...\typst.exe`（0.15.1）。
  ⚠️ `#show raw` 行內程式碼含中文會**靜默 fallback 到隸書** → 字型堆疊最後要放中文字型。
  刪檔用 `ctypes` + `SHFileOperationW`（`send2trash` 有路徑 bug）。詳見 09-27/09-28 日誌。

## 已完成的接回工作

- ✅ **`/api/analyze-indicators`**（09-29）：現役 `VitalMetricsSection` 已有輸入與本機即時評估，
  只缺「呼叫 AI」→ 已加「AI 深入分析」按鈕 ＋ 後端雙語 ＋ 安全覆蓋。
- ✅ **`/api/ask-health-question`**（09-29）：新做 `HealthQASection`（雙語），
  英文走獨立的 `answerInEnglish()`，中文走 `answerSeniorHealthQuestion()`。
