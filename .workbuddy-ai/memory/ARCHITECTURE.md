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
