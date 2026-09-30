# LabelBuddy AI — 專案長期筆記

> 逐日細節 `.workbuddy-ai/memory/YYYY-MM-DD.md`｜UI 規則 `UI_RULES.md`｜
> 架構細節與踩坑 `ARCHITECTURE.md`。**本檔保持精簡（< 10KB）**，超過注入上限會被截斷。
> **最後整理：2026-09-29**

## 🏆 比賽（最高優先）

| 項目 | 內容 |
| --- | --- |
| 賽事 | 2026 全球青少年人工智能未來創新競賽（澳門中學生賽區） |
| **截止** | **2026-10-09**（逾期不受理）｜複評 11-01~11-16｜決賽 11-26 澳門線下 |
| **語言** | **所有材料只接受英文**（App 內容、海報、影片字幕、簡報、答辯） |
| 主題 | AI 與教育｜組別 **AI for Education**；定位「AI 食育學習平台」，SDG 3/4/12 |
| 章程 | 根目錄 `2026全球青少年人工智能未來創新競賽...(1).pdf`（掃描版，要渲染成圖才讀得到） |
| 使用者 | **本人就是參賽學生**（非老師／家長）｜**決定不花錢**（只用免費模型） |
| **團隊** | **3 人**（09-28 確認）→ 報告須列明**每位學生各自完成的部分** |
| **分工** | **使用者負責 App 全部技術**；2 位隊友負責**文件與影片** |

**評審比重**：問題與教育價值 20%｜創意原創 20%｜**AI 技術應用 25%**｜原型測試成效 20%｜英文表達 10%｜倫理安全私隱 5%

**四條致命規則**
1. 「未使用英文」→ 可不予評審（App 雙語不可省）
2. 「不能只提交概念、簡報、普通資料庫，或僅以固定規則模擬 AI」→ **雲端真實 AI 必須是主角**
3. 報告須列明生成式 AI 工具名稱／版本／用途／學生完成部分 → 隱瞞**直接取消資格**
4. 「不得提交學生不能合理理解及操作的系統」→ 評審可即場提問程式細節

**四份交付物**：`ProjectIntroduction`（≤2頁）／`ResearchReport`（6–12頁）／
`Poster`（0.8×1.1m 直向）／`DemoVideo`（≤5分鐘），檔名皆加 `_LabelBuddyAI`。

**排程**：09-28 雙語四階段 ✅｜09-29 引導頁＋接回功能＋身分中性化＋稱謂＋條款 ✅ →
**10-01~10-02 APK 打包（硬期限）** → 10-03~05 四份英文文件 → 10-06~08 Poster＋影片 → **10-09 提交**

## 🚀 部署（09-28 上線，每次任務完成自動執行）

**正式網址：`https://app.labelbuddy-ai.workers.dev`**
- Worker 名稱 = `wrangler.toml` 的 `name`（`app`）｜**唯一可靠來源是 `wrangler deploy` 最後一行**
- 帳號 `kanhf28@gmail.com`｜Account ID `4ffa5d1a862bdbeaef2782f9b9774034`
- 憑證 `C:\Users\Spencer\AppData\Roaming\xdg.config\.wrangler\config\default.toml`
- Secret：`OPENROUTER_API_KEY`、`GEMINI_API_KEY`
- 版控 GitHub `Spencer-F3D/labelbuddy-ai`（Private）｜手機測試 `連線到手機.bat`（Tunnel，網址每次不同）

⚠️⚠️ **`git commit` 只是本機動作 —— 不上 GitHub、更不上線。** 每次任務完成**自動**跑：
1. `git push origin main`（背景執行）
2. `node node_modules/vite/bin/vite.js build` → `dist/`
3. `node node_modules/wrangler/bin/wrangler.js deploy`（只上傳變動檔，約 30 秒）
4. **驗證**：線上首頁引用的 `assets/index-XXXX.js` 必須等於 `dist/assets/` 的檔名

## 🔒 隱私架構與 AI 模式（09-30 改為三模式）

```
拍照 ──┬─ cloud_image  → 照片直接上傳給雲端視覺模型（不做 OCR）
       ├─ cloud_text   → 前端 tesseract.js 讀出文字 → 只送文字給雲端 AI
       └─ local_only   → 前端 OCR → 本機規則引擎，完全不連網
```
| 模式 | 照片 | 文字 | 健康資訊 | 引擎 |
| --- | --- | --- | --- | --- |
| `cloud_image`（**預設**） | 上傳 | — | 上傳 | 雲端視覺 AI |
| `cloud_text` | 留在裝置 | 上傳 | 上傳 | 雲端文字 AI |
| `local_only` | 留在裝置 | 留在裝置 | 留在裝置 | 本機規則引擎 |

- 理由：章程規則 2 → **雲端真實 AI 必須是主角**；三模式讓使用者自己選隱私／準確度取捨
- ★ **「照片永遠不離開裝置」已不再是通則**（只對 `cloud_text`／`local_only` 成立）。
  文案一律**逐模式陳述** —— 概括保證在模式增加時最容易變成謊言
- ★ **前端 OCR 從「必經之路」變成後備方案**（09-30）
- ★ **同意閘門（09-30 補上）**：`analyze-indicators` 與 `ask-health-question`
  先前**無條件呼叫雲端**，選 `local_only` 時血壓／症狀／提問照樣上傳 →
  兩者都加 `localOnly` 檢查。**這是「不會報錯、只會偷偷違背承諾」的 bug**
- ★ `localOnly` **一律由 `analysisMode` 推導**，呼叫端不能自己傳
- ★ `cloud_image` 失敗時前端**自己 OCR 改用文字重送**＋顯示降級通知
  （Worker 沒有 tesseract，後端無法自己 OCR）
- ★ 舊鍵遷移：`true`→`cloud_text`、`false`→`local_only`。
  **不可直接蓋成新預設值** —— 那等於把「不同意上傳」的人改成「照片會上傳」
- ★ 解析度：`cloud_image` 1600px、OCR 模式 1024px（OCR 瓶頸在字元辨識，不在像素數）
- ★ 判斷「哪一種模式」看**欄位是否存在**，不是看內容是否為空：前端 OCR 失敗送 `ocrText: ''`，
  那仍是文字模式 → 要回「請重拍」而不是 400（400 讓使用者看到「系統壞了」）
- ★ **空文字要提早擋掉**，不查快取也不呼叫雲端（送空字串只會得到幻覺，還白費額度）
- 元件：`OnboardingFlow.tsx`｜`AnalysisModePicker.tsx`｜`src/data/analysisModes.ts`
  （細節與資料流見 `ARCHITECTURE.md`）

## 🛡️ 安全鐵則（違反會害到人）
★ **顏色一律以規則引擎為準，AI 只提供文字。**
  實測血壓 158/96 ＋ 空腹血糖 8.4（兩項都超過紅燈門檻）：規則判 red、雲端 AI 判 yellow。
  「該紅卻報黃」比誤報更危險 → **可預測的安全訊號交給規則，細膩的解釋交給模型。**
★ **性別絕不可影響紅黃綠**（`check-honorific.ts` 有斷言）。
★ **兩個「不會報錯」的 bug 類型（各踩過 3 次）**：
  ① **對照表鍵對不上** —— 長中文句子當鍵，一字之差就失效、靜默回中文。
     實例：改 `smartNutritionAnalyzer` 的措辭卻漏改 `localEngineEn` 的鍵。
  ② **插值變數漏翻** —— `sugarDisplay` 的「度」被插進兩個欄位，只看字面字串會漏掉。
★ **第三類（09-29 抓到，最嚴重）：快取鍵用錯內容來源。**
  前端 OCR 流程下 `imageBase64` 是空字串，但快取鍵拿它算 →
  **同身分／慢性病／模式／語言的所有商品共用一個鍵**。
  實測：燕麥片（鈉 2mg）之後掃泡麵（鈉 2350mg）→ 回「✅ 非常適合長者食用」。
  通則：**快取鍵一定要用「這次請求真正獨特的內容」**（見 `analysisCacheContent()`）。

## 📋 飲食紀錄（DietRecord）
★ **紀錄跟隨「標籤本身的語言」**，與介面語言無關（09-29 使用者定案：
「他拍照的照片是甚麼便是甚麼語言」）。`lang` 欄位在建立時固定。
- `detectLabelLanguage()`（`src/utils/labelLanguage.ts`）：OCR 含漢字 → `zh-TW`
- 介面語言 ≠ 標籤語言時，用**本機引擎就地重新產生** ——
  `smartNutritionAnalyzer`／`labelParser`／`localEngineEn` 都是**純函式**，
  可直接 import 進前端。完全離線、**不花任何 API 額度**（代價：bundle +13.5KB gzip）
- `localizeDietRecord()` 遇到**有 `lang` 的紀錄一律不動**；只有 6 筆示範資料走 ID 對照表
- 品名用 `labelParser` 的 `extractFoodName`（**標籤原文品名**），失敗才退回關鍵字猜測

## ⛔ Gemini 區域封鎖（已定案，不必重查）
使用者在中國澳門；Gemini 支援區域**不含中國澳門／香港／大陸**。
三把金鑰、三個帳號皆回 `400 FAILED_PRECONDITION`，檢查順序「身分 → 金鑰 → 區域」
→ **換帳號無用**。用 VPN 或謊報地區繞過屬服務條款問題，**不做**。
（完整錯誤碼對照見 `ARCHITECTURE.md`）

## ⚠️ AI 供應商與模型鏈（會變動，失敗時先重查）
現役主力 **OpenRouter**；Gemini 程式碼保留，遇區域錯誤自動冷卻 6 小時。
`DEFAULT_MODEL_CHAIN`（**上限 3 個**）：`dots-studio/dots-3-note-preview:free`（品質最佳）／
`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`（最快）／`qwen/qwen3.8-27b:free`（常 429）
- **免費模型會變動** → 失敗時先查 `GET /api/v1/models` 過濾 `pricing.prompt == 0`
  且 `input_modalities` 含 `image`。完整型號與實測秒數見 `ARCHITECTURE.md`
- OpenRouter 會快取相同請求 → 驗證延遲時提示詞要加唯一編號

## 💰 額度節省（四層）
雙供應商輪替｜健康冷卻（連續失敗 2 次→10 分；永久性→6 小時）｜
**回應快取**（最有效，TTL 24h：5065ms → 7ms）｜額度預檢（`GET /api/v1/key`，不耗額度）。

⚠️ 多開金鑰／帳號**無效**（capacity 是全域治理，違反條款）。

## 🎓 6 身分（`LearnerProfileId`）
`senior` 長者｜`child` 兒童 6–12｜`teen` 青少年 13–18｜`fitness` 健身增肌｜
`takeout` 年輕人｜`student` 學生。
定義集中 `src/data/learnerProfiles.ts`，**前後端共用** → 必須**純資料**（不得引入瀏覽器／Node API）。
- ★ **名稱不得含評價性字眼**（09-29 使用者要求）：「長者三高」→**長者**（不尊重）、「年輕外食」→**年輕人**。
  **身分卡片不得顯示說明文字**（`audience` 欄位已刪）。
- ⚠️ 兒童／青少年鈉糖上限明顯低於成人（鈉 1200/1600 vs 2000）
- ⚠️ **快取鍵必須含身分**（同一包高蛋白粉對健身族綠燈、對腎臟病患紅燈）
- `numericLimits` 供百分比換算；`targets[].target` 是給人看的字串，**不能做數學運算**

## 🗣️ 稱謂機制（性別，09-29 新增）
`gender`（`male`/`female`/`unspecified`）**只影響怎麼稱呼，不影響任何判斷**。
雲端用 `buildAddressRule()` 追加 system prompt；本機用 `applyHonorific*()` **確定性後處理**
（只改「開頭的第一個『您好』」）。
- ★ **性別刻意不進快取鍵** —— 快取存**中性**文字，稱謂在輸出最後一步插入。
  若改成「把稱謂寫進快取內容」，**必須**把 gender 加進鍵
- 英文一律不加稱謂（"Mr Hello!" 是錯的）
- ⚠️ `QA_TEXT_FIELDS` **不含 `question`** —— 那是使用者自己的話，不能改

## 🎨 字級縮放（非長者，09-29 新增）
`<html data-density="compact|comfortable">`，由 `App.tsx` 依 `learnerProfileId !== 'senior'` 切換。
`index.css` 用 `html[data-density='compact'] [class~='text-[16px]']` 精準命中，
對應 16→14／18→16／19→17／20→18 px（**全域只有這 4 種字級**）。
- ⚠️ **新增第 5 種字級必須回來補一行**，否則那個字級不會縮
- 寫在 `<html>` 而非包 div：側邊選單／彈窗／引導頁都是 fixed，包 div 蓋不到
- ★ **唯一例外：12px**（私隱條款／免責聲明，`LegalNotice.tsx`，09-29 使用者指定）。
  不在上面四個 class 內 → **不會**被縮放影響（刻意）。理由見 `UI_RULES.md`。

## 💾 儲存鍵與「清除所有資料」
全部以 `labelbuddy` 開頭（語言／身分／性別／**分析模式**／慢性病／指標／紀錄／同意／引導頁／學習進度）。
★ 清除用**前綴掃描**（`k.startsWith('labelbuddy')`），不是寫死清單；
清完用 `location.reload()` 而非逐一重設 state（逐一重設會漏且不報錯）。
詳見 `ARCHITECTURE.md`。

## 📊 nutrient_facts 管線
★ **鐵則：模型只讀出「含量」，百分比一律由後端重算**（小模型算 `2480÷2000×100` 會錯且無聲）。
★ **三條路徑都要套用**：雲端成功、**快取命中**、本機備援（漏掉快取會回傳舊格式）。
⚠️ **limit 與 target 方向相反**（鈉 120% 是壞事、蛋白質 120% 是好事）。
細節見 `ARCHITECTURE.md`。

## 🔤 簡繁後處理
`core.ts` 的 `SIMPLIFIED_TO_TRADITIONAL` 只收「簡繁一對一無歧義」的字（現約 438 字，
后/後、干/乾、里/裡、面/麵、只/隻、发/發/髮 **一律不列**）。
**看到簡體字先查是不是新字不在表內，別急著換模型。**

## 🧪 驗證機制（**改動翻譯／稱謂／快取／模式後必跑**）
`npm run check:i18n`（引擎輸出掃 CJK）｜`npm run check:honorific`（稱謂 29 項）
｜`npm run check:cache`（快取鍵 11 項）｜`npm run check:diet`（紀錄語言 15 項）
｜`npm run check:mode`（**同意閘門 12 項，會實際啟動伺服器**）
｜`npm run check:ui`（真實 Chrome 走 **16 畫面**）｜`npm run verify:all`（全部）

★★ **靜態掃描（grep）只能找線索，不能當驗收。** 分不出條件分支（**假警報**）、
  抓不到執行時組出的字串（**漏報**）。最終一定要用瀏覽器實際渲染。
★ `check-ui-cjk.mjs` 的引導頁段落**必須先勾同意勾選框**才能按「開始使用」，
  否則會卡在引導頁、後面每個畫面都拍到它（全部誤判）。

## 使用者決策與節奏
1. **🚀 每次任務完成後自動部署上線（09-29）**
   原話：「在每一次完成我給你的任務時你也要自動為我上傳線上」→ **不用問、不用等確認**。
   ⚠️ 但**破壞性操作仍要先問**（刪檔、改架構、動他的資料）。
2. **🧹 死檔要刪除或合併（09-29）** → 刪前必須可達性分析 ＋ 字串搜尋雙重證明；刪後 `tsc` ＋ build ＋ 檢查腳本全過。
3. **一律先給計劃、確認後才動檔案**（但第 1、2 點已預先授權）。
4. 使用者說「**Google**」常指 **Chrome 瀏覽器** → 模糊指涉先問來源。
5. 每次回覆結束前**明確告訴他下一步要做什麼**。
6. **完成任務播單響、需要確認播雙響**（`C:\Users\Spencer\.workbuddy-ai\notify\notify.py done|ask`）。

## 📄 關鍵文件位置
| 文件 | 位置 |
| --- | --- |
| 章程 PDF | 專案根目錄（掃描版，要渲染成圖） |
| UI 規則 | `.workbuddy-ai/memory/UI_RULES.md` |
| 架構細節／踩坑 | `.workbuddy-ai/memory/ARCHITECTURE.md` |
| 逐日工作日誌 | `.workbuddy-ai/memory/YYYY-MM-DD.md` |
| 專案交接文件 | `docs/專案交接文件.md`（＋ .pdf） |
