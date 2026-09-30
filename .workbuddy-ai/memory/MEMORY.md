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

**四條致命規則**：① 未用英文可不予評審（App 雙語不可省）② **雲端真實 AI 必須是主角**
③ 報告須列明 AI 工具名稱／版本／用途／學生分工，隱瞞**直接取消資格**
④ 不得提交學生不能理解的系統（評審可即場提問程式細節）

**四份交付物**：`ProjectIntroduction`（≤2頁）／`ResearchReport`（6–12頁）／
`Poster`（0.8×1.1m 直向）／`DemoVideo`（≤5分鐘），檔名皆加 `_LabelBuddyAI`。

**排程**：09-28 雙語 ✅｜09-29 中性化＋稱謂＋條款 ✅｜09-30 三模式＋引導頁 ✅ →
**10-01~10-02 APK 打包（硬期限）** → 10-03~05 四份英文文件 → 10-06~08 Poster＋影片 → **10-09 提交**

## 🚀 部署（09-28 上線，每次任務完成自動執行）

**正式網址：`https://app.labelbuddy-ai.workers.dev`**
- Worker 名稱 = `wrangler.toml` 的 `name`（`app`）｜**唯一可靠來源是 `wrangler deploy` 最後一行**
- 帳號 `kanhf28@gmail.com`｜Account ID `4ffa5d1a862bdbeaef2782f9b9774034`
- 憑證 `C:\Users\Spencer\AppData\Roaming\xdg.config\.wrangler\config\default.toml`
- Secret：`OPENROUTER_API_KEY`、`GEMINI_API_KEY`
- 版控 GitHub `Spencer-F3D/labelbuddy-ai`（Private）｜手機測試 `連線到手機.bat`（Tunnel，網址每次不同）

⚠️⚠️ **`git commit` 只是本機動作 —— 不上 GitHub、更不上線。** 每次任務完成**自動**跑：
`git push origin main` → `vite build` → `wrangler deploy` →
**驗證**線上首頁引用的 `assets/index-XXXX.js` 必須等於 `dist/assets/` 的檔名。

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
★ **紀錄跟隨「標籤本身的語言」**，與介面語言無關（09-29 定案：「照片是什麼語言，
紀錄就是什麼語言」）。`lang` 在建立時固定；介面語言 ≠ 標籤語言時用**本機引擎就地重新產生**
（純函式、離線、不花額度）。品名用 `extractFoodName`（**標籤原文品名**）。詳見 `ARCHITECTURE.md`。

## ⛔ Gemini 區域封鎖（已定案，不必重查）
使用者在中國澳門；Gemini 支援區域**不含中國澳門／香港／大陸**。
三把金鑰、三個帳號皆回 `400 FAILED_PRECONDITION`，檢查順序「身分 → 金鑰 → 區域」
→ **換帳號無用**。用 VPN 或謊報地區繞過屬服務條款問題，**不做**。
（完整錯誤碼對照見 `ARCHITECTURE.md`）

## ⚠️ AI 供應商與模型鏈（會變動，失敗時先重查）
現役主力 **OpenRouter**（Gemini 冷卻中）。`DEFAULT_MODEL_CHAIN` **上限 3 個**。
★ **免費模型會變動** → 失敗時先查 `GET /api/v1/models` 過濾 `pricing.prompt == 0`
  且 `input_modalities` 含 `image`（三個現役模型都支援圖片）。
★ 額度四層：雙供應商輪替｜健康冷卻｜**回應快取**（最有效）｜額度預檢。
⚠️ 多開金鑰／帳號**無效**（capacity 是全域治理，違反條款）。詳見 `ARCHITECTURE.md`。

## 🎓 6 身分（`LearnerProfileId`）
`senior`／`child` 6–12／`teen` 13–18／`fitness`／`takeout` 年輕人／`student`。
定義集中 `src/data/learnerProfiles.ts`，**前後端共用** → 必須**純資料**。
★ 名稱不得含評價性字眼（「長者三高」→**長者**、「年輕外食」→**年輕人**）；
身分卡片不得顯示說明文字（`audience` 已刪）。
⚠️ 兒童／青少年鈉糖上限明顯低於成人；**快取鍵必須含身分**；
`targets[].target` 是給人看的字串，**不能做數學運算**。

## 🗣️ 稱謂機制（性別）
`gender`（`male`/`female`/`unspecified`）**只影響怎麼稱呼，不影響任何判斷**。
雲端用 `buildAddressRule()` 追加 prompt；本機用 `applyHonorific*()` 確定性後處理。
★ **性別刻意不進快取鍵**（快取存中性文字，稱謂在輸出最後一步插入）；
英文一律不加稱謂；`QA_TEXT_FIELDS` **不含 `question`**。

## 🎨 字級縮放（非長者）
`<html data-density>` 由 `App.tsx` 依 `learnerProfileId !== 'senior'` 切換，
`index.css` 精準命中 16→14／18→16／19→17／20→18（**全域只有這 4 種**）。
⚠️ **新增第 5 種字級必須回來補一行**；寫在 `<html>` 而非包 div（fixed 元素蓋不到）。
★ **唯一例外：12px**（`LegalNotice.tsx`），刻意不受縮放影響 → `UI_RULES.md`。

## 📷 選圖入口
**兩個 hidden input**：一個有 `capture="environment"`（拍照）、一個**沒有**（相簿）。
★ 加了 `capture` 就等於拿掉「選相簿」（手機會直接開鏡頭）。

## 🚪 首次啟動引導頁（09-30 改版）
**頁數依身分**：長者 **9 頁**（教學分 3 頁）／其他 **7 頁**（教學 1 頁）。
順序：介紹→身分→**慢性病與過敏**→性別→教學→AI 方式→私隱。
★ 用 `StepId` 陣列而不是數字（寫死 `step === 4` 加一頁就全錯位）；
頁數在選完身分後才確定 → 進度指示總數會變；回頭改身分**必須對 step 夾取**；
`selectedConditions` 的 state **必須宣告在 `handleOnboardingComplete` 之前**。

## 🔤 難字簡化（09-30 使用者指定）
鈉→**鹽分**、膳食纖維→**纖維**、飽和脂肪→**動物油**、添加糖→**糖**（碳水化合物不變）。
★ **單一對照表**（`src/data/bilingual.ts` 的 `NUTRIENT_NAME_SIMPLE`）+ **進出邊界轉換**：
  提示詞給模型看簡化名稱；內部鍵（`numericLimits`／本機引擎／教學點）保持 **canonical**；
  `nutrient_facts.name` 輸出 canonical → 前端再依語言顯示。
  ★ 若在後端就寫死簡化名稱，**英文介面會露出中文**。
★ `nutrientName()` 會先 `canonicalNutrientName()` 再查表（兩個方向都安全）。
⚠️ **1mg 鈉 ≈ 2.5mg 鹽**，兩者不是同一件事，而且標籤印的是「鈉」——
  已在使用者知情下採用，結果頁加一行說明當安全網。
⚠️ **改中文文案時必須同步改 `localEngineEn.ts` 的對照鍵**（本專案已踩 4 次）。

## 💾 儲存鍵與「清除所有資料」
全部以 `labelbuddy` 開頭（語言／身分／性別／**分析模式**／慢性病／指標／紀錄／同意／引導頁／學習進度）。
★ 清除用**前綴掃描**（`k.startsWith('labelbuddy')`），不是寫死清單；
清完用 `location.reload()` 而非逐一重設 state（逐一重設會漏且不報錯）。
詳見 `ARCHITECTURE.md`。

## 📊 後端數值與文字處理
★ **鐵則：模型只讀出「含量」，百分比一律由後端重算**（`normalizeNutrientFacts`），
  而且**三條路徑都要套用**：雲端成功／**快取命中**／本機備援（漏掉快取會回傳舊格式）。
⚠️ **limit 與 target 方向相反**（鈉 120% 是壞事、蛋白質 120% 是好事）。
⚠️ 簡繁表只收「一對一無歧義」的字（后/後、干/乾、里/裡、面/麵、只/隻、發/髮 不列）。
  看到簡體字先查是不是新字不在表內，**別急著換模型**。細節見 `ARCHITECTURE.md`。

## 🧪 驗證機制（**改動翻譯／稱謂／快取／模式／引導頁後必跑**）
`check:i18n`（引擎輸出掃 CJK 15 組）｜`check:honorific`（29）｜`check:cache`（11）
｜`check:diet`（15）｜`check:mode`（**同意閘門 12，會實際啟動伺服器**）
｜`check:ui`（真實 Chrome 走 **17 畫面**）｜`verify:all`（全部）

★★ **靜態掃描（grep）只能找線索，不能當驗收。** 分不出條件分支（**假警報**）、
  抓不到執行時組出的字串（**漏報**）。最終一定要用瀏覽器實際渲染。
★★★ **「假通過」比紅燈危險得多。** 09-30 實例：`check-ui-cjk.mjs` 的引導頁偵測
  寫死 `Step 1 of 3`，引導頁改成 9 頁後偵測不到 → 15 個「畫面」全拍到引導頁，
  卻因為引導頁是英文而**全部通過**。已加防護：沒離開引導頁就 `process.exit(1)`。
  → **檢查腳本裡的「頁數／步驟數」一律用 `\d+`，不要寫死。**
★ `check-ui-cjk.mjs` 的引導頁段落**必須先勾同意勾選框**才能按「開始使用」，
  否則會卡在引導頁（全部誤判）。
★ 跑檢查時**不要用 `| head`** —— SIGPIPE 會殺掉 node 腳本，看起來像跑完了。
  要導到檔案再 `cat`。

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
