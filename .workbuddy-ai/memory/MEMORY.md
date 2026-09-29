# LabelBuddy AI — 專案長期筆記

> 逐日細節在 `.workbuddy-ai/memory/YYYY-MM-DD.md`；本檔只留「跨日仍成立」的規則與事實。
> 最後整理：2026-09-28（原檔過大被注入截斷，已精簡）

## 🏆 比賽（最高優先，任何改動前先想一遍）

| 項目 | 內容 |
| --- | --- |
| 賽事 | 2026 全球青少年人工智能未來創新競賽（澳門中學生賽區） |
| **截止** | **2026-10-09**（逾期不受理）｜複評 11-01~11-16｜決賽 11-26 澳門線下 |
| **語言** | **所有材料只接受英文**（App 內容、海報、影片字幕、簡報、答辯） |
| 主題 | AI 與教育｜建議組別 **AI for Education**；定位「AI 食育學習平台」，SDG 3/4/12 |
| 章程 | 專案根目錄 `2026全球青少年人工智能未來創新競賽...(1).pdf`（掃描版，無文字層，要渲染成圖才讀得到） |
| 使用者 | **本人就是參賽學生**（不是老師／家長）｜**決定不花錢**（只用免費模型） |
| **團隊** | **3 人一組**（2026-09-28 確認）→ 報告必須按章程列明**每位學生各自完成的部分** |
| **分工** | **使用者本人負責 App 全部技術**；另 2 位隊友負責**文件與影片**（已談定） |

**評審比重**：問題與教育價值 20%｜創意與原創性 20%｜**AI 技術應用 25%**｜原型測試與成效 20%｜英文表達 10%｜倫理安全私隱 5%

**四條會致命的規則**
1. 「未使用英文」→ 可不予評審（App 雙語不可省）
2. 「不能只提交概念、簡報、普通資料庫，或僅以固定規則模擬 AI」→ 雲端真實 AI 必須是主角
3. 報告須列明生成式 AI 工具名稱／版本／用途／學生完成部分 → 隱瞞**直接取消資格**
4. 「不得提交學生不能合理理解及操作的系統」→ 評審可即場提問程式細節

**四份交付物**（照章程命名）：`ProjectIntroduction_LabelBuddyAI.pdf`（≤2頁）／`ResearchReport_LabelBuddyAI.pdf`（6–12頁）／`Poster_LabelBuddyAI.pdf`（0.8×1.1m 直向）／`DemoVideo_LabelBuddyAI.mp4`（≤5分鐘）

## 🚀 部署架構（2026-09-28 已上線）

**正式網址：`https://app.labelbuddy-ai.workers.dev`**
- 格式 = `<Worker名稱>.<子網域>.workers.dev`；Worker 名稱 = `wrangler.toml` 的 `name`（現為 `app`）
- **唯一可靠來源是 `wrangler deploy` 輸出的最後一行**，不要用猜的
- 帳號 `kanhf28@gmail.com`｜Account ID `4ffa5d1a862bdbeaef2782f9b9774034`
- 憑證：`C:\Users\Spencer\AppData\Roaming\xdg.config\.wrangler\config\default.toml`
- Secret：`OPENROUTER_API_KEY`、`GEMINI_API_KEY`
- 版控：GitHub `Spencer-F3D/labelbuddy-ai`（Private）｜手機測試：Cloudflare Tunnel（`連線到手機.bat`，網址每次不同）
- OCR：**前端執行**（`src/ocr/ocrBrowser.ts`）；APK 走 Capacitor ＋ ML Kit

⚠️⚠️ **`git commit` 只是本機動作 —— 不會上 GitHub、更不會上線。**
每個段落做完要主動做這三步，順序不能顛倒：
1. `git push origin main`（沙箱內很慢，2–5 分鐘，用背景執行）
2. `vite build` 到 `dist/`（`dist` 只有 12 檔，不會撞沙箱的 50 檔刪除門檻）
3. `node node_modules/wrangler/bin/wrangler.js deploy`（只上傳變動檔，約 15 秒）
驗證方式：線上首頁引用的 `assets/index-XXXX.js` 要與 `dist/assets/` 內的檔名一致。

**後端結構（平台無關）**：`server/labelParser.ts`（純解析）／`server/ocrLabel.ts`（Node 專屬 OCR）／`server/core.ts`（共用邏輯，★不可 import Node 模組）／`server/handlers.ts`（6 個 handler）／`server.ts`（Express 轉接層 130 行）／`worker.ts`（Workers 入口）
- 技巧：`makeRes()` 相容層包住 Express handler，`res.json()` **回傳「結果物件」**（不是 res），所以 `return res.json(...)` 原封不動可用
- 伺服器端 OCR 用依賴注入 `CoreDeps.recognizeImage`；Worker 不提供 → 回 `OCR_NOT_AVAILABLE`

**四個部署坑**
1. `run_worker_first = ["/api/*"]` 是關鍵 → 沒有它 SPA 模式會讓 `/api/*` 回 index.html，API 整組壞掉
2. **改 Worker 名稱 = 建新 Worker，Secret 不會跟著搬** → 必須重新 `wrangler secret put`
3. **不要用 `npx wrangler`** → 會觸發沙箱 safe-delete；用 `node node_modules/wrangler/bin/wrangler.js`
4. Tunnel 存取時 Vite 會擋前端（403）→ `allowedHosts: ['.trycloudflare.com']` 已加

**選 Cloudflare 而非 Vercel**：牆鐘時間無限制（AI 要 8–12 秒，Vercel 只有 10 秒）｜請求體 100MB vs 4.5MB｜無冷啟動。但 Workers 每請求僅 10ms CPU → **tesseract.js 不可能跑在後端**（這正是 OCR 必須搬到前端的根本原因）

## 🔒 隱私架構：照片不離開裝置（2026-09-27 完成）

```
瀏覽器 ──拍照──> tesseract.js 讀出文字  ← 照片到此為止
       └─ 只送 ocrText 給後端 ─> 本機規則引擎，或（經同意）把**文字**送雲端文字模型
```
- 語言檔在 `public/tessdata/`（瀏覽器與 Node 共用一份，不維護兩個 7.5MB 副本）；WASM 由 `scripts/copy-ocr-assets.mjs` 複製到 `public/`（不進版控）
- `server/ocrLabel.ts` 的 `buildRecognitionResult()` 是「文字→結果」**唯一實作**，確保兩條路徑的誠實門檻一致

**兩個必記的設計決定**
1. **判斷「哪一種模式」看欄位是否存在，不是看內容是否為空。** 前端 OCR 失敗時送 `ocrText: ''`，那仍是文字模式 → 要回「請重拍」而不是 400（400 會讓使用者看到「系統壞了」）
2. **空文字要提早擋掉**，不查快取也不呼叫雲端（送空字串只會得到幻覺，還白費額度）

## ⛔ Gemini 區域封鎖（已定案，不必重查）
使用者在中國澳門；Gemini API 官方支援區域**不含中國澳門／香港／大陸**。
三把不同金鑰、不同帳號皆回 `400 FAILED_PRECONDITION: User location is not supported`。
檢查順序是「身分 → 金鑰 → 區域（依呼叫來源位置）」→ 換帳號無用。
- 對照：無效金鑰回 `400 API_KEY_INVALID`；無金鑰回 `403 unregistered callers`
- 唯一合規解法：後端部署到支援區域（已部署 Cloudflare，**尚未驗證 Gemini 是否復活**）
- 用 VPN 或謊報地區繞過屬服務條款問題，**不做**

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
3. **回應快取**（最有效）：`圖片SHA-256 + 慢性病 + 身分 + 模式 + 語言` 為鍵，TTL 24h（實測 5065ms → 7ms）
4. **額度預檢**：`getOpenRouterQuota()` 查 `GET /api/v1/key`（快取 60s、不耗額度），`remaining == 0` 直接跳過

**OpenRouter 額度**：多開金鑰／帳號**無效**（官方：capacity 是全域治理，多開違反條款）。
未購買 50/日；累計購買 ≥10 點數 → 1000/日。
真實用量看 `GET /api/v1/key` 的 `free_model_daily_requests`（`limit`/`limit_remaining` 是 per-key 信用上限，易混淆）。

## 🎓 6 身分（`LearnerProfileId`）
`senior` 長者三高｜`child` 兒童 6–12｜`teen` 青少年 13–18｜`fitness` 健身增肌｜`takeout` 年輕外食｜`student` 學生。
定義集中在 `src/data/learnerProfiles.ts`，**前後端共用** → 必須保持**純資料**（不得引入瀏覽器／Node API）。
- `numericLimits: Record<名稱, {value, unit}>` 供百分比換算；`targets[].target` 是給人看的字串，**不能做數學運算**
- ⚠️ 兒童／青少年鈉糖上限明顯低於成人（鈉 1200/1600 vs 2000）
- ⚠️ **快取鍵必須含身分**（同一包高蛋白粉對健身族綠燈、對腎臟病患紅燈）
- 實測證明有效：同圖同病，健身→green、長者→yellow

## 📊 nutrient_facts 管線
**鐵則：模型只讀出「含量」，百分比一律由後端重算**（小模型算 `2480÷2000×100` 會錯，且錯得無聲無息）。
- `server/core.ts` 的 `normalizeNutrientFacts(raw, numericLimits)` 用每日上限**覆蓋**模型算的 percent，補 `dailyLimit`/`direction`，過濾（最多 3 項、**門檻 30%**、依嚴重度排序）
- **三條路徑都要套用**：雲端成功、**快取命中**、本機備援（漏掉快取會回傳舊格式）
- ⚠️ **limit 與 target 方向相反**（鈉 120% 是壞事、蛋白質 120% 是好事）→ `NutrientFactBars.tsx` 的 `factTone()` 分開處理

## 🔤 簡繁後處理
`server/core.ts` 的 `SIMPLIFIED_TO_TRADITIONAL` 只收「簡繁一對一無歧義」的字
（后/後、干/乾、里/裡、面/麵、只/隻、发/發/髮 **一律不列**），現約 438 字。
**日後又看到簡體字，先查是不是新字不在表內，別急著換模型。**

## 🌐 雙語架構（i18n，2026-09-28 建置中）

| 檔案 | 角色 |
| --- | --- |
| `src/i18n/translations.ts` | 扁平鍵字典（zh-TW ＋ en） |
| `src/i18n/I18nContext.tsx` | Context ＋ `useI18n()` hook |
| `src/i18n/LanguagePicker.tsx` | 設定頁語言選擇 |
| `src/data/bilingual.ts` | 營養素／單位／身分／病名中英對照（純資料，前後端共用） |
| `server/localEngineEn.ts` | 本機引擎輸出英文對照 ＋ `translateLocalResult()` |

- **型別強制同步**：`type TranslationKey = keyof typeof zhTW`，`en` 少一鍵就編譯失敗
- **選單項目存「翻譯鍵」而非字串**（模組層常數不會隨語言重算）
- **`I18nProvider` 必須包在 App 外面（`main.tsx`）**，否則 App 本體取不到 context
- 預設 zh-TW｜存 localStorage `labelbuddy-language`｜同步 `<html lang>`（螢幕閱讀器依此決定發音）｜語言選項顯示**母語名稱**

**後端雙語**
- 請求帶 `language`，後端預設 `'zh-TW'`（舊客戶端行為不變）
- ⚠️ **快取鍵必須加語言**（`lang:en|zh`）—— 中英共用快取會拿到另一種語言的舊結果**且不報錯**
- 提示詞採「英文覆蓋指示」（`ENGLISH_OUTPUT_OVERRIDE`）而非整份翻譯（80 中文字 → 45 words）
- ⚠️ **本機引擎是預設路徑**（`cloudConsent` 預設 false）→ 英文介面要真的可用，本機引擎**必須**雙語
- 本機引擎採「對照表 ＋ 事後轉換」（只轉輸出欄位），**比對關鍵字一行都不動**（翻了會讓比對失效）

### 第三階段進度（2026-09-28 完成，09-29 收尾）
| 頁面 | 狀態 |
| --- | --- |
| 健康設定頁（身分選擇／生理指標／慢性病清單） | ✅ 完成 |
| 飲食紀錄頁（週報／分級／匯出彈窗／示範紀錄） | ✅ 完成 |
| 食育學堂（外框 ＋ 21 張知識卡 ＋ 14 題測驗） | ✅ 完成 |
| 示範標籤圖片（`samples.ts`） | ✅ **09-29 英文化**（使用者新規則：任何地方都不能有中文） |

★ **食育學堂的外框與教材必須一起做** —— 只翻外框會變成「英文外殼 + 中文內容」。
★ 畫面用的英文對照：`src/data/bilingualContent.ts`（介面）＋
  `src/data/educationContentEn.ts`（教材）；後端用的在 `src/data/bilingual.ts`。
★ 三個必記的坑：
  ① 模組層函式只回傳**翻譯鍵**，由呼叫端 `t()` 解析
  ② `useMemo` 的依賴要含 `t` 與 `language`，否則切語言時文字不會重算（不會報錯）
  ③ **引入 `t` 之後，`.map((t) => ...)` 會遮蔽翻譯函式** → 參數要改名（如 `topic`）
★ **示範紀錄在「渲染時」才轉語言，不要轉完存回 state** —— 存回 state 切語言不會變。

### 🧪 i18n 驗證機制（2026-09-29 建立，**改動翻譯後必跑**）

| 指令 | 作用 |
| --- | --- |
| `npm run check:i18n` | 實際執行本機引擎，掃描輸出物件的每個字串找 CJK（含 2 條不經 AI 的後端路徑 ＋ 英文標籤解析可用性） |
| `node scripts/check-ui-cjk.mjs` | **真實 Chrome（CDP）** 走 6 個頁面掃描畫面文字 ＋ 截圖到 `shots-cjk/` |
| `npm run verify:all` | `lint` ＋ `verify:conditions` ＋ `check:i18n` |

★★ **靜態掃描（grep 原始碼）只能找線索，不能當驗收。** 理由：
  - 分不出 `language === 'en' ? 'English' : '中文'` 條件分支 → **假警報**
  - 抓不到執行時才組出來的字串（樣板、後端回傳）→ **漏報**
  最終一定要用瀏覽器實際渲染。`check-ui-cjk.mjs` 抓到的東西裡，
  `document.title`、OCR 失敗路徑、收合區塊摘要**都是靜態掃描看不到的**。

★ `check-i18n-leaks.ts` 內建**假通過防護**：`checks === 0` 時 `exit 2`。
  樣本 ID 打錯若印出綠色「通過」，比不檢查更危險。
★ 兩支腳本都有**有理由的例外清單**（`ACCEPTED` / `ALLOWED`），不是無條件忽略。

**已修掉的 7 類洩漏**（原本實測 95 處）：
`nutrition_concerns` 缺 8 條 · `foodName` 嵌入樣板沒翻 · 慢性病清單 `、` 串接查不到 ·
`condition_reminders` 沒帶語言（雲端本機都會用到）· `knowledge_point` 對照表**鍵寫錯** ·
`buildOcrFailedResult` 寫死中文 · `ensureEducationFields` 中文備援

### ⚠️ 三個反直覺的坑（09-29 實測）
1. **`localEngineEn.ts` 的對照表鍵必須是「完整句子」**，不是營養素名。
   `translateOne()` 拿 `knowledge_point` 全文查表；寫成 `鈉:` 永遠查不到，**且不報錯**。
2. **`labelParser.ts` 的英文鍵不能有空白** —— `normalizeLine()` 會移除整行空白，
   所以「Saturated Fat」比對時其實是「SaturatedFat」。
   ★ 09-29 之前 `FIELD_RULES` **只有中文鍵**：中文標籤讀 6/6 欄位、**英文標籤讀 0/6**，
   英文示範永遠顯示「看不清楚」。加英文鍵後中英都是 6/6。
3. **`condition_reminders` 不經過 AI**，是後端規則產生 → **兩條路徑都要帶語言**。

### 📌 已知限制（刻意接受）
- **`ingredients_detected`** 是包裝原文（OCR 讀出）。真實澳門商品本來就是中文，
  要翻譯得靠翻譯服務。目前唯一顯示它的 `ResultDisplay.tsx` 是**死檔**，畫面看不到。
  → **若日後重新啟用 `ResultDisplay`，必須先處理這一項。**
- `<meta name="description">` / `og:title` 為靜態中文，但**不顯示在頁面上**（社群預覽用）。

## 🎨 UI 與版面規則 → **見 `UI_RULES.md`**（同目錄）

改 UI 前**必讀** `memory/UI_RULES.md`，內容包含：
- `theme.ts` 設計權杖與三重編碼鐵則（`RISK_TONE`/`RISK_ICON`/`RISK_LABEL` 必須一起用）
- **字級鐵則：全域只能 16/18/19/20px，16 是地板**（`text-xs`=15px、`text-sm`=17.5px 是陷阱）
- 折行品質的三類判定 ＋ `check-wrapping-quality.mjs`（**不要用 `check-responsive-layout.mjs`**，會 255 筆假警報）
- 16:9 手機框（360×640）與 `min-[520px]:` 斷點的 4 處連帶必改
- `:root{font-size:20px}` 讓 Tailwind rem 間距放大 1.25 倍
- `SettingsSection` 收合時**必須顯示目前狀態**、側邊選單用 transform 位移而非條件渲染

## 已知環境陷阱
- `esbuild` 必須 ≥ `^0.28.0`（vite 8.3.0 peer），否則 `npm install` ERESOLVE
- `npm start` 需 `NODE_ENV=production`，否則會以開發模式啟動並嘗試載入 Vite 中介軟體
- 環境變數檔名必須是 `.env`（`dotenv.config()` 不讀 `.env.local`）
- 沙箱內第二次 `npm run build` 會被 safe-delete 擋下（`dist/assets` > 50 檔）→ 改用 `npx vite build --outDir .verify-dist`（見 `sandbox-build-verify` 技能）
- `npm run clean` 已改跨平台 node 指令；`autoprefixer` 已移除（Tailwind 4 走 `@tailwindcss/vite`）
- 沙箱內 `wrangler deploy` 上傳 28MB 要 1–2 分鐘，要用串流輸出（capture 會讓畫面像當掉）
- 沙箱內 `git push` 很慢（2–5 分鐘）；`npx` 會觸發 safe-delete，一律用本機執行檔

### Typst（桌面文件）
- 可攜版：`D:\Typst\typst-x86_64-pc-windows-msvc\typst.exe`（0.15.1）
- ⚠️ **`#show raw` 只給 Consolas 時，行內程式碼若含中文 → 靜默 fallback 到隸書（LiSu）**
  → raw 字型堆疊最後一定要放中文字型：`("Consolas", "Courier New", "Microsoft JhengHei UI")`
  → 這個坑用「逐字元測試」找不到（純文字有完整 fallback 鏈），
    要用**前綴編譯二分法**（截斷檔案 + 補 `#good[結束]` 讓它還能編譯）才定位得到
- 檢查字型的唯一可靠方法：讀 PDF 的 `/BaseFont`（`re.findall(rb"/BaseFont\s*/([A-Za-z0-9+\-]+)", data)`）
- 桌面計劃文件**現在只有一份**：`LabelBuddyAI_現況與規劃_20260928.typ/.pdf`
  （舊的 `_20260925` 已於 2026-09-28 經使用者同意移除）
- ⚠️ 刪檔時 `send2trash` 套件有 bug（組出 `\\?\C:/...` 正斜線路徑）；
  改用 `ctypes` 直接呼叫 `shell32.SHFileOperationW` + `FOF_ALLOWUNDO`

## 使用者決策與節奏
1. **🚀 每次任務完成後自動部署上線（2026-09-29 新規則，取代舊的「每個段落做完要主動做這三步」）**
   使用者原話：「在每一次完成我給你的任務時你也要自動為我上傳線上」
   → 不用再問、不用再等確認，做完就直接跑：
   `git add -A` → `commit` → `git push origin main` → `npx vite build` →
   `node node_modules/wrangler/bin/wrangler.js deploy`
   → 然後**驗證**：線上首頁引用的 `assets/index-XXXX.js` 必須等於本機 `dist/assets/` 的檔名。
   ⚠️ 只有「純記憶檔更新」這種不影響 App 的改動可以跳過重新部署（但仍要 push）。
2. **🧹 死檔要刪除或合併（2026-09-29 新規則，取代舊的「孤立程式碼保留」）**
   使用者原話：「把死的檔案(對功能沒有或可以合併至其他檔案貢獻的檔案)刪除或合併入其他檔案中，
   要盡量簡化檔案而不影響功能。重點：不能影響任何功能」
   → 刪除前**必須**用可達性分析證明不可達，且刪後要 `tsc` ＋ build ＋ 兩支檢查腳本全過。
3. **本機備援引擎暫不修改**（使用者計畫改用「手機端量化視覺模型」取代規則引擎）。
4. **一律先給計劃、確認後才動檔案**（但第 1 點的部署與第 2 點的死檔清理已預先授權）。
5. 使用者說「**Google**」常指 **Chrome 瀏覽器**，不是 Google 服務 → 遇到模糊指涉先問來源。
6. 使用者要求：每次回覆結束前**明確告訴他下一步要做什麼**。
7. 使用者要求：**完成任務播單響、需要確認播雙響**（`C:\Users\Spencer\.workbuddy-ai\notify\notify.py done|ask`）。

### 🔒 2026-09-28 定案（三個決定）
| 決定 | 內容 |
| --- | --- |
| 主線順序 | **雙語收尾 → 四份文件 → 影片海報 → 提交** |
| **AI 呈現** | **首次啟動加「同意使用雲端 AI」畫面 ＋ 把預設改為雲端 AI**（解章程「僅以固定規則模擬 AI」風險） |
| **APK 期限** | **必須在 10-01 ~ 10-02 完成**（硬期限，不可延） |

### 📅 排程（2026-09-28 定案）
| 日期 | 主線 |
| --- | --- |
| 09-29 ~ 09-30 | 雙語收尾（UI 約 2,552 字 ＋ 資料層約 7,993 字） |
| **10-01 ~ 10-02** | **APK 打包**（Capacitor ＋ ML Kit；需先裝 JDK／Android SDK 約 500MB，建議裝 `D:\android-dev\`） |
| 10-03 ~ 10-05 | 四份英文文件（ProjectIntroduction ＋ ResearchReport） |
| 10-06 ~ 10-08 | Poster ＋ DemoVideo 錄製剪輯 |
| **10-09** | 提交 |

## 📄 關鍵文件位置

| 文件 | 位置 |
| --- | --- |
| 專案交接文件（**新對話先讀這份**，11 章，第 3 章「關鍵不變式」最重要） | `docs/專案交接文件.md` ＋ `.pdf` |
| 功能稽核與執行計劃（6 頁） | `Desktop/LabelBuddyAI_功能稽核與執行計劃.pdf` |
| 現況與規劃（**2026-09-25，已過時**：本機 OCR 與雲端部署都已完成，且未涵蓋比賽與雙語） | `Desktop/LabelBuddyAI_現況與規劃_20260925.typ` |
| 章程（掃描版） | 專案根目錄 `2026全球青少年人工智能未來創新競賽...(1).pdf` |

## ⚠️ 已知死檔（未被任何地方引用，翻譯時可跳過）

`CaptureSection`、`CameraViewfinderModal`、`ResultDisplay`、`SeniorHealthQASection`、
`Header`、`SettingsModal`、`HealthSettings`、`FunctionSwitchBar`、`AnalysisStatus`、
`UsageGuideModal`、`PhysicalIndicatorSection`（合計約 2,000 中文字；是否刪除待使用者決定）

★ **可達性分析的用法**（09-29 實測有效）：從 `src/main.tsx` 走 import 圖，
  真正可達的只有 **23 個檔案**。要判斷「某段程式碼會不會顯示在畫面上」時，
  這比逐檔閱讀快得多，也能避免花時間翻譯永遠不會執行的程式碼。
★ **連帶影響**：`/api/analyze-indicators` 只被 `PhysicalIndicatorSection`（死檔）呼叫，
  `/api/ask-health-question` 只被 `SeniorHealthQASection`（死檔）呼叫
  → `server/smartIndicatorAnalyzer.ts` 與 `server/smartHealthQA.ts` 在畫面上不可達，
  **不需要雙語化**（但檔案仍在，屬於後端死路徑）。
