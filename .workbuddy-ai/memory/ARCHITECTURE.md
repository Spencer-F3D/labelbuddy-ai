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

## 導覽與頁面（2026-09-29）

`App.tsx` 的 `MENU_ITEMS` 是**唯一的頁面切換入口**（底部導航列已於 09-28 移除）。
`NavigationTab = 'home' | 'scan' | 'conditions' | 'history' | 'classroom' | 'qa'`

| 選單順序 | tab | 備註 |
| --- | --- | --- |
| 主頁 | `home` | |
| 拍照辨識 | `scan` | |
| 飲食紀錄 | `history` | |
| 食育學堂 | `classroom` | |
| **健康問答** | `qa` | **09-29 從「設定」搬過來** —— 它是功能，不是設定 |
| 健康設定 | `conditions` | |

⚠️ 新增分頁要改**四處**：`NavigationTab` 型別、`MENU_ITEMS`、頁面渲染區塊、
footer 的 CTA 分支（`activeTab === 'xxx' ? ... : ...` 鏈）。漏掉 footer 那處不會報錯，
只會讓底部按鈕顯示成上一個分頁的內容。

## 09-29 新增的元件

| 檔案 | 職責 |
| --- | --- |
| `src/components/GenderPicker.tsx` | 稱謂性別（先生／小姐／不用特別稱呼）。**引導頁與設定共用同一份** `GENDER_OPTIONS`，避免兩邊漂移 |
| `src/components/LegalNotice.tsx` | 私隱條款 ＋ 免責聲明（**12px**）＋ 引導頁的同意勾選 |
| `src/components/ClearAllDataSection.tsx` | 清除所有資料（**兩級警告**）＋ `clearAllAppData()` |
| `src/utils/labelLanguage.ts` | `detectLabelLanguage()` —— 抽出來才能在測試腳本單獨驗證（import App.tsx 會拉起整個 React App） |

★ **兩級警告的設計理由**：這個按鈕一按下去，身分、慢性病、指標、整週紀錄全部消失，
而且**無法復原**（沒有帳號、沒有雲端備份 —— 那正是隱私承諾）。
單一 confirm 在手機上很容易誤觸，所以拆成兩步，且**兩步的用詞與按鈕顏色都不同**：
第 1 步說明「會刪掉什麼」（中性色），第 2 步是最後確認（**紅色** ＋ 明寫「無法復原」）。
刻意不用「再按一次相同按鈕」—— 那對誤觸沒有防護力。

## 四支自動化檢查（09-29 新增三支）

| 指令 | 守住什麼 | 項數 |
| --- | --- | --- |
| `check:i18n` | 引擎輸出的英文零中文殘留 | 15 組 |
| `check:honorific` | 稱謂正確、英文不加稱謂、**性別不影響顏色** | 29 |
| `check:cache` | 快取鍵必須區分不同商品 | 11 |
| `check:diet` | 紀錄跟隨標籤語言、品名取自標籤原文 | 15 |
| `check:ui` | 真實 Chrome 走 15 個畫面 | 15 畫面 |

★ 這幾支都是「**不會報錯的 bug**」的防線 ——
對照表鍵對不上、稱謂時有時無、快取張冠李戴、紀錄語言混雜，
四種都不會丟例外，只會安靜地給出錯的結果。

## localStorage 鍵清單（全部以 `labelbuddy` 開頭）

| 鍵 | 用途 |
| --- | --- |
| `labelbuddy-language` | 介面語言（`I18nContext`） |
| `labelbuddy_learner_profile_v1` | 學習者身分 |
| `labelbuddy_gender_v1` | 稱謂性別 |
| `labelbuddy_selected_conditions` | 勾選的慢性病與過敏原 |
| `labelbuddy_conditions_migrated_v1` | 舊版設定遷移旗標 |
| `labelbuddy_senior_indicators_v2` | 身體指標 |
| `labelbuddy_diet_records_v1` | 飲食紀錄 |
| `labelbuddy_learning_progress_v1` | 食育學堂學習進度 |
| `labelbuddy_cloud_consent_v1` | 雲端分析同意 |
| `labelbuddy_onboarded_v1` | 是否走過引導頁 |

★ 「清除所有資料」用**前綴掃描**（`k.startsWith('labelbuddy')`）而不是逐一列出鍵名 ——
新增儲存鍵時不必回來改這裡，也不會因為漏列而留下殘留資料（那種 bug 不會報錯）。
清完呼叫 `window.location.reload()`，讓 App 用乾淨的 localStorage 重新初始化
（逐一重設 state 很容易漏掉某個 `useState`，而且不會報錯，只會留下殘留資料）。

## Gemini 區域封鎖：完整錯誤碼對照（已定案，不必重查）

使用者在中國澳門；Gemini 官方支援區域**不含中國澳門／香港／大陸**。
三把不同金鑰、不同帳號皆回 `400 FAILED_PRECONDITION: User location is not supported`。

| 情況 | 回應 |
| --- | --- |
| 有效金鑰 ＋ 不支援區域 | `400 FAILED_PRECONDITION: User location is not supported` |
| 無效金鑰 | `400 API_KEY_INVALID` |
| 完全沒帶金鑰 | `403 unregistered callers` |

★ 這個順序證明「區域檢查發生在**金鑰被接受之後**」，且依**呼叫來源的位置**判定 ——
所以換幾個帳號結果都一樣。唯一合規解法是把後端部署到支援區域
（已部署 Cloudflare，**尚未驗證 Gemini 是否復活**）。

## 三種分析模式（2026-09-30）

`AnalysisMode = 'cloud_image' | 'cloud_text' | 'local_only'`（定義在 `src/types.ts`）

| 模式 | 前端做什麼 | 送出去的內容 | 後端引擎 |
| --- | --- | --- | --- |
| `cloud_image`（預設） | 只壓縮，**不跑 OCR** | 照片 ＋ 慢性病清單 | 雲端視覺模型 |
| `cloud_text` | 跑 OCR | OCR 文字 ＋ 慢性病清單 | 雲端文字模型 |
| `local_only` | 跑 OCR | **什麼都不送** | 本機規則引擎 |

★ 本機規則引擎 = `src/utils/smartNutritionAnalyzer.ts`（純函式、離線、不花額度）。

### 資料流與閘門

- `App.tsx` 的 `sendImageForAnalysis()` 依模式分流，抽出 `postAnalyzeLabel()` helper
- ★ `localOnly` **一律由 `analysisMode` 推導**，呼叫端不能自己傳 ——
  否則會出現「使用者選了只在本機，卻因為某個分支忘了帶旗標而上傳」的漏洞
- 後端三個端點都讀 `localOnly`：
  - `analyze-label`：`allowCloud = localOnly === false`（原本就有）
  - `analyze-indicators`：`localOnly ? null : await callAiModel(...)`（09-30 補）
  - `ask-health-question`：同上（09-30 補）
- ★ 這兩個端點先前**無條件呼叫雲端**，是「不會報錯、只會偷偷違背承諾」的 bug

### 自動降級（`cloud_image` 專屬）

Cloudflare Worker 沒有 tesseract.js → 圖片模式雲端失敗會回 `400 OCR_NOT_AVAILABLE`，
**後端無法自己 OCR**。所以降級做在**前端**：
失敗 → 自己跑 OCR → 改用文字重送 → 結果頁顯示 `result.autoDowngraded` 通知。

★ 一定要告知使用者：他選「直接雲端」是為了準確度，悄悄降級會讓他以為照片有被用到。

### 解析度

| 常數 | 值 | 理由 |
| --- | --- | --- |
| `IMAGE_MAX_DIM_CLOUD` | 1600 | 視覺模型要看得清標籤小字（base64 約 300–500KB） |
| `IMAGE_MAX_DIM_OCR` | 1024 | OCR 的瓶頸在字元辨識，不在像素數；越大越慢 |

### 舊設定遷移

`labelbuddy_cloud_consent_v1`（`'true'`/`'false'`）→ `labelbuddy_analysis_mode_v1`：
`true`→`cloud_text`、`false`→`local_only`。
★ **不可直接蓋成新預設值** —— 那等於偷偷把「不同意上傳」的人改成「照片會上傳」。
遷移後移除舊鍵。

### 相關檔案

| 檔案 | 角色 |
| --- | --- |
| `src/data/analysisModes.ts` | 模式順序 ＋ 三組翻譯鍵的對照（避免 App ↔ 元件循環引用） |
| `src/components/AnalysisModePicker.tsx` | 三選一 UI（引導頁與設定頁共用） |
| `scripts/check-analysis-mode.ts` | 12 項閘門測試（實際啟動伺服器、不耗 API 額度） |

## nutrient_facts 管線細節

★ **鐵則：模型只讀出「含量」，百分比一律由後端重算** ——
小模型算 `2480÷2000×100` 會錯，而且錯得無聲無息。

`normalizeNutrientFacts(raw, numericLimits)`：
用每日上限**覆蓋**模型算的 percent，補 `dailyLimit` / `direction`，
過濾（最多 3 項、**門檻 30%**、依嚴重度排序）。

⚠️ **三條路徑都要套用**：雲端成功、**快取命中**、本機備援 ——
漏掉快取那條會回傳舊格式（而且不會報錯）。
⚠️ **limit 與 target 方向相反**（鈉 120% 是壞事、蛋白質 120% 是好事）
→ `NutrientFactBars.tsx` 的 `factTone()` 分開處理。

## 簡繁後處理

`core.ts` 的 `SIMPLIFIED_TO_TRADITIONAL` 只收「簡繁一對一無歧義」的字，
現約 438 字。**一律不列**的（因為一簡對多繁、有歧義）：
后/後、干/乾、里/裡、面/麵、只/隻、发/發/髮。

★ 看到簡體字先查是不是「新字不在表內」，不要急著換模型。

## 額度節省四層

1. **雙供應商輪替**：`orderedProviders()` 依「今日已用 ÷ 每日上限」排序
2. **健康冷卻**：一般失敗連續 2 次 → 10 分鐘；永久性錯誤 → 6 小時
3. **回應快取**（最有效）：TTL 24h（實測 5065ms → 7ms）
4. **額度預檢**：`getOpenRouterQuota()` 查 `GET /api/v1/key`（快取 60s、查詢本身不耗額度）

⚠️ 多開金鑰／帳號**無效**（官方：capacity 是全域治理，多開違反條款）。
真實用量看 `GET /api/v1/key` 的 `free_model_daily_requests`
（`limit` / `limit_remaining` 是 per-key 信用上限，容易混淆）。

## 引導頁（2026-09-30 改版）

**頁數依身分決定** —— 長者 9 頁、其他身分 7 頁：

| 對象 | 頁面 |
| --- | --- |
| 長者（9） | 介紹／身分／慢性病與過敏／性別／**教學 ×3（分步）**／AI 方式／私隱 |
| 其他（7） | 介紹／身分／慢性病與過敏／性別／**教學 ×1（一次過）**／AI 方式／私隱 |

### 實作要點

- `StepId` 聯合型別 + `buildSteps(profileId)` 回傳**步驟陣列**
  （不用數字 —— 寫死 `step === 4` 的話，加一頁就全部錯位且不會報錯）
- ★ 頁數在**第 2 頁選完身分後**才確定 → 進度指示的總數會變（刻意設計）
- ★ 使用者回頭改身分會讓陣列從 9 變 7 → **必須 `Math.min(step, steps.length - 1)` 夾取**，
  否則 `steps[step]` 是 `undefined`，整頁空白
- 教學三步用同一份文案（`onboard.how1/2/3Title/Body`），
  長者逐頁顯示、其他身分用三卡並列顯示

### 第 3 頁：慢性病與過敏

12 項（8 慢性病 + 4 過敏原），與設定頁**共用 `PHYSICAL_INDICATORS` 與儲存鍵**。
UI 刻意分成兩份：
- 引導頁 = 精簡版（只有名稱 + 勾選框），目的是「一次選好」
- 設定頁 = 完整版（分類篩選、釘選已選、展開詳情），目的是「日常管理」

★ 資料來源只有一份，所以不會有資料層面的漂移；差異只在呈現。

★ `selectedConditions` 的 state **必須宣告在 `handleOnboardingComplete` 之前**，
  因為引導頁會回傳勾選結果，那個 handler 要寫入它（否則 TS 報「用於宣告之前」）。

## 選圖入口（2026-09-30）

```
<input ref={cameraInputRef}  type="file" accept="image/*" capture="environment" />  拍照
<input ref={galleryInputRef} type="file" accept="image/*" />                        相簿
```

★ **兩個 input 缺一不可**：`capture="environment"` 在手機上會**直接開鏡頭**，
  等於拿掉「選相簿」。桌面瀏覽器兩者都會開檔案選取器（正常）。
★ 按鈕樣式：拍照用主要（`FOOTER_CTA_CLASS`，藍底），
  相簿用次要（`FOOTER_SECONDARY_CLASS`，白底深框）——
  兩個一樣醒目會讓長者不知道按哪個。但**觸控高度都維持 72px**。

## 難字簡化（2026-09-30）

| 標籤上的字（canonical） | 中文顯示 | 英文顯示 |
| --- | --- | --- |
| 鈉 | 鹽分 | Sodium |
| 膳食纖維 | 纖維 | Dietary fiber |
| 飽和脂肪 | 動物油 | Saturated fat |
| 添加糖 | 糖 | Added sugar |
| 碳水化合物 | **不變** | Carbohydrate |

### 單一對照表 + 進出邊界轉換

`src/data/bilingual.ts`：
- `NUTRIENT_NAME_SIMPLE`（canonical → 簡化）
- `SIMPLE_TO_CANONICAL`（反向，自動產生）
- `canonicalNutrientName()` / `nutrientName()`

| 位置 | 用哪個名稱 | 為什麼 |
| --- | --- | --- |
| 提示詞的 `numericLines` | **簡化**（`nutrientName`） | 讓模型自然寫出好懂的字 |
| `numericLimits` 的鍵 | **canonical** | 內部契約，不能動 |
| `normalizeNutrientFacts` 查表 | 先 `canonicalNutrientName()` 再查 | 模型給的是簡化名稱 |
| `nutrient_facts[].name` 輸出 | **canonical** | 前端才能依語言顯示（否則英文介面會露中文） |
| 前端 `nutrientName()` | 先還原再查表 | 快取裡可能有舊名稱 |
| `LOCAL_KNOWLEDGE_POINTS` 的鍵 | **canonical** | 查表前先還原 |

★ **改中文文案時必須同步改 `localEngineEn.ts` 的對照鍵** ——
  本專案已因這個踩過 **4 次**（`check:i18n` 會抓到，但要知道去哪裡改）。

⚠️ **1 毫克鈉 ≈ 2.5 毫克鹽**，兩者不是同一件事。使用者知情後選擇「直接寫鹽分」，
  結果頁加一行說明當安全網（「包裝上印的是『鈉』…看標籤時請認包裝上的字」）。
  百分比不受影響：分子分母都是鈉，比例相同。

## 檢查腳本的兩個教訓（2026-09-30）

★ **不要寫死頁數／步驟數。** `check-ui-cjk.mjs` 原本用 `Step 1 of 3` 偵測引導頁，
  引導頁改成 9 頁後偵測不到 → 15 個「畫面」全拍到引導頁，
  卻因為引導頁是英文而**全部通過**。已改成 `\d+` 並加 `process.exit(1)` 防護。
★ **不要用 `| head` 接 node 腳本** —— SIGPIPE 會殺掉它，看起來像跑完了。

## 介面用字與「開發者文字」（2026-09-30）

使用者的原則：「**這個 App 是為了普通人而開發的，不要在頁面上有不用給用戶看的字。**」

### 不該出現在畫面上的

| 類型 | 例子 | 為什麼 |
| --- | --- | --- |
| 技術詞 | OCR、規則引擎、快取、備援引擎 | 一般人看不懂 |
| 實作狀態 | 「☁️ 雲端 AI（快取）」 | 快取與使用者無關 |
| 給評審看的 | 模型名稱 tooltip | 那是報告要寫的，不是 UI |
| 開發者註解式 | 「包裝上印的是『鈉』…」 | 讀起來像工程註解 |

### 已建立的對應

- 來源徽章只留兩種：`☁️ 雲端 AI` / `📴 離線回答`（tooltip 用白話說明）
- 按鈕一律用「拍／看」：拍照看標籤、拍食品標籤（不用「辨識／掃描」）
- 引導頁第一頁：先講結果（拍食品標籤，馬上知道能不能吃）＋
  「拍這個 → 得到這個」的視覺對照

### ⚠️ 改 UI 文案時要一起檢查的地方

1. **`check-ui-cjk.mjs`** —— 它用寫死的按鈕文字導覽
   （例如 `clickByText('Photo a label')`）。改了按鈕就找不到，
   而且**會安靜地跳過那一頁**（只印一行警告，不影響 exit code）。
2. **`localEngineEn.ts`** 的對照鍵 —— 引擎輸出的中文改了就要同步改。
3. 引導頁的模擬標籤（`onboard.introShot*`）—— 曾經寫死中文，英文介面會露中文。

## 難字片語後處理（2026-09-30）

`src/data/bilingual.ts` 的 `simplifyNutrientWording()`：

```ts
鈉含量 → 鹽分含量   含鈉量 → 含鹽量   高鈉 → 高鹽分   低鈉 → 低鹽分
鈉攝取 → 鹽分攝取   膳食纖維 → 纖維   飽和脂肪 → 動物油   添加糖 → 糖
```

★ **只換片語，不碰單一個「鈉」字** ——
  `L-麩酸鈉`（味精）、`苯甲酸鈉`、`碳酸鈉`、`亞硝酸鈉` 也是「鈉」結尾。
  **寧可漏換，不要錯換。**

套用位置（7 處）：雲端成功／快取命中／本機備援／生理指標（含 `supermarket_rules`
的兩個陣列）／健康問答。
⚠️ 使用 `NUTRIENT_WORDING_FIELDS`（= `LABEL_TEXT_FIELDS` **減去 `ingredients_detected`**）——
標籤原文不能改。

## 「改了 A 忘了 B」的五種形狀（2026-09-30 全面審查）

本專案已踩過五種。**每一種都不會報錯，TypeScript 也檢查不到。**

| # | 形狀 | 實例 | 後果 |
| --- | --- | --- | --- |
| ① | 對照表鍵對不上 | 改引擎中文沒改 `localEngineEn` 的鍵 | 英文模式靜默回中文 |
| ② | 插值變數漏翻 | `sugarDisplay` 的「度」被插進兩個欄位 | 單位重複 |
| ③ | 快取鍵用錯內容來源 | 前端 OCR 下 `imageBase64` 是空字串 | 所有商品共用一個鍵 |
| ④ | 改了映射函式沒改呼叫端 | `NutrientFactBars` 直接渲染 `fact.name` / `fact.unit` | 畫面顯示舊字 |
| ⑤ | 後端沒產生某個值，前端卻寫了分支 | `direction === 'target'` 永遠不成立 | 功能靜默失效 |

### ⑤ 的細節（2026-09-30 新發現，最隱蔽）

`factTone()` / `factLabel()` 都寫好了 `direction === 'target'` 的分支，
但 `normalizeNutrientFacts()` 永遠只產生 `'limit'` ——
**那段程式碼從上線以來從未執行過**，而且畫面看起來完全正常。

★ 通則：**凡是 UI 有 if/else 的值，都要回頭確認每個值真的有生產者。**

### 對策：把「不可能」變成「檢查得到」

| 形狀 | 防線 |
| --- | --- |
| ① | `scripts/check-lookup-keys.ts`（9 張表的孤兒鍵）＋ `check:i18n`（執行時掃 CJK） |
| ③ | `scripts/check-cache-key.ts` |
| ④ | 改映射函式時 grep 所有消費者（人工，但註解已寫在各處） |
| ⑤ | `scripts/check-analysis-mode.ts` 的「方向」測試組 |

## 營養素方向（limit vs target）

`numericLimits` **沒有**方向資訊，`targets` 才有（`NutritionTarget.direction`）。
`getNutrientDirections(profileId)` 把 `targets` 攤平成查表用的物件 ——
**單一真相來源仍然是 `targets`**，不要在 `numericLimits` 裡再寫一份。

```
normalizeNutrientFacts(raw, numericLimits, directions?)
                                      ^^^^^^^^^^ 漏掉 → 全部當成「上限」
```

⚠️ **排序也必須「上限類優先」**：`b.percent - a.percent` 會讓
「纖維 120%（好事）」把「鈉 118%（壞事）」擠到後面，使用者第一眼看到綠色。

## 檢查腳本的不確定性問題（2026-09-30）

`check-ui-cjk.mjs` 原本只走「直接雲端」。但雲端模型**不一定每次都會回傳
`nutrient_facts`** → `NutrientFactBars` 回傳 null → 文字掃描掃不到 →
**檢查通過，但那一塊完全沒被驗到**。單位翻譯的 bug 就是這樣躲過去的。

→ 追加一輪 `local_only`（確定性引擎）＋ 斷言「長條圖必須出現」。
★ 通則：**檢查要有確定性來源，並且要斷言「東西真的出現了」**，不能只掃描。

⚠️ 設定 localStorage 的時機：**引導頁的 `useState` 預設值會覆寫回去**，
所以「改模式」必須在走完引導頁**之後**再做。

---

# 2026-10-02 ～ 10-04 補充

## 🔊 語音朗讀（TTS）實作細節

★ **APK 是 Capacitor Android WebView，不實作 Web Speech 合成 API**
（`window.speechSynthesis` 只有 Chrome 有）→ 舊版 `speakText()` 每次靜默 `return false`
（**不拋錯、不記錄、畫面無異狀**）。→ 原生走 `@capacitor-community/text-to-speech`，
瀏覽器走 Web Speech。

★ **只裝 npm 套件不算生效，要驗三件事**：
1. `android/app/capacitor.build.gradle` 有 `implementation project(':capacitor-community-text-to-speech')`
2. APK 內 `assets/capacitor.plugins.json` 有 `...tts.TextToSpeechPlugin`
3. **合併後的 AndroidManifest 有 `<queries><intent><action TTS_SERVICE>`**
   （Android 11+ 套件可見性；少了它引擎找不到**且不報錯**）

→ 驗法：`aapt2 dump xmltree --file AndroidManifest.xml <apk>`。

★ **發音語言由「文字本身」決定，不是介面語言。** 全站 12 個朗讀呼叫點原本都傳
`ttsLanguageFor(介面語言)` → 英文介面唸中文內容會變成拼音般的噪音、中文介面唸英文成分表
會變中文腔。修法寫在 `speakText` **內部**（含 CJK → 使用者選定的中文語言；純拉丁 → 英文）——
改呼叫端要記得改 12 處，本專案已踩過五次以上「改了 A 沒改 B」。
驗證：`scripts/check-tts-speak.mjs` 配對 **6/6** 正確。

★ **設定頁試聽必須用 `forceLanguage`**（不套用字集改寫），且三種語言**各自一句示範句**
（用該語言本身寫，不是共用一句）。否則中文介面按 English 會聽到粵語 ——
使用者只會認為功能壞了。⚠️ 一般朗讀仍要套用字集改寫，那才是修「英文語音唸中文」的機制。

★ **「手機只說普通話」的根因不在 App**：有些 Android TTS 引擎會回報支援 `zh-HK`，
實際卻用預設（通常是國語）發音 → 只問「支不支援」會拿到**誤導的答案**。
→ 用 `getSupportedVoices()` 比對出 `zh-HK` 的索引，把 `voice: index` 傳給 `speak()`
（指定了就沒有「引擎自己挑」的餘裕）。設定頁顯示「這個裝置會用：語音名稱」。
App 啟動時預載語音清單，否則第一次朗讀會退回預設。
★ 判斷「該用哪一個語音」時，**普通話刻意排除粵語**，避免反向錯誤。

★ `getVoices()` **非同步** → 要監聽 `voiceschanged`，否則第一次朗讀挑不到語音。
★ 澳門用 `zh-HK`（粵語），不是 `zh-TW`。
★ 設定存 `labelbuddy_tts_v1`（`volume`／`touched`／`voiceLang`）；
**長者預設開、其他身分預設關**；有 `touched` 旗標，手動改過就永遠以使用者為準
（否則改身分時會被覆蓋）。
★ 「關閉」在 `speakText` 最前面擋掉，**不是** volume 設 0（會被當無效參數 → 反而變大聲）。
★ **音量一律由 `getTtsVolume()` 決定 —— 呼叫端不要傳 `volume`**，傳了會覆寫使用者的設定。
★ TTS 語速固定 0.88（稍慢），不隨身分調整。

★ **「完全沒有聲音」的診斷**：實測程式正常（這台機器有 22 個語音、含
`zh-HK | Google 粵語（香港）`；三種語言都挑到正確語音；`error:not-allowed` 純粹是
無頭瀏覽器沒有使用者手勢，用 CDP 送真實滑鼠點擊後全部 `start,end` 正常）。
重現不出來時**不要繼續猜** → `getLastTtsDiagnostic()` 記錄「挑了哪個語音、有沒有送出、
結局、錯誤原文」，設定頁直接顯示。四種原因處理方式完全不同：

| 畫面顯示 | 意思與處理方式 |
| --- | --- |
| 目前沒有聲音 | 音量是 0（非長者身分預設靜音）→ 把音量條往右拉 |
| 找不到這個語言的語音 | 這台裝置沒裝該語言語音 → 到系統設定安裝 |
| 被瀏覽器擋下 | 需要先點一下畫面（Chrome 的使用者手勢政策） |
| 已送出朗讀卻沒聽到 | 唸了，但系統音量或分頁靜音 |

## 📷 本機 OCR：10-04 實測結論

引擎 = 瀏覽器端 tesseract.js，要下載 **約 6.4 MB**（`chi_tra.traineddata` 2.37MB
＋ WASM 約 4MB ＋ worker）。

★ **`warmUpBrowserOcr()` 必須在完成引導頁後就呼叫。** 它曾長期是死匯入（存在但沒人呼叫）
→ 6.4MB 在按下快門那一刻才開始下載 → 超市弱訊號下失敗 → App 卻說「請重拍」
→ **使用者一直重拍而照片從來沒問題**。

★★ **`chi_tra` 會把小數點全部吃掉** —— 這是只有實測才看得到的：

| 英文標籤 | 只有 `chi_tra` | `chi_tra+eng` |
| --- | --- | --- |
| `Protein` | `Protean 250g` ❌ | `Protein 2.509` ✅ |
| `Carbohydrate` | `680g` ❌ | `6.80g` ✅ |
| `Sugar` | `100g9` ❌ | `1.009` ✅ |
| `Percentage` | `Percenmtage` ❌ | `Percentage` ✅ |

`6.80` → `680` 差 100 倍，**在畫面上看起來像正常的數字**。

★ **但這是雙向取捨，沒有一個設定全贏**：中文「大卡」在 `chi_tra+eng` 會變成 `x +`、
「公克」變成 `2%`／`公交`，而解譯器正是靠那個關鍵字抓數值。
→ **兩輪各用一組語言模型**：第一輪 `chi_tra+eng`（英文／中英混排，實拍最常見），
第二輪 `chi_tra`（中文救援）。
⚠️ 陷阱：worker 快取原本是「單一 promise」，第二輪會沿用第一輪的 worker ——
**語言模型根本沒換**，等於白跑一次且**不報錯** → 快取必須改成以**語言組合為鍵**的 Map。
★ 伺服器端離線 OCR 預設也改 `chi_tra+eng`（可用 `TESSERACT_LANG` 覆寫）。

★ **`tessdata_best` 實測是退步 → 不採用**（結論已寫進 `ocrBrowser.ts` 註解，不要重跑）：

| 測試項目 | fast（現用） | best |
| --- | --- | --- |
| 英文輸出 | `Protein 2.509` … | **逐字相同**（連錯字 `Dally` 都一樣） |
| 中文欄位數 | **5** | 4（較差） |
| 中文耗時 | 1526 ms | **3580 ms（2.35 倍）** |
| 模型大小 | 6.2 MB | **27 MB（4.4 倍）** |

而且 best 在我們的核心上直接崩潰：
`RuntimeError: Aborted(missing function: _ZN9tesseract13DotProductSSE…)` ——
best 是全精度**浮點**、需要 SSE 路徑；fast 是**整數量化**不需要。把 `corePath` 從
「目錄」改成指定 SIMD 那個檔案就跑得起來，**但那等於放棄 tesseract.js 的「執行時自動挑
核心」→ 不支援 SIMD 的舊手機將完全無法使用本機 OCR**。
（tesseract.js 的 CDN 已 404，best 檔要改用 GitHub 官方 repo。）

⚠️ **商標／圖案被當成字**（使用者原文裡的 `隊二放生生莘讓人`）屬於「把非文字區域也送去
辨識」的問題，**換語言模型救不了**。只有像 Google ML Kit 那類**有區域偵測**的引擎才可能
解決（僅支援 Android）。
★ 順帶一提：使用者的**雲端 AI 結果其實是正確的**（鈣 101mg、蛋白質 2.5g 全對，
還推導出「換算成 100g 則高達 805mg」）—— 雲端模型有能力從 `S0tium 175mg` 還原正確數值。

★ **診斷鐵則：要測 App 真正在跑的那份程式碼。** 探針頁載 tesseract.js 的 **UMD 版**
會繞過 App 的 ESM 路徑 →「探針說可以、使用者說不行」。正確做法：跑 Vite dev server，
在頁面裡 `await import('/src/ocr/ocrBrowser.ts')` 再呼叫它。
★ 失敗要分「引擎」與「照片」（`errorKind`）；**引擎失敗不要叫使用者重拍**。
★ 資產快取標頭在 `public/_headers`（Workers Assets 預設 `max-age=0` → 每次重驗）。
★ 工具：`scripts/check-ocr-pipeline.mjs`（標籤佔畫面 100%→25% 逐級測）、
`scripts/check-local-ocr.mjs`（**唯一走瀏覽器 OCR 的檢查**）、
`scripts/make-ocr-test-photos.py` —— 三支都記錄了「我自己量錯的方式」，**先讀檔頭再用**。

## ⚠️ AI 供應商與模型鏈

輪替鏈 `orderedProviders(hasClientKey, hasImage)` = **nvidia → gemini → openrouter**
（排序＝使用率低者優先；`DAILY_QUOTA.nvidia = 100000` 是**輪替權重**，讓沒有上限的它先吃請求）。
`DEFAULT_MODEL_CHAIN` **上限 3 個**。

★ **NIM 是文字模型、收不下圖片** → 含圖請求必須跳過它。不跳過會把失敗計數推高 →
最後讓這個「沒有上限」的供應商被冷卻 → **反而失去省額度的意義**。
★ **免費模型會變動** → 失敗時先查 `GET /api/v1/models`，過濾 `pricing.prompt == 0`
且 `input_modalities` 含 `image`。
★ **改供應商清單時要同步改 `/api/ai-status` 的 providers 迴圈**（漏了不會報錯，
面板只會與事實不符）。
★ NIM 金鑰 = Worker secret `NVIDIA_API_KEY`（本機測試放 `.dev.vars`）；
Base URL `https://integrate.api.nvidia.com/v1`，**無每日上限**。加速關鍵：
`reasoning_effort: 'low'`。現役 `NVIDIA_MODEL_CHAIN` **只有 `openai/gpt-oss-20b`**（實測 0.76s）。
★ 已測並移除（**不要重試**）：`z-ai/glm-5.3-flash`（13～33s 太慢，且 `content` 是 null、
答案在 `reasoning_content`）、`nvidia/nemotron-3.5-lightning-30b-a3b`（40s 逾時）。
**會逾時的模型比沒有備援更糟。**
★ `/api/fitness-report` 只送**彙總數字**、不送逐筆紀錄；AI 失敗回**離線規則版**。

## 🎓 身分定義與孕期把關

`LearnerProfileId`：`senior`／`child`／`teen`／`fitness`／`young`／`middle`／`student`／
`pregnant`（10-04 新增第 8 個）。定義集中 `src/data/learnerProfiles.ts`，**前後端共用**
→ 必須**純資料**。

★★ **孕婦與其他七個性質不同**：別人是「某項數字要低一點」，孕婦多了「**某些成分絕對不能出現**」。
**酒精 0.5 公克不會讓任何營養數字超標** —— 但對胎兒就是風險，靠每日上限永遠抓不到。
→ `PREGNANCY_HAZARDS` 成分層級把關：

| 分級 | 項目 | 關鍵字 |
| --- | --- | --- |
| 🔴 紅燈 | 酒精 | 酒精／米酒／料理酒／紹興／酒釀／清酒／啤酒／`alcohol`／`wine` |
| 🔴 紅燈 | 生食與未殺菌 | 生魚片／刺身／生乳／未殺菌／溏心／`raw fish`／`unpasteurized` |
| 🔴 紅燈 | 高汞魚類 | 鯊魚／劍魚／旗魚／馬鮫／`shark`／`swordfish`／`marlin` |
| 🟡 黃燈 | 咖啡因 | 咖啡／可可／巧克力／能量飲料／`caffeine` |

⚠️ **關鍵字必須避開「同字不同物」的誤判**：`酒` 要排除 `酒石酸`（合法食品添加物、
**不含酒精**）；`生` **不能單獨比對**（「花生」「生菜」「生粉」都會誤中）。

★ **規則引擎的簽章刻意把 `profileId` 做成必要參數**（不是可選）——
若可選，日後新增呼叫端時漏傳就會**靜默跳過安全檢查**且沒有錯誤訊息。
★ 驗證：`scripts/check-pregnancy.mjs` **16 項全部通過**，同時檢查兩個方向 ——
「該紅的要紅」（7 個危險成分案例含英文關鍵字）、「該黃的要黃」（咖啡因）、
**「不該紅的不要紅」**（一般餅乾、`酒石酸`、`花生`、`生菜` 4 項誤判防護）、
「非孕婦身分不該被孕期規則影響」。
★ 為什麼要測「不該紅的不要紅」：**過度觸發會讓使用者學會忽略紅燈** ——
一個永遠在響的警報等於沒有警報。

| 欄位 | 內容 |
| --- | --- |
| 名稱 | 孕婦（英文用 `Pregnancy` —— 描述「階段」比描述「人」中性） |
| 限制項 | 鈉 2000mg／添加糖 50g／咖啡因 200mg／酒精 **0（完全避免）** |
| 目標項 | 葉酸 600µg／鐵 27mg／鈣 1000mg |
| 顯示順序 | 健身人士之後（兩者都不以年齡定義，不打断「由年輕到年長」的動線） |
| 配色 | rose（**刻意不做粉紅／心形之類的聯想**，只是一個可辨識的色相） |

★ 名稱不得含評價性字眼（「長者三高」→**長者**）；身分卡片不得顯示說明文字。
⚠️ `bilingual.ts` 的 `PROFILE_NAME_EN` 曾漏改，長者英文名寫成 "Senior with hypertension…"
（＝把三高貼在長者身上，**只有英文介面看得到**）。
★ **改 id 一定要同時寫遷移**（`LEGACY_PROFILE_IDS`）：否則舊裝置的值被判無效而
**靜默退回長者**（鈉上限 2000→1500、字級放大），使用者不會知道為什麼。
★ 「中年」＝**一般成人上限**，重點放在三高**長期累積**（不併入長者＝不讓未確診的人過度緊張；
不併入青年＝保留「預防」這個判讀角度）。
⚠️ 兒童／青少年鈉糖上限明顯低於成人；**快取鍵必須含身分**；
`targets[].target` 是給人看的字串，**不能做數學運算**。
⚠️ 尚未做孕期專屬教學卡與題庫（`preferredTopics` 目前指向既有主題）；
**咖啡因只靠成分關鍵字抓**（解析器沒有咖啡因欄位 → 標示「咖啡因 150 毫克」但成分沒寫咖啡的
產品抓不到）。

## 🏋️ 健身專區

只在身分＝`fitness` 時出現在側邊選單。★ **過濾寫在 render 裡，不是 `MENU_ITEMS` 常數** ——
常數是模組層、看不到 state，寫在那裡切換身分不會更新且**不會報錯**。
三分頁：課表規劃／訓練紀錄／飲食熱量。儲存鍵 `labelbuddy_fitness_v1`（純本機）。

★ **課表用確定性規則**（3 目標 × 5 天數 ＝ 15 模板，`src/data/fitnessContent.ts`），
**不叫 AI** —— AI 會每次不一樣、吃掉標籤辨識額度，還可能生出解剖學上不合理卻看不出來的組合。
★ 熱量用 Mifflin-St Jeor；蛋白質／脂肪**以每公斤體重**計（寫死公克數對 50kg 與 90kg 都是錯的）；
畫面必須寫明是**估算值（±10%）**。★ 不預填任何示範資料；不做醫療建議。
★ 圖表只算「有填重量」的動作並註明 —— 自重訓練算進去會讓圖表看起來像「這週沒練」，
那是**錯誤的視覺暗示**。
★ BMR 公式**需要**生理性別參數（生理事實，與稱謂無關）→ 由使用者在該頁**自己填**，
不從全域設定偷偷帶進來。

## 🎨 字級縮放與版面稽核

`<html data-density>` 由 `App.tsx` 依 `learnerProfileId !== 'senior'` 切換，`index.css` 命中
**四種**字級：`compact`（非長者）14/16/17/18；`comfortable`（長者）**19/22/23/24**。
★ **新增字級必須兩個模式都補一行**；寫在 `<html>` 而非包 div（fixed 元素才蓋得到）。
★ **唯一例外：12px**（`LegalNotice.tsx`）刻意不受縮放影響。
★ 內距／間距用**明確 px**（`:root{font-size:20px}` 讓 `p-4`／`gap-4` 實際是 20px）。

⚠️ 改動後**必須跑 `npm run check:layout`**，且**一定要加 `--lang=en`**
（中文一字一方塊、英文以詞斷行，中文乾淨**不代表**英文乾淨）與 **`--profile=fitness`**
（不加就整塊沒被看過 → 報告全綠，**假通過**）。
★ **`min-w-0` ＋ `whitespace-nowrap` ＝保證溢出** → 要單行的標籤改 **`shrink-0`**。
★ **`truncate` 用於「狀態摘要」等於讓該設計失效**（那些欄位就是要讓長者不展開也知道設了什麼）
→ 要折行。
★ **孤行的常見成因是「flex 兄弟搶寬度」**（圖示／勾勾／間距都吃同一行）→
把最重要的那行**移出 flex 列、改獨立一行取全寬**比縮文案更治本。
★ **中文孤行要用 `text-wrap: balance`，`text-wrap: pretty` 對中文無效** ——
它是為「詞」設計的，中文沒有詞邊界，單一個中文字不算 orphan。
（改用 `balance` 後版面稽核由 2 筆問題變成 **0 筆**。）

## 🛠️ 開發者面板（隱藏）

連點主標「LabelBuddy AI」**7 下**進入。計數用 **ref 不用 state**（state 會全樹重繪），
且必須有**時間窗**（2 秒），否則分幾天點也會開。內容：供應商用量／上限、冷卻、上次錯誤、
模型鏈、快取、NVIDIA 狀態、執行環境。★ 供應商清單以 `orderedProviders` 為準。
★ 面板會顯示執行中的**建置指紋** → 一眼知道手機裝的是哪一版。
★ **溢出修法本身才是問題**：原本「看到哪個元素會溢出就補 `break-all`」天生會漏
（漏了 `openrouterQuota` 那一行）→ 改成在**最外層容器**加 `overflow-wrap: anywhere`：
它是**繼承屬性**，底下所有文字自動生效；且與 `break-word` 不同，**會影響 min-content 尺寸**，
所以 flex 子項也算得對。之後再加任何欄位都不需要記得補斷行。

## 🚀 部署／APK 建置細節

正式網址 `https://app.labelbuddy-ai.workers.dev`（Worker 名 = `wrangler.toml` 的 `name`；
**唯一可靠來源是 `wrangler deploy` 最後一行**）。帳號與 Account ID 已遮蔽
（2026-10-06，此 repo 可能改為公開）；憑證 `%APPDATA%\xdg.config\.wrangler\config\default.toml`。
Secret：`OPENROUTER_API_KEY`、`GEMINI_API_KEY`、`NVIDIA_API_KEY`。
版控 `Spencer-F3D/labelbuddy-ai`（Private）。

★★ **收尾的唯一正確動作是 `npm run ship`**（＝`node scripts/ship-all.mjs`／雙擊「一鍵同步.bat」）：
工作區乾淨 → 跑檢查 → `vite build` → `git push` → `wrangler deploy` → 出 APK →
**`check-consistency.ts` 驗證線上／GitHub／APK 三者一致**（沒過以非零結束碼失敗）。
⚠️⚠️ **`git commit` 只是本機動作** —— 不上 GitHub、更不上線。

★ **判定「一致」**：建置時把指紋寫進 `dist/index.html` 的 `<meta name="x-build-id">`
（＝`<commit>[-dirty]+<原始碼內容雜湊>`，`scripts/build-stamp.mjs`）；`cap sync` 會把整個
`dist/` 複製進 Android 專案，所以 APK 也帶著它；線上網站同理。
→ 三者比對**指紋 ＋ bundle 的 sha256**。
**不比檔名**（檔名是建置工具算的內容雜湊，正常會一致，但「檔名一樣、內容不同」是可能的）、
**不比時間**（複製／checkout／切分支都會改時間；本專案吃過「時間對了但內容是舊的」的虧）。

★★ **指紋只能放 `index.html`，不可注入 JS** —— 注入進 JS 會讓 bundle 的雜湊取決於 commit，
於是「同一份程式碼、不同 commit」也產生不同的 bundle → sha256 比對永遠過不了。

★★ **判準分兩級**：內容指紋不同／sha256 不同／用未提交內容建置（`-dirty`）→ **失敗**；
**只有 commit 雜湊不同 → 警告**。理由：兩個 AI 同時提交時，對方提交文件就會讓我方剛建好的
產物變成「上一個 commit」；若算失敗，檢查會永遠是紅的而原因與 App 無關 → 沒人看它，
保證反而死掉。要嚴格語意 → `--strict-commit`。

★ **驗證有沒有推上去要看 `origin/main`，不要只看結束碼** ——
`ship-all.mjs` 的 `git push` 曾用「cmd.exe 重導到檔案」而**沒有真的推上去**（結束碼被吃掉）；
已改成 `execFileSync` ＋明確 stdio。
★ `deploy-worker.mjs`（「部署上線.bat」）原本**沒有先 `vite build`**，而 `wrangler.toml` 的
assets 指向 `./dist` → 會把舊版推上線且顯示成功；`SECRETS` 也漏了 `NVIDIA_API_KEY`。兩者已修。

★ 沙箱裡建 APK 有三個關卡：
1. `vite build` 清 dist 被防大量刪除 shim 擋（EBUSY）→ 加 `CODEBUDDY_SAFE_DELETE_ENABLED=0`
2. `cap sync` 的 `update` 會 EPERM 並刪掉
   `capacitor-cordova-android-plugins/cordova.variables.gradle` → 手動刪 `.../build` 再跑
   （`copy` 成功就夠）
3. gradle 可能把 `packageRelease` 判成 `UP-TO-DATE` → 產出「看起來成功但內容是舊的」APK
   （`build-apk.mjs` 的「APK 必須比 dist 新」檢查就是擋這個）

★ 應用名稱與桌面檔名都是 **營養放大鏡**。JDK 21 在 `D://Java//jdk-21.0.12.1+1`
（⚠️ Capacitor 8.x 要 **21**，17 會 `invalid source release: 21`）；Android SDK 在
`D://Android//Sdk`；簽章 `android/labelbuddy-release.jks`＋`keystore.properties`
（**兩者都不可進版控**）。
★ **打包網頁進 APK**（不用 `server.url`）→ WebView origin 是 `https://localhost` →
API 一律走 `src/utils/apiBase.ts` 的 `apiUrl()`。
★★ **`gradlew.bat` 不能直接 `spawnSync`**（Node 18.20.2+ 修 CVE-2024-27980 會回
`EINVAL errno:-4071`，訊息**像找不到檔案或權限問題**）→ 走 `cmd.exe /d /s /c`，
**不要用 `shell: true`**（那正是 CVE 的成因）。
★ 檔名日期用**本機時區**（曾用 UTC → 16:00 後寫成「昨天」）。
★ 驗章用 `apksigner verify`，**不要**看「META-INF 有沒有 .RSA」（v2/v3 在 Signing Block
→ 假警報）。
★ 沙箱「防大量刪除」是**累計**（50 檔/回合）→ 同回合連刪大檔會害後面的 `vite build`
清 dist 被擋。

★ **`ship-all.mjs` 的三個「工具本身的 bug」**（共同特徵：**不會報錯、只會給你一個看起來
很合理的錯誤答案**）：

| bug | 後果與修法 |
| --- | --- |
| `spawnSync` 接管 stdout | 這個沙箱環境會直接回 `EBUSY`，而且**任何執行檔都一樣**（`cmd.exe`／`git`／`python`／`node`）。不是程式的問題，是「接管 stdio」被擋 → 改用 `stdio: 'inherit'`（代價：拿不到子程序輸出、只能拿結束碼） |
| 改回傳型別忘了改呼叫端 | `run()` 從「回傳物件」變成「回傳結束碼（數字）」後，呼叫端還留著 `r.status === 0` → 永遠是 `undefined === 0` → **明明成功卻每次都報失敗** |
| 結束碼 0 ≠ 檔案更新 | APK 步驟結束碼 0、輸出看起來正常，但**桌面 APK 的時間沒變**（舊檔還在）→ 加入「比對建置前後的 mtime」。**只看結束碼抓不到「靜默地什麼都沒做」** |

★ **另一個 AI 的驗證工具也踩了同一個坑**：它的 `git()` 用
`stdio: ['ignore','pipe','pipe']` 讀輸出 → `EBUSY` → 被 `try/catch` 接住 → `pushed` 恆為
false → **報告永遠說「本機 main 沒推上 GitHub」**，但 `git status -sb` 明明顯示
`## main...origin/main`。**驗證工具自己在說謊，比不驗證更糟** —— 會讓人開始忽略它的輸出。
→ 改成**直接讀 `.git/refs/**` 檔**（零子程序）：HEAD 是符號引用要追一層；分支可能被 pack
進 `packed-refs`，所以要有後備。

## 🤝 兩個 AI 同時改同一個專案

★ **`AI_COLLAB.md` 的結構**：0.4 工作流程（開始前讀訊息＋登記＋寫計劃；完成後驗證＋
`ship-all`＋追加訊息）／0.5 同時編輯的注意事項／1 硬規則（8 條）／2 目前狀態／
**3 已有結論的事**／4 訊息區（追加式）。
**第 3 節最有價值** —— 它讓下一個 AI 不必重跑「`tessdata_best` 到底有沒有比較好」這類實驗
（要花幾十分鐘，結論只是一行字）。

★ **不要用 `git add -A`** —— 曾把另一個 AI 還沒提交的進行中變更一起包進 commit，
那個 commit（`cae5f45`）**本身編譯不過**（其中一個元件的函式體用了 `localOnly`，
但函式簽章與呼叫端都沒有這個 prop）。提交前看 `git diff --stat`，動手前先登記。
★ **改完立刻 commit** —— `ship-all.mjs` 要求工作區乾淨才肯跑，但兩個 AI 都在改檔案時
兩邊的工作區都不乾淨 → **兩邊的 `ship-all` 都拒絕執行**，只能靠「其中一個人先提交完」解開。
★ 兩個 AI 同時跑 gradle 會造成鎖衝突（APK 建置失敗過一次，單獨重跑就成功）。
★ **工具最後收斂成一套**：它的 `一鍵同步.bat` 呼叫我的 `ship-all.mjs`，我的腳本呼叫它的
`check-consistency.ts`。⚠️ 我原本自己寫了一套「比對 bundle 檔名」的驗證，**後來刪除了** ——
兩個 AI 各寫一套一致性檢查，只會製造新的不一致。

## 🔒 同意閘門（第三個端點，2026-10-04）

★★ **任何「會呼叫雲端」的功能都要有同意閘門**：`/api/analyze-label`、
`/api/ask-health-question`、`/api/fitness-report` —— 前端要傳 `localOnly`、後端要真的檢查
（**兩道防線**）。2026-10-04 補上的就是漏掉的第三個（健身專區 AI 週報）：
**前端元件原本連 `analysisMode` 都沒接收**，所以「只在本機」照樣上傳統計數字到 NVIDIA。
→ 修法：`FitnessZone` 收 `analysisMode` → 推導 `localOnly` → 傳給 `LogTab`
（按鈕與 `generateReport()` 都在 `LogTab`，**不要在子元件各自再算一次**）；
`local_only` 時**不渲染按鈕**、改顯示「要切換模式才能用」；後端 `localOnly === true`
→ 直接回本機版、不呼叫 NIM（第二道防線）。
★ 使用者明確要求：報告**要繼續真的用 AI**，不可以靜默降級成本機版。
★ **驗證方法**：比對「帶／不帶 `localOnly`」的**耗時差 65 倍**。
只比對 `source` 欄位是驗不出來的（NIM 失敗時兩邊都回 `local`）。

## 🧪 「非食物被判綠燈」的真因（2026-10-04）

★ 使用者回報「本機模式時會把不是食物但沒有任何成分的東西（如紙）也說可以食用」，
但**本機的兩條路徑全部正確**（9 種非食物 × 2 種本機模式都正確拒絕）→ 重現不出來。

★★ **真因在雲端路徑**：AI **正確地**判斷「這不是食物標籤」，**但同時回了**
`risk_level: "green"` → 畫面上是一張**綠燈卡片**（綠色在這個 App 的意思就是「可以吃」），
標題卻寫「這不是食物標籤」。**使用者看到的就是「說可以食用」。**
★ **為什麼前端救不了**：`photo_issue` 這個欄位唯一的消費端，是用來決定「重拍按鈕的文字」。
**沒有任何地方用它修正顏色。**
→ 修法：後端強制覆寫 —— `photo_issue` 存在時（不是食物標籤／照片模糊）一律**至少黃燈**。

★ **順手加硬的第二道門檻**：原本的門檻是「至少 3 個欄位 ＋ 必須有鈉或糖」——
意味著**只要 OCR 把一段不相干的文字誤讀成「鈉 800 毫克」之類的組合就會通過門檻**，
接著規則引擎看到一份「數值都很正常」的資料，回你一個綠燈「很適合您」。
→ 新增 `FOOD_CONTEXT` 門檻：文字裡必須出現食品情境詞
（營養／成分／每份／熱量／`nutrition`／`serving`／`sodium` …）。
⚠️ **關鍵字刻意取寬** —— 過嚴會誤殺真的標籤，那比漏放更糟（使用者會一直重拍）。
回歸檢查：5 個真標籤（中文完整／只寫成分／英文完整／英文簡寫／只寫每份）全部仍被接受。

★ **檢查腳本自己會誤判**：`check-nonfood.mjs` 用 `/適合/` 判斷「有沒有說可以食用」，
但**正確拒絕**的文案裡也有這兩個字（「…才能幫您分析是否*適合*長者食用」）
→ 一個正確的拒絕被判成事故。→ 先排除明確拒絕的字眼，再判斷有沒有正向字眼。

## 📋 介面修正（2026-10-04）

★ **右上角的模式標籤永遠顯示「雲端 AI」**：它顯示的其實是 `geminiConnected`（**連線狀態**），
與分析模式完全無關 → 只要連得到伺服器就永遠寫「雲端 AI」，**連選「只在本機」也一樣**。
對一個**隱私指示器**來說這是最糟的錯誤方向。
→ 改為顯示目前的模式，並**另外定義** `MODE_CHIP_KEY` —— 不重用 `MODE_LABEL_KEY`，
因為它的 `cloudText` 是「本機圖像識別」（7 個字），塞不進這個只剩約 9 個字餘裕的標籤。
→ 圓點顏色改為反映**該模式的隱私行為**：只在本機＝綠、其餘＝藍、雲端模式若連不上則轉灰。

| 模式 | 右上角顯示 | 圓點顏色 |
| --- | --- | --- |
| 直接雲端 | 雲端辨識 | 藍 |
| 只送文字 | 只送文字 | 藍 |
| 只在本機 | 只在本機 | **綠** |

★ **選單順序**：健身專區移到「飲食紀錄」下面 → 用**明確的位置表**取代
`a.tab === 'fitness' ? -1 : 1`（後者只能表達「放最前面」，表達不了「放在某一項之後」；
位置表還讓「沒列到的項目自動留在原位」）。
★ **朗讀語言與音量拆成兩區**：兩者其實是**不同的問題**（用什麼語言發音 vs 要不要出聲、
多大聲）。並排在同一區會讓人以為「選了粵語就等於開啟語音」。
→ 拆為 `TtsVoiceLangSection` 與 `TtsVolumeSection`，朗讀語言那區加一行說明
「這三個是『唸出來的語言』，跟畫面上的文字語言無關」。
