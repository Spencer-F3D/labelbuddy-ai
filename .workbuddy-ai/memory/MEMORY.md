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

**四份交付物**：`ProjectIntroduction_LabelBuddyAI.pdf`（≤2頁）／`ResearchReport_LabelBuddyAI.pdf`（6–12頁）／`Poster_LabelBuddyAI.pdf`（0.8×1.1m 直向）／`DemoVideo_LabelBuddyAI.mp4`（≤5分鐘）

**排程**：09-29~09-30 雙語＋引導頁＋接回功能＋身分中性化 ✅ →
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

## 🔒 隱私架構與 AI 模式

```
拍照 ──> 前端 tesseract.js 讀出文字  ← 照片到此為止，從未離開裝置
      └─ 只送 ocrText 給後端 ─> 雲端 AI（主要）｜斷網／失敗 → 本機規則引擎（後備）
```
- 理由：章程規則 2 → **雲端真實 AI 必須是主角**。`analysis_mode` 回 `cloud_ai`/`local_fallback`，前端要顯示
- ★ **照片永遠不離開裝置，與 `cloudConsent` 無關** —— 本機 OCR 一直是唯一路徑，
  旗標只決定「文字」要不要送出。**不要把兩者混為一談。**
- ★ **引導頁是唯一能把 `cloudConsent` 設成 true 的入口**。旗標 `labelbuddy_onboarded_v1`
- 元件 `OnboardingFlow.tsx`（3 步：身分＋性別／使用介紹／私隱＋AI 模式）
- ★ 判斷「哪一種模式」看**欄位是否存在**，不是看內容是否為空：前端 OCR 失敗送 `ocrText: ''`，
  那仍是文字模式 → 要回「請重拍」而不是 400（400 讓使用者看到「系統壞了」）
- ★ **空文字要提早擋掉**，不查快取也不呼叫雲端（送空字串只會得到幻覺，還白費額度）

## 🛡️ 安全鐵則（違反會害到人）
★ **顏色一律以規則引擎為準，AI 只提供文字。**
  實測血壓 158/96 ＋ 空腹血糖 8.4（兩項都超過紅燈門檻）：規則判 red、雲端 AI 判 yellow。
  「該紅卻報黃」比誤報更危險 → **可預測的安全訊號交給規則，細膩的解釋交給模型。**
★ **性別絕不可影響紅黃綠**（`check-honorific.ts` 有斷言）。
★ **兩個「不會報錯」的 bug 類型（各踩過 3 次）**：
  ① **對照表鍵對不上** —— 長中文句子當鍵，一字之差就失效、靜默回中文。
     實例：改 `smartNutritionAnalyzer` 的措辭卻漏改 `localEngineEn` 的鍵。
  ② **插值變數漏翻** —— `sugarDisplay` 的「度」被插進兩個欄位，只看字面字串會漏掉。

## ⛔ Gemini 區域封鎖（已定案，不必重查）
使用者在中國澳門；Gemini 支援區域**不含中國澳門／香港／大陸**。
三把金鑰、三個帳號皆回 `400 FAILED_PRECONDITION: User location is not supported`。
檢查順序「身分 → 金鑰 → 區域」→ **換帳號無用**。
對照：無效金鑰 `400 API_KEY_INVALID`；無金鑰 `403 unregistered callers`。
用 VPN 或謊報地區繞過屬服務條款問題，**不做**。

## ⚠️ AI 供應商與模型鏈（會變動，失敗時先重查）
現役主力 **OpenRouter**；Gemini 程式碼保留，遇區域錯誤自動冷卻 6 小時。
`DEFAULT_MODEL_CHAIN`（**上限 3 個**）：`dots-studio/dots-3-note-preview:free`（1.6~2.3s，品質最佳）／
`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`（0.6s，最快）／`qwen/qwen3.8-27b:free`（常 429）
- **免費模型會變動** → 失敗時先查 `GET /api/v1/models` 過濾 `pricing.prompt == 0` 且 `input_modalities` 含 `image`
- OpenRouter 會快取相同請求 → 驗證延遲時提示詞要加唯一編號

## 💰 額度節省（四層）
1. **雙供應商輪替**：`orderedProviders()` 依「今日已用 ÷ 每日上限」排序
2. **健康冷卻**：一般失敗連續 2 次 → 10 分鐘；永久性錯誤 → 6 小時
3. **回應快取**（最有效）：`圖片SHA-256 + 慢性病 + 身分 + 模式 + 語言`，TTL 24h（5065ms → 7ms）
4. **額度預檢**：`getOpenRouterQuota()` 查 `GET /api/v1/key`（快取 60s、不耗額度）

⚠️ 多開金鑰／帳號**無效**（capacity 是全域治理，多開違反條款）。
真實用量看 `GET /api/v1/key` 的 `free_model_daily_requests`（`limit*` 是 per-key 信用上限，易混淆）。

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
- 雲端：`buildAddressRule()` 追加到 system prompt → 模型自然寫「先生您好」
- 本機：`applyHonorific*()` **確定性後處理**（只改「開頭的第一個『您好』」）
- 兩者不會重複加：模型若已寫「先生您好」，`^\s*您好` 就不命中
- ★ **性別刻意不進快取鍵** —— 快取存**中性**文字，稱謂在輸出最後一步插入。
  若日後改成「把稱謂寫進快取內容」，**必須**把 gender 加進鍵
- 英文一律不加稱謂（"Mr Hello!" 是錯的，英文沒有這種慣例）
- ⚠️ `QA_TEXT_FIELDS` **不含 `question`** —— 那是使用者自己的話，不能改

## 🎨 字級縮放（非長者，09-29 新增）
`<html data-density="compact|comfortable">`，由 `App.tsx` 依 `learnerProfileId !== 'senior'` 切換。
- `index.css` 用 `html[data-density='compact'] [class~='text-[16px]']` 精準命中
- 對應 16→14／18→16／19→17／20→18 px（**全域只有這 4 種字級**）
- ⚠️ **新增第 5 種字級必須回來補一行**，否則那個字級不會縮
- 寫在 `<html>` 而非包 div：側邊選單／彈窗／引導頁都是 fixed，包 div 蓋不到
- 不需要 `!important`（未分層 CSS 在 Tailwind v4 會蓋過 `@layer` 內樣式）

## 📊 nutrient_facts 管線
**鐵則：模型只讀出「含量」，百分比一律由後端重算**（小模型算 `2480÷2000×100` 會錯且無聲）。
- `normalizeNutrientFacts(raw, numericLimits)` 用每日上限**覆蓋** percent，補 `dailyLimit`/`direction`，
  過濾（最多 3 項、**門檻 30%**、依嚴重度排序）
- **三條路徑都要套用**：雲端成功、**快取命中**、本機備援（漏掉快取會回傳舊格式）
- ⚠️ **limit 與 target 方向相反**（鈉 120% 是壞事、蛋白質 120% 是好事）→ `factTone()` 分開處理

## 🔤 簡繁後處理
`core.ts` 的 `SIMPLIFIED_TO_TRADITIONAL` 只收「簡繁一對一無歧義」的字
（后/後、干/乾、里/裡、面/麵、只/隻、发/發/髮 **一律不列**），現約 438 字。
**看到簡體字先查是不是新字不在表內，別急著換模型。**

## 🧪 驗證機制（**改動翻譯／稱謂後必跑**）
`npm run check:i18n`（引擎輸出掃 CJK）｜`npm run check:honorific`（稱謂 29 項）
｜`npm run check:ui`（真實 Chrome 走 12 畫面）｜`npm run verify:all`（全部）

★★ **靜態掃描（grep）只能找線索，不能當驗收。** 分不出條件分支（**假警報**）、
  抓不到執行時組出的字串（**漏報**）。最終一定要用瀏覽器實際渲染。

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
