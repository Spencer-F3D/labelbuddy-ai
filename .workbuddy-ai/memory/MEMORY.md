# LabelBuddy AI — 專案長期筆記

## 🏆 【2026-09-27 新增】本專案是**比賽參賽作品**

| 項目 | 內容 |
| --- | --- |
| 比賽 | 2026 全球青少年人工智能未來創新競賽（**澳門中學生賽區**） |
| 主辦 | 聯合國大學駐澳門研究所、UNU 全球 AI 網絡、澳門電腦學會、MGM Macau |
| **提交截止** | **2026-10-09**（逾期不受理） |
| 複評 | 2026-11-01 ~ 11-16（線上）｜決賽 2026-11-26（澳門線下） |
| **語言** | **所有材料「只接受英文」**（含作品內容、海報、影片字幕、簡報、答辯） |
| 主題 | AI 與教育 |
| 章程位置 | 專案根目錄 `2026全球青少年人工智能未來創新競賽(澳門中學生賽區) (1).pdf`（**掃描版，無文字層，要渲染成圖才讀得到**） |
| 稽核與計劃 | `Desktop/LabelBuddyAI_功能稽核與執行計劃.pdf`（6 頁，2026-09-27 產出） |

**⚠️ 使用者本人就是參賽學生**（不是老師、不是家長）。
**⚠️ 使用者決定：不花錢（只用免費模型）、App 雙語排在後面但截止前必須完成。**

### 評審比重
問題與教育價值 20%｜創意與原創性 20%｜**AI 技術應用 25%**｜原型測試與成效 20%｜
英文表達 10%｜**倫理、安全與私隱 5%**

### 四條會致命的規則（改任何東西前先想一遍）
1. **「未使用英文」＝可不予評審** → App 介面雙語不能省
2. **「不能只提交概念、簡報、普通資料庫系統，或僅以固定規則模擬 AI」**
   → 本機規則引擎要謹慎呈現；雲端真實 AI 必須是主角
3. **報告須列明生成式 AI 工具名稱、版本、用途、學生完成的部分**
   → 隱瞞**直接取消資格**；誠實反而是加分項
4. **「不得提交學生不能合理理解及操作的系統」** → 學生要能解釋程式，評審可即場提問

### 要交的四個檔案（照章程命名規則）
`ProjectIntroduction_LabelBuddyAI.pdf`（≤2 頁）／`ResearchReport_LabelBuddyAI.pdf`（6–12 頁）／
`Poster_LabelBuddyAI.pdf`（0.8×1.1 m 直向）／`DemoVideo_LabelBuddyAI.mp4`（≤5 分鐘）

### 建議定位（尚未定案）
組別 **AI for Education**；定位從「食品辨識工具」改為**「AI 食育學習平台」**
（理由：已有食育學堂 + 食育教學三欄位 + 6 種學習者身分）；
SDG 3／4／12。

---

## ⚠️ 【2026-09-27 稽核發現】四個架構衝突（動工前必須先決策）

1. ★★★ **「本地 AI」在瀏覽器做不到**：清單假設手機 App 可讀 NPU／Android 版本／跑本地模型，
   但本專案是網頁 App + Node 後端。→ 建議**重新定義「本地」＝本機伺服器（筆電）**
2. ★★★ **「雲端只收文字」與現況相反，但這是好事**：
   現況送**原圖**給視覺模型（`server.ts:981`）。改成「本地 OCR → 文字 → 文字模型」後
   **同時**解掉：隱私、**免費解掉中文錯字（鈉→鈦）**、速度與額度。
   → **整份計劃裡最高價值且完全免費的改動**
3. ★ **「自動上傳」vs「預設不上傳」**：解法是「首次啟動的同意畫面」＝那個明確同意
4. ★ **人臉／姓名／學號／手部**：人臉可用 MediaPipe 在瀏覽器端偵測後**拒絕**；
   號碼格式可用規則比對；**手部不建議做**（拿標籤的手必然入鏡）

## 🚀 【2026-09-27 定案】部署架構：Cloudflare（不是 Vercel）

| 層 | 選擇 |
| --- | --- |
| 版控 | GitHub：`https://github.com/Spencer-F3D/labelbuddy-ai`（Private） |
| 手機測試 | **Cloudflare Tunnel**（`連線到手機.bat`，quick tunnel，網址每次不同） |
| 正式部署 | **Cloudflare Workers**（含靜態資源，前端＋API 同一個 Worker） |
| OCR 位置 | **前端（瀏覽器／WebView）**——不是伺服器 |
| APK | Capacitor ＋ ML Kit 裝置端 OCR |

**為什麼選 Cloudflare 而不是 Vercel**（官方文件查證）：
- **牆鐘時間無限制** vs Vercel 預設 10 秒（我們的 AI 呼叫要 12 秒）
- **請求體 100 MB** vs Vercel 4.5 MB（我們傳 base64 圖片）
- **沒有冷啟動**（V8 isolate）→ 決賽現場更可靠
- Workers 免費方案每請求 **10ms CPU** → **tesseract.js 不可能跑在上面**
  → 這正是「OCR 必須搬到前端」的原因

⚠️ 透過 Tunnel 存取時，**Vite 會擋下前端**（`403 Blocked request`，API 不受影響）
→ `vite.config.ts` 已加 `allowedHosts: ['.trycloudflare.com']`，
用環境變數 `VITE_ALLOWED_HOSTS` 可覆寫。

## 專案性質
超市食品標籤辨識 App，原為 60 歲以上長者設計，現擴為 **6 種身分共用**。
Vite 8 + React 19 + TypeScript(strict) + Tailwind 4 + Express 4。
`server.ts` 同時掛載 Vite 中介軟體，單埠 3000 服務前後端。
**AI：雙供應商輪替**（Google Gemini + OpenRouter），後端用 Node 內建 `fetch`，無 SDK 依賴。

## ⛔ Gemini 區域封鎖（已定案，不必重查）
使用者在中國澳門。Google Gemini API 官方支援區域**不含中國澳門／香港／大陸**。
**三把**不同金鑰、不同帳號皆回 `400 FAILED_PRECONDITION: User location is not supported`。
實驗證明檢查順序是「身分 → 金鑰 → 區域（依呼叫來源位置）」，故換帳號無用。
- 對照：無效金鑰回 `400 API_KEY_INVALID`（證明網路通）；無金鑰回 `403 unregistered callers`
- **唯一合規解法**：後端部署到支援區域（Vercel / 台灣 / 新加坡）→ 免費額度 50/日 → 約 1550/日（×31）
- 現況：以 OpenRouter 為主力；Gemini 程式碼保留，遇區域錯誤自動冷卻 6 小時
- ⚠️ 用 VPN 或謊報地區繞過屬服務條款問題，不建議

## ⚠️ 模型鏈（會變動，失敗時先重查）
`inclusionai/ling-3.0-flash-vl:free` 已轉付費（404）。現行 `DEFAULT_MODEL_CHAIN`：
| 模型 | 實測 | 特性 |
| --- | --- | --- |
| `dots-studio/dots-3-note-preview:free` | 1.6~2.3 秒 | 品質最佳 |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 0.6 秒 | 最快、敘述精簡 |
| `qwen/qwen3.8-27b:free` | 常 429 | 備援 |

**踩到的坑**：OpenRouter `models` 降級陣列**上限 3 個**，放 4 個回
`400 'models' array must have 3 items or fewer`。`getModelChain()` 已 `.slice(0, 3)`。
**免費模型會變動**：雲端突然失敗時，先查 `GET /api/v1/models` 過濾
`pricing.prompt == 0` 且 `input_modalities` 含 `image`。

**除錯心得**：OpenRouter 會快取相同請求 →「重複測試看起來很快」但真實請求慢得多。
驗證延遲時務必在提示詞加唯一編號避開快取。

## 💰 額度節省設計（使用者要求「兩個一起用，不要很快用完」）
1. **雙供應商輪替**：`orderedProviders()` 依「今日已用 / 每日上限」比例排序
2. **健康冷卻**：一般失敗連續 2 次 → 冷卻 10 分鐘；永久性錯誤（區域封鎖）→ 立即冷卻 6 小時
3. **回應快取**（最有效）：圖片 SHA-256 + 慢性病 + **身分**為鍵，TTL 24 小時
   （實測 5065ms → 7ms）
4. **額度預檢**：`getOpenRouterQuota()` 查 `GET /api/v1/key`（快取 60 秒、不耗額度），
   `remaining == 0` 時直接跳過

## ❌ OpenRouter 額度：多開金鑰／帳號無效
官方：「Making additional accounts or API keys will not affect your rate limits,
as we govern capacity globally.」→ 額度是**全域治理**。多開違反服務條款。

| 累計購買點數 | 每分鐘 | 每日 |
| --- | --- | --- |
| 未購買 | 20 | **50** |
| ≥ 10 點數 | 20 | **1000** |

- 真實用量看 `GET /api/v1/key` 的 **`free_model_daily_requests`**（`{used, limit, remaining}`），
  `limit_reset: "daily"` → 每日重置
- ⚠️ 同回應中的 `limit` / `limit_remaining` 是 **per-key 信用上限**，不是免費請求數（易混淆）
- 唯一合法提升方式：一次性買 ≥ 10 點數（累計）→ 50/日 變 1000/日

## ⚠️ 小型免費模型的中文字元不可靠（尚未完全解決）
判斷結論與數字可靠，但**個別中文字會錯**（同一個「鈉」出現鈣／鈦／無糖低鈣）。
- 已做：提示詞術語規則、簡繁後處理（見下方）
- **無法用字串修**：鈉→鈦 是同音形近的**字元替換**
- 建議：正式上線改付費模型，`.env` 設 `OPENROUTER_MODEL` 即可切換，程式不用改

## 🔤 簡繁後處理
`server.ts` 的 `SIMPLIFIED_TO_TRADITIONAL` 只收「簡繁一對一無歧義」的字
（后/後、干/乾、里/裡、面/麵、只/隻、发/發/髮 一律不列）。
09-25 仍出現「购買」「过敏」→ 已補約 90 字（过/购/严/响/头/岁/儿/学/应/该/万/产/矿/准…）。
**日後又看到簡體字，先查是不是新字不在表內，別急著換模型。**

## 🎓 6 身分（`LearnerProfileId`）
底部導航 **4 欄**：拍照辨識／健康設定／飲食紀錄／食育學堂。
身分：`senior` 長者三高｜`child` 兒童 6～12 歲｜`teen` 青少年 13～18 歲｜
`fitness` 健身增肌｜`takeout` 年輕外食｜`student` 學生。

**定義集中在 `src/data/learnerProfiles.ts`，前端與後端共用同一模組**
→ 該檔必須保持**純資料**，不得引入瀏覽器或 Node 專屬 API。
新增身分只要改這個檔，後端提示詞（`buildSystemInstruction`）自動跟上。

每個身分都有 `numericLimits: Record<名稱, {value, unit}>` —— 供「佔每日上限幾 %」換算。
`targets[].target` 是給人看的字串（"2000 毫克"），**不能拿來做數學運算**。
⚠️ 兒童／青少年鈉糖上限明顯低於成人（鈉 1200/1600 vs 2000），不可沿用 `SODIUM_STANDARD`。

⚠️ **快取鍵必須含身分**：同一包高蛋白粉對健身族綠燈、對腎臟病患紅燈。

**實測證明身分有效**（同圖同病、唯一變數為身分）：
健身 → green「適合健身增肌食用」；長者 → yellow「鈉含量偏高，需注意」。

## 📊 nutrient_facts — 「佔每日上限幾 %」管線
**最重要原則：模型只讀出「含量」，百分比一律由後端重算。**
小型免費模型算 `2480 ÷ 2000 × 100` 會錯，且錯得無聲無息。

- `server.ts` 的 `normalizeNutrientFacts(raw, numericLimits)`：用每日上限**覆蓋**模型算的
  percent，補上 `dailyLimit` / `direction`，過濾（最多 3 項、≥30%、依嚴重度排序）統一在這裡
- **三條路徑都要套用**：雲端成功、**快取命中**、本機備援（漏掉快取會回傳舊格式）
- `smartNutritionAnalyzer.ts` 的 `buildLocalNutrientFacts()` +
  `analyzeNutritionWithIndicators(profile, conditions, numericLimits?)`
  → **離線時長條圖不會消失**

⚠️ **門檻是 30% 不是 50%**：50% 常讓對照表只剩 1 項，30% 才給得出 2～3 項。改動前用真實標籤驗證。
⚠️ **limit 與 target 方向相反**：鈉 120% 是壞事、蛋白質 120% 是好事。
`NutrientFactBars.tsx` 的 `factTone()` 分開處理，不可共用閾值。

## 🎨 設計權杖 `src/theme.ts`
改版前 15 種字級、16 個 `border-4`、色彩無語意 → 每張卡都在搶注意力。
收斂成：5 語意色（safe/caution/danger/action/neutral）、字級、3 層邊框、4 級間距、
觸控尺寸、`CARD_BASE` / `CONCLUSION_CARD_BASE` / `FOOTER_CTA*`，
以及 `toPercent / percentTone / describePercent / barWidth`。

**依據是長者三項生理變化**：
1. 水晶體黃化（藍光被吸收）→ 藍色只給「可操作」，不承載安全/危險語意
2. 周邊視野縮減 → 關鍵資訊集中中央主欄
3. 對比敏感度下降 → 內文一律深色，不用淺灰

**三重編碼鐵則**：`RISK_TONE` / `RISK_ICON` / `RISK_LABEL` 必須一起用
（紅綠色盲在男性約 8%，只靠顏色等於讀不到結論）。

**結果頁三層**：① 結論 ② 為什麼（百分比長條＋白話＋語音鈕）③ `<details>` 更多資訊。
**首頁 3 塊**：身分條／拍照卡／示範與測試（折疊）。

## 🔤 字級規則：全域 16–20px（2026-09-25 使用者指定）
**所有實際顯示的文字只能是 16 / 18 / 19 / 20px 這四種，不得有其他值。**
`theme.ts` 的 `TYPE`：`conclusion` 20（頁面主標 + 結論）／`title` 19（卡片標題）／
`emphasis` 18（強調數字、按鈕、徽章）／`body` 16（所有說明與敘述，**字級地板**）。
`secondary`／`caption`／`micro` 是 **deprecated 別名，全部指向 16px**
（保留是為了不逐一改舊呼叫點；新程式碼一律用 `body`）。

⚠️ **16px 是地板**：低於 16px 的免責文字對長者等於不可讀。
要弱化某段文字請改顏色（`text-slate-600`），**不要縮字級**。

⚠️ **級距只有 4px（16→18→19→20）→ 相鄰兩級幾乎看不出差別。**
「用字級表達重要性」這招已經失效，請改用 `WEIGHT`（strong / normal）
＋ `TONES`（語意色）＋ **位置**（中央主欄優先）。

⚠️ **兩個容易漏掉的 Tailwind 預設字級**（因 `:root{font-size:20px}` 被放大）：
`text-xs` = **15px**、`text-sm` = **17.5px** — 兩者都**低於** 16px 地板且超出規則。
改字級時必須同時 grep `text-\[[0-9]*px\]` **和** `text-(xs|sm|base|lg|xl)`。

⚠️ **emoji 用 `w-[Npx] h-[Npx]` 控制，不要用 `text-[Npx]`**。
這樣「字級一律 16–20px」才能用 grep 機械驗證（emoji 不干擾）。

**哪些檔案要改**：`App.tsx`、`theme.ts`、`NutrientFactBars`、`LearnerProfilePicker`、
`FoodEdClassroom`、`VitalMetricsSection`、`DietHealthHistory`。
⚠️ **`VitalMetricsSection` 不是死碼**，它真的渲染在「健康設定」頁。

## 📐 折行品質：什麼才算「有礙閱讀」
**不是所有折行都是問題。** 一句 18 字的中文在 360px 上本來就塞不進一行，
折成 2 行是正確行為，硬不讓它折反而會溢出。真正該修的是這三類：

| 類別 | 判定 | 為什麼 |
| --- | --- | --- |
| **被擠壓折行** | 實際行數 > `ceil(估算文字寬 ÷ 可用寬)` | 明明塞得下卻折行 → 排版被擠壓 |
| **孤行 orphan** | 末行 < 3 字且非句尾標點 | 長者要回頭掃那 1~2 個字，代價很高 |
| **行數過多** | ≤22 字的句子折 ≥4 行 | 欄寬太窄或字太大 |

**驗證工具**：`sandbox-build-verify/scripts/check-wrapping-quality.mjs`
（舊的 `check-responsive-layout.mjs` 把**任何多行**都當問題 → 255 筆假警報，別再用它驗折行）

兩個實作關鍵（否則又會一堆假警報）：
1. **量「真正承載文字的葉節點」**，不要量 `<button>` 本身。
   導航鈕 66px 高 ÷ 19.2px 行高 = 3.4 → 會誤判 3 行，實際文字只佔 19px = 1 行。
2. **`whiteSpace: nowrap` 的元素永遠算 1 行。**

**三個常見的擠壓根因與解法**：
1. `flex` 子項預設 `min-width:auto` → 被最長一行撐寬，擠掉同層元素。
   **解法：加 `min-w-0`**（慢性病卡片就是這個問題）。
2. 一行塞太多東西（標籤 + 2 個按鈕）→ **解法：改 `flex-col` 上下堆疊或加 `flex-wrap`**。
3. flex 自動分配的欄寬不可預期 → **解法：改用 `grid-cols-[30px_1fr]` 固定欄寬**。

⚠️ 有些標籤**本來就該強制單行**：`nowrap`（避免被擠壓）＋ 外層 `flex-wrap`（避免溢出）。
目前已加：導航標籤、狀態徽章、快選膠囊、單位切換鈕、篩選 chips。

## 📱 16:9 手機版面 + 桌機手機框
使用者手機是 16:9 直向（CSS 視窗 360×640，DPR 3）。

**桌機**用 `min-[520px]:` 斷點包手機框（**<520px 完全不套用，零回歸**）：
- 外框 `w-[380px] h-[660px]`（border-box）→ **內容區剛好 360×640**
- ⚠️ 設 `w-[360px]` 內容區只剩 340px，導航按鈕會從 83px 縮到 78px
- 實測：外框 380×660 @ (530, 24)，左右留白各 530px

**連帶必改 4 處**（漏改就壞）：
1. **overlay 寫 `fixed inset-0 min-[520px]:absolute`**（不可只寫 `absolute`！）
   - `App.tsx` Loading 遮罩、`DietHealthHistory.tsx` 匯出彈窗
   - ⚠️ 手機容器是 `min-h-screen`，內容長時**比視窗高**，只寫 `absolute` 會以「文件」
     為基準置中 → spinner 掉出視窗外（實測 y≈560）
2. footer `sticky bottom-0` → `shrink-0`
3. 主內容容器加 `min-h-0 min-[520px]:overflow-y-auto`
4. 移除內層 `max-w-md mx-auto`（nav / footer）

**固定列實測合計 274px**（header 95 + nav 87 + footer 92）；底部 CTA `min-h-[72px]`。

### ⚠️ 三個關鍵陷阱（改 UI 前務必記得）
1. **`:root { font-size: 20px }`** → Tailwind 所有 rem 間距**放大 1.25 倍**
   （`py-4`=20px、`w-9`=45px）。要精確尺寸用任意 px（`py-[8px]`）。
   → 連帶讓 `text-xs`=15px、`text-sm`=17.5px（見上方字級規則）。
2. **文字折行會默默撐高元素**（不是 min-h 在管）。
   但**不是所有折行都是問題** → 判定標準見下方「折行品質」段。
3. **框內截圖 `captureBeyondViewport` 無效**（`overflow-hidden` 會裁掉）。
   要拍框內長頁面得 `document.querySelector('main').scrollTop = N` 分段截。

**固定列實測 270px**（header 92 + nav 86 + footer 92）；底部 CTA `min-h-[72px] text-[20px]`。

## 已知環境陷阱
- `package.json` 的 `esbuild` 必須 ≥ `^0.28.0`，否則 `npm install` ERESOLVE（vite 8.3.0 peer）
- `npm start` 需搭配 `NODE_ENV=production`，否則會以開發模式啟動並嘗試載入 Vite 中介軟體
- 環境變數檔名必須是 `.env`（`dotenv.config()` 不讀 `.env.local`）
- 沙箱內第二次跑 `npm run build` 會被 safe-delete 擋下（`dist/assets` 超過門檻 50）。
  改用 `npx vite build --outDir .verify-dist` 驗證（詳見 `sandbox-build-verify` 技能）
- `npm run clean` 已改為跨平台 node 指令（原本 `rm -rf` 在 Windows cmd 會失敗）
- `autoprefixer` 已移除（Tailwind 4 走 `@tailwindcss/vite`）

## 📱 APK 打包（2026-09-24 評估，尚未決定）
**架構限制**：前端 `fetch('/api/analyze-label')` 用相對路徑，且 **API 金鑰只在後端**
→ **純離線 APK 會讓雲端辨識完全失效**，APK 必須指向一個後端。

- 本機**完全沒有** JDK / Android SDK / Gradle 快取；Node 22.22.2、網路全通
- 建議工具鏈裝 `D:\android-dev\`（C 槽吃緊，D 槽 204GB）
- Capacitor：`@capacitor/android` 8.5.2、minSdk 24、compileSdk/targetSdk 36、
  AGP 8.13.0、Gradle 8.14.3；JDK Adoptium Temurin 21.0.12+101.0.LTS

**方案**：① Capacitor APK + Vercel 後端（推薦，且 Gemini 復活×31）
② PWA（零工具鏈，但非 .apk）③ 真離線 APK（工程量大且金鑰可被反編譯）

**Vercel 風險**：檔案系統唯讀（快取重啟即清）、請求上限 4.5MB、執行時間限制、
金鑰必須存環境變數不進 Git。

## 使用者決策與節奏
1. **孤立程式碼保留**：未引用的元件與端點暫不刪。
2. **本機備援引擎暫不修改**：使用者計畫改用「手機端量化視覺模型」取代規則引擎。
3. **工作節奏：一律先給計劃、確認後才動檔案。**
4. 使用者說「**Google**」時常指 **Chrome 瀏覽器**，不是 Google 服務。
   曾猜錯三次，最後問「你是從哪裡打開的」才問出是 `.bat`。**遇到模糊指涉先問來源。**

## 📄 專案交接文件（2026-09-26 產出）
`docs/專案交接文件.md`（+ 同名 `.pdf`）——把專案現況完整交接給「下一個對話」，
讀者假設**完全沒有先前對話記憶**。11 章，重點是第 3 章「關鍵不變式（改動前必讀）」。
**新對話開始時先讀這一份**，可省下大量重新探索。
歸檔副本：`Desktop/workbuddy_work/PDF|TYP/20260926_1735_workbuddy_專案交接文件.*`
