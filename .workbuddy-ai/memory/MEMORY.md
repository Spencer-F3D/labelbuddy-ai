# LabelBuddy AI — 專案長期筆記

> 逐日細節在 `.workbuddy-ai/memory/YYYY-MM-DD.md`；本檔只留「跨日仍成立」的規則與事實。
> **最後整理：2026-09-29**（原檔 22.8KB 超過注入上限會被截斷，已精簡至約 14KB）

## 🏆 比賽（最高優先，任何改動前先想一遍）

| 項目 | 內容 |
| --- | --- |
| 賽事 | 2026 全球青少年人工智能未來創新競賽（澳門中學生賽區） |
| **截止** | **2026-10-09**（逾期不受理）｜複評 11-01~11-16｜決賽 11-26 澳門線下 |
| **語言** | **所有材料只接受英文**（App 內容、海報、影片字幕、簡報、答辯） |
| 主題 | AI 與教育｜建議組別 **AI for Education**；定位「AI 食育學習平台」，SDG 3/4/12 |
| 章程 | 專案根目錄 `2026全球青少年人工智能未來創新競賽...(1).pdf`（掃描版，無文字層，要渲染成圖才讀得到） |
| 使用者 | **本人就是參賽學生**（不是老師／家長）｜**決定不花錢**（只用免費模型） |
| **團隊** | **3 人一組**（09-28 確認）→ 報告必須按章程列明**每位學生各自完成的部分** |
| **分工** | **使用者本人負責 App 全部技術**；另 2 位隊友負責**文件與影片**（已談定） |

**評審比重**：問題與教育價值 20%｜創意與原創性 20%｜**AI 技術應用 25%**｜原型測試與成效 20%｜英文表達 10%｜倫理安全私隱 5%

**四條會致命的規則**
1. 「未使用英文」→ 可不予評審（App 雙語不可省）
2. 「不能只提交概念、簡報、普通資料庫，或僅以固定規則模擬 AI」→ **雲端真實 AI 必須是主角**
3. 報告須列明生成式 AI 工具名稱／版本／用途／學生完成部分 → 隱瞞**直接取消資格**
4. 「不得提交學生不能合理理解及操作的系統」→ 評審可即場提問程式細節

**四份交付物**（照章程命名）：`ProjectIntroduction_LabelBuddyAI.pdf`（≤2頁）／`ResearchReport_LabelBuddyAI.pdf`（6–12頁）／`Poster_LabelBuddyAI.pdf`（0.8×1.1m 直向）／`DemoVideo_LabelBuddyAI.mp4`（≤5分鐘）

### 📅 排程
| 日期 | 主線 |
| --- | --- |
| 09-29 ~ 09-30 | 雙語收尾 ✅ ＋ 首次啟動引導頁 ＋ 接回兩個功能 |
| **10-01 ~ 10-02** | **APK 打包**（Capacitor ＋ ML Kit；需裝 JDK／Android SDK 約 500MB，建議 `D:\android-dev\`）**硬期限不可延** |
| 10-03 ~ 10-05 | 四份英文文件 |
| 10-06 ~ 10-08 | Poster ＋ DemoVideo 錄製剪輯 |
| **10-09** | 提交 |

## 🚀 部署（2026-09-28 上線，09-29 起自動執行）

**正式網址：`https://app.labelbuddy-ai.workers.dev`**
- Worker 名稱 = `wrangler.toml` 的 `name`（現為 `app`）
- **唯一可靠來源是 `wrangler deploy` 輸出的最後一行**，不要用猜的
- 帳號 `kanhf28@gmail.com`｜Account ID `4ffa5d1a862bdbeaef2782f9b9774034`
- 憑證：`C:\Users\Spencer\AppData\Roaming\xdg.config\.wrangler\config\default.toml`
- Secret：`OPENROUTER_API_KEY`、`GEMINI_API_KEY`
- 版控：GitHub `Spencer-F3D/labelbuddy-ai`（Private）｜手機測試：`連線到手機.bat`（Cloudflare Tunnel，網址每次不同）
- OCR：**前端執行**（`src/ocr/ocrBrowser.ts`）；APK 走 Capacitor ＋ ML Kit

⚠️⚠️ **`git commit` 只是本機動作 —— 不會上 GitHub、更不會上線。**
任務完成後**自動**跑（不用問，見「使用者決策」）：
1. `git push origin main`（沙箱內 2–5 分鐘，用背景執行）
2. `npx vite build` → `dist/`
3. `node node_modules/wrangler/bin/wrangler.js deploy`（只上傳變動檔，約 15 秒）
4. **驗證**：線上首頁引用的 `assets/index-XXXX.js` 必須等於 `dist/assets/` 的檔名

**後端結構（平台無關）**：`labelParser.ts`（純解析）／`ocrLabel.ts`（Node 專屬 OCR）／
`core.ts`（共用邏輯，★不可 import Node 模組）／`handlers.ts`（8 個 handler）／
`server.ts`（Express 轉接層 119 行）／`worker.ts`（Workers 入口）
- `makeRes()` 相容層包住 Express handler，`res.json()` **回傳「結果物件」**（不是 res）→ `return res.json(...)` 原封不動可用
- 伺服器端 OCR 用依賴注入 `CoreDeps.recognizeImage`；Worker 不提供 → 回 `OCR_NOT_AVAILABLE`

**四個部署坑**
1. `run_worker_first = ["/api/*"]` 是關鍵 → 沒有它 SPA 模式會讓 `/api/*` 回 index.html，API 整組壞掉
2. **改 Worker 名稱 = 建新 Worker，Secret 不會跟著搬** → 必須重新 `wrangler secret put`
3. **不要用 `npx wrangler`** → 會觸發沙箱 safe-delete；用 `node node_modules/wrangler/bin/wrangler.js`
4. Tunnel 存取時 Vite 會擋前端（403）→ `allowedHosts: ['.trycloudflare.com']` 已加

★ **為何選 Cloudflare 而非 Vercel**：牆鐘時間無限制（AI 要 8–12 秒，Vercel 只給 10 秒）。
  ⚠️ 但 Workers 每請求僅 10ms CPU → **tesseract.js 不可能跑在後端**（OCR 必須在前端的根本原因）
## 🔒 隱私架構與 AI 模式（09-27 建立，09-30 起改為雲端優先）

```
拍照 ──> 前端 tesseract.js 讀出文字  ← 照片到此為止，從未離開裝置
      └─ 只送 ocrText 給後端 ─> 雲端 AI（主要）｜斷網時 → 本機規則引擎（後備）
```

**目標架構（2026-09-30 改動中）**：**雲端 AI 是主要路徑**，本機 OCR ＋ 規則引擎是
**斷網／雲端失敗時的後備**。首次啟動引導頁取得使用者同意後，`cloudConsent` 預設為 true。
- 理由：章程規則 2「僅以固定規則模擬 AI」可不予評審 → 雲端真實 AI 必須是主角
- `analysis_mode` 會回 `cloud` / `local_fallback`，**前端應顯示**讓使用者知道走哪條路

**兩個必記的設計決定**
1. **判斷「哪一種模式」看欄位是否存在，不是看內容是否為空。** 前端 OCR 失敗時送 `ocrText: ''`，那仍是文字模式 → 要回「請重拍」而不是 400（400 會讓使用者看到「系統壞了」）
2. **空文字要提早擋掉**，不查快取也不呼叫雲端（送空字串只會得到幻覺，還白費額度）

- 語言檔在 `public/tessdata/`（瀏覽器與 Node 共用一份）；WASM 由 `scripts/copy-ocr-assets.mjs` 複製（不進版控）
- `labelParser.ts` 的 `buildRecognitionResult()` 是「文字→結果」**唯一實作**，確保兩條路徑的誠實門檻一致

## ⛔ Gemini 區域封鎖（已定案，不必重查）
使用者在中國澳門；Gemini 官方支援區域**不含中國澳門／香港／大陸**。
三把不同金鑰、不同帳號皆回 `400 FAILED_PRECONDITION: User location is not supported`。
檢查順序是「身分 → 金鑰 → 區域」→ **換帳號無用**。
對照：無效金鑰回 `400 API_KEY_INVALID`；無金鑰回 `403 unregistered callers`。
唯一合規解法是後端部署到支援區域（已部署 Cloudflare，**尚未驗證 Gemini 是否復活**）。
用 VPN 或謊報地區繞過屬服務條款問題，**不做**。

## ⚠️ AI 供應商與模型鏈（會變動，失敗時先重查）
現役主力 **OpenRouter**；Gemini 程式碼保留，遇區域錯誤自動冷卻 6 小時。

`DEFAULT_MODEL_CHAIN`（降級陣列**上限 3 個**，`getModelChain()` 已 `.slice(0,3)`）

| 模型 | 實測 | 特性 |
| --- | --- | --- |
| `dots-studio/dots-3-note-preview:free` | 1.6~2.3 秒 | 品質最佳 |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 0.6 秒 | 最快 |
| `qwen/qwen3.8-27b:free` | 常 429 | 備援 |

- **免費模型會變動**（`inclusionai/ling-3.0-flash-vl:free` 已轉付費 404）→ 失敗時先查 `GET /api/v1/models` 過濾 `pricing.prompt == 0` 且 `input_modalities` 含 `image`
- OpenRouter 會快取相同請求 → 驗證延遲時務必在提示詞加唯一編號

## 💰 額度節省設計（四層）
1. **雙供應商輪替**：`orderedProviders()` 依「今日已用 ÷ 每日上限」比例排序
2. **健康冷卻**：一般失敗連續 2 次 → 10 分鐘；永久性錯誤 → 6 小時
3. **回應快取**（最有效）：`圖片SHA-256 + 慢性病 + 身分 + 模式 + 語言`，TTL 24h（實測 5065ms → 7ms）
4. **額度預檢**：`getOpenRouterQuota()` 查 `GET /api/v1/key`（快取 60s、不耗額度）

⚠️ 多開金鑰／帳號**無效**（官方：capacity 是全域治理，多開違反條款）。
未購買 50/日；累計購買 ≥10 點數 → 1000/日。
真實用量看 `GET /api/v1/key` 的 `free_model_daily_requests`
（`limit`/`limit_remaining` 是 per-key 信用上限，易混淆）。

## 🎓 6 身分（`LearnerProfileId`）
`senior` 長者三高｜`child` 兒童 6–12｜`teen` 青少年 13–18｜`fitness` 健身增肌｜`takeout` 年輕外食｜`student` 學生。
定義集中在 `src/data/learnerProfiles.ts`，**前後端共用** → 必須保持**純資料**（不得引入瀏覽器／Node API）。
- `numericLimits: Record<名稱, {value, unit}>` 供百分比換算；`targets[].target` 是給人看的字串，**不能做數學運算**
- ⚠️ 兒童／青少年鈉糖上限明顯低於成人（鈉 1200/1600 vs 2000）
- ⚠️ **快取鍵必須含身分**（同一包高蛋白粉對健身族綠燈、對腎臟病患紅燈）
- 實測證明有效：同圖同病，健身→green、長者→yellow

## 📊 nutrient_facts 管線
**鐵則：模型只讀出「含量」，百分比一律由後端重算**（小模型算 `2480÷2000×100` 會錯，且錯得無聲無息）。
- `core.ts` 的 `normalizeNutrientFacts(raw, numericLimits)` 用每日上限**覆蓋**模型算的 percent，補 `dailyLimit`/`direction`，過濾（最多 3 項、**門檻 30%**、依嚴重度排序）
- **三條路徑都要套用**：雲端成功、**快取命中**、本機備援（漏掉快取會回傳舊格式）
- ⚠️ **limit 與 target 方向相反**（鈉 120% 是壞事、蛋白質 120% 是好事）→ `NutrientFactBars.tsx` 的 `factTone()` 分開處理

## 🔤 簡繁後處理
`core.ts` 的 `SIMPLIFIED_TO_TRADITIONAL` 只收「簡繁一對一無歧義」的字
（后/後、干/乾、里/裡、面/麵、只/隻、发/發/髮 **一律不列**），現約 438 字。
**日後又看到簡體字，先查是不是新字不在表內，別急著換模型。**

## 🌐 雙語架構（i18n）

| 檔案 | 角色 |
| --- | --- |
| `src/i18n/translations.ts` | 扁平鍵字典（zh-TW ＋ en）＋ `LANGUAGE_OPTIONS` |
| `src/i18n/I18nContext.tsx` | Context ＋ `useI18n()`｜同步 `<html lang>` 與 `document.title` |
| `src/data/bilingual.ts` | **後端提示詞用**對照（營養素／單位／身分／病名，純資料） |
| `src/data/bilingualContent.ts` | **畫面用**對照（短標籤、對象說明、紀錄） |
| `src/data/educationContentEn.ts` | 食育學堂教材英文版 |
| `server/localEngineEn.ts` | 本機引擎輸出對照 ＋ `translateLocalText()` |

- **型別強制同步**：`TranslationKey = keyof typeof zhTW`，`en` 少一鍵就編譯失敗
- **`I18nProvider` 必須包在 App 外面（`main.tsx`）**
- 預設 zh-TW｜存 localStorage `labelbuddy-language`｜語言選項顯示**母語名稱**（刻意）
- ⚠️ **快取鍵必須加語言** —— 中英共用快取會拿到另一種語言的舊結果**且不報錯**
- ⚠️ 本機引擎是後備路徑，但英文介面仍要真的可用 → **必須雙語**
- 本機引擎採「對照表 ＋ 事後轉換」，**比對關鍵字一行都不動**（翻了會讓比對失效）

### ⚠️ 五個反直覺的坑（實測）
1. **`localEngineEn.ts` 的對照表鍵必須是「完整句子」**，不是營養素名。
   寫成 `鈉:` 永遠查不到，**且不報錯**。
2. **`labelParser.ts` 的英文鍵不能有空白** —— `normalizeLine()` 會移除整行空白，
   「Saturated Fat」比對時其實是「SaturatedFat」。09-29 前只有中文鍵 → 英文標籤讀 **0/6** 欄位。
3. **`condition_reminders` 不經過 AI**，是後端規則產生 → 兩條路徑都要帶語言。
4. **模組層函式只回傳「翻譯鍵」**，由呼叫端 `t()` 解析（模組層常數不隨語言重算）。
5. **`.map((t) => ...)` 會遮蔽翻譯函式** → 參數要改名（如 `topic`）。
   ＋ `useMemo` 依賴要含 `t` 與 `language`，否則切語言不會重算（**不報錯**）。

### 🧪 驗證機制（**改動翻譯後必跑**）
`npm run check:i18n`（引擎輸出掃 CJK）｜`npm run check:ui`（真實 Chrome 走 9 畫面）
｜`npm run verify:all`（全部）

★★ **靜態掃描（grep）只能找線索，不能當驗收。** 分不出條件分支（**假警報**）、
  抓不到執行時組出的字串（**漏報**）。最終一定要用瀏覽器實際渲染。
★ `check-i18n-leaks.ts` 內建**假通過防護**：`checks === 0` 時 `exit 2`。
★ 兩支腳本都有**有理由的例外清單**，不是無條件忽略。

### 📌 已知限制（刻意接受）
- **`ingredients_detected`** 是包裝原文（OCR 讀出），真實澳門商品本來就是中文。
  目前**沒有任何元件會顯示它** → 若日後新增顯示它的畫面，必須先處理翻譯。
- `<meta name="description">` / `og:title` 為靜態中文，**不顯示在頁面上**（社群預覽用）。

## ✅ 死檔已清理（2026-09-29）

11 個孤兒元件（約 4,300 行）＋ `incoming-new/` ＋ `metadata.json` ＋
`build-verification-report.html` ＋ `start-website.bat` 皆已刪除。
`src/components/` 只剩 6 個現役檔案，**做機械檢查時沒有例外了**。
可從 git 歷史還原（`0ea86bd` 之前）。

★ **要再檢查時跑這兩支（兩道都要跑）**：
- `scripts/analyze-dead-code.py` — 從進入點走 import 圖。**只有它能分辨「被死檔連帶」**。
- `scripts/verify-dead-code.py` — 字串交叉驗證，抓動態 import 與字串引用。
- ⚠️ 只做可達性分析會漏掉 `import('./x')`；只做 grep 會把連帶死檔當成活的。
★ **bundle 大小不變是正常的** —— 死檔本來就被 tree-shaking 排除，價值在**可維護性**。

### ⏳ 待接回的後端端點（09-29 確認保留）
`/api/analyze-indicators`、`/api/ask-health-question` 目前無 UI 呼叫
（唯一呼叫者已刪）。**使用者決定接回**（09-29 指示）。
連帶模組：`server/smartIndicatorAnalyzer.ts`(239)、`server/smartHealthQA.ts`(186)。
⚠️ 原元件 `PhysicalIndicatorSection`(937 行/1088 中文字)、`SeniorHealthQASection`(549 行/713 中文字)
**完全沒有 i18n** → 接回時必須一併英文化。

## 🎨 UI 與版面規則 → **見 `UI_RULES.md`**（同目錄）

改 UI 前**必讀**，內容包含：
- `theme.ts` 設計權杖與三重編碼鐵則（`RISK_TONE`/`RISK_ICON`/`RISK_LABEL` 必須一起用）
- **字級鐵則：全域只能 16/18/19/20px，16 是地板**（`text-xs`=15px、`text-sm`=17.5px 是陷阱）
- 折行品質的三類判定 ＋ `check-wrapping-quality.mjs`（**不要用 `check-responsive-layout.mjs`**，會 255 筆假警報）
- 16:9 手機框（360×640）與 `min-[520px]:` 斷點的 4 處連帶必改
- `:root{font-size:20px}` 讓 Tailwind rem 間距放大 1.25 倍
- `SettingsSection` 收合時**必須顯示目前狀態**、側邊選單用 transform 位移而非條件渲染

## 已知環境陷阱
- `esbuild` 必須 ≥ `^0.28.0`（vite 8.3.0 peer），否則 `npm install` ERESOLVE
- `npm start` 需 `NODE_ENV=production`；環境變數檔名必須是 `.env`（不讀 `.env.local`）
- 沙箱內第二次 `npm run build` 會被 safe-delete 擋下 → 用 `npx vite build --outDir .verify-dist`
- `npx` 會觸發 safe-delete，一律用本機執行檔（如 `node node_modules/...`）
- 沙箱內 `git push` 很慢（2–5 分鐘），用背景執行
- 臨時檔一律用 `.tmp-` 開頭（已 gitignore）—— 曾誤把 commit message 草稿提交進去
- **開發伺服器會被沙箱在回合邊界回收**，瀏覽器測試前先確認它還活著
- 桌面文件用 Typst：`D:\Typst\...\typst.exe`（0.15.1）。
  ⚠️ `#show raw` 行內程式碼含中文會**靜默 fallback 到隸書** → 字型堆疊最後要放中文字型。
  刪檔用 `ctypes` + `SHFileOperationW`（`send2trash` 有路徑 bug）。詳見 09-27/09-28 日誌

## 使用者決策與節奏

1. **🚀 每次任務完成後自動部署上線（2026-09-29）**
   原話：「在每一次完成我給你的任務時你也要自動為我上傳線上」
   → **不用問、不用等確認**。標準三步見上方「部署」章節。
   ⚠️ 但**破壞性操作仍要先問**（刪檔、改架構、動他的資料）。
2. **🧹 死檔要刪除或合併（2026-09-29）**
   原話：「把死的檔案…刪除或合併入其他檔案中，要盡量簡化檔案而不影響功能。重點：不能影響任何功能」
   → 刪前必須用可達性分析 ＋ 字串搜尋雙重證明；刪後 `tsc` ＋ build ＋ 檢查腳本全過。
3. **本機備援引擎的角色改變（2026-09-30）**：改為**斷網後備**，雲端 AI 是主要路徑。
4. **一律先給計劃、確認後才動檔案**（但第 1、2 點已預先授權）。
5. 使用者說「**Google**」常指 **Chrome 瀏覽器**，不是 Google 服務 → 模糊指涉先問來源。
6. 每次回覆結束前**明確告訴他下一步要做什麼**。
7. **完成任務播單響、需要確認播雙響**（`C:\Users\Spencer\.workbuddy-ai\notify\notify.py done|ask`）。

## 📄 關鍵文件位置

| 文件 | 位置 |
| --- | --- |
| 章程 PDF | 專案根目錄（掃描版，要渲染成圖才讀得到） |
| UI 規則 | `.workbuddy-ai/memory/UI_RULES.md` |
| 逐日工作日誌 | `.workbuddy-ai/memory/YYYY-MM-DD.md` |
| 專案交接文件 | `docs/專案交接文件.md`（.md ＋ .pdf） |
| 快照差異報告 | `docs/incoming-new-差異報告.md`（已結案） |
