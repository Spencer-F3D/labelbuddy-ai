# LabelBuddy AI — 銀髮安心食守護者

專為 60 歲以上長者設計的超市食品成分智能放大鏡與健康評估助手。

長者拍下食品包裝背後的成分與營養標示，系統以「紅／黃／綠」三色直覺交通燈給出結論，
並用長者聽得懂的大白話（含語音朗讀）說明這包食品能不能買、為什麼。

---

## 技術架構

| 層 | 技術 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite 8 |
| 樣式 | Tailwind CSS 4（透過 `@tailwindcss/vite`，無 `tailwind.config`） |
| 圖示 | lucide-react |
| 後端 | Express 4（同時掛載 Vite 中介軟體，單一埠同時服務前後端） |
| AI | 雙供應商輪替：Google Gemini + OpenRouter（免費視覺模型） |
| 語音 | 瀏覽器原生 Web Speech API（`src/utils/tts.ts`） |

前端不持有任何 API 金鑰。所有 AI 呼叫一律經由後端代理（`server.ts`）轉發。
後端使用 Node 內建的 `fetch`，未依賴任何廠商 SDK。

### 為什麼要雙供應商

兩家都有免費額度，但都有上限：

| 供應商 | 免費額度 | 從中國澳門可用 |
| --- | --- | --- |
| Google Gemini | 5 次/分、1500 次/日 | ❌ 官方支援區域不含中國澳門 |
| OpenRouter | 約 50 次/日（未儲值帳號） | ✅ |

**Gemini 的區域限制實測結果**（兩把不同的金鑰都一樣）：

```
GET  /v1beta/models                      → 400 FAILED_PRECONDITION: User location is not supported for the API use.
POST /v1beta/models/...:generateContent  → 400 FAILED_PRECONDITION: User location is not supported for the API use.
對照：故意用無效金鑰                     → 400 API_KEY_INVALID
```

無效金鑰的對照組證明網路與 SDK 都正常，問題純粹在區域。這是服務層級的限制，
**不是金鑰問題，改任何程式碼都無法解決**。

#### 換金鑰、換帳號都沒用

有人會直覺想「多申請幾個帳號就好了」。實測四種請求來判斷區域檢查的發生時機：

| 請求 | 回應 |
| --- | --- |
| 完全不帶金鑰 | `403 PERMISSION_DENIED: Method doesn't allow unregistered callers` |
| 帶無效金鑰 | `400 API_KEY_INVALID` |
| 帶有效金鑰 | `400 FAILED_PRECONDITION: User location is not supported for the API use.` |

順序是「**身分檢查 → 金鑰有效性 → 區域檢查**」。注意未帶金鑰時**不會**出現區域錯誤，
代表區域不是 pre-auth 的網路層阻擋，而是在金鑰被接受之後、依**呼叫來源的位置**判定。

**只要還是從同一個地方呼叫，換幾個 Google 帳號結果都一樣。** 兩把不同金鑰得到
完全相同的錯誤，也印證了這點。

真正能改變結果的只有「呼叫來源的位置」：把後端部署到支援區域（台灣／新加坡／日本），
或改用無區域限制的供應商（本專案目前的 OpenRouter 方案）。
以 VPN 或謊報帳號地區繞過屬服務條款問題，不建議。

程式仍保留 Gemini 的完整介接：啟動時會嘗試一次，偵測到區域錯誤後自動冷卻 6 小時跳過，
不會每次掃描都浪費一次往返。若日後環境改變（例如後端部署到支援區域），把金鑰填好即可自動啟用。

### 輪替演算法

`orderedProviders()` 依「**今日使用率**」排序，使用率低者優先：

```
使用率 = 今日已用次數 / 該家每日上限
```

例如 Gemini 用了 1/1500、OpenRouter 用了 1/50，下一輪會優先選 Gemini，
讓兩邊額度平均消耗，而不是先把一家用完。

健康狀態會即時追蹤：

- 一般失敗：連續 2 次才進入冷卻 10 分鐘
- **永久性錯誤**（如區域封鎖）：立即冷卻 6 小時
- 冷卻中的供應商會被跳過，不影響另一家運作

### 回應快取（省額度最有效的手段）

同一張圖片 + 同一組慢性病，在 TTL（預設 24 小時）內直接回傳上次結果，
**完全不呼叫 API**。長者常會重複掃描同一件商品，這能省下可觀的額度。

快取以圖片的 SHA-256 加上排序後的慢性病清單為鍵。實測第二次掃描同一張圖：
**5065ms → 7ms**，`cached: true`，API 用量不變。

TTL 可用 `AI_CACHE_TTL_MS` 調整，快取上限 200 筆（FIFO 淘汰）。

### 免費額度的真相：多開金鑰沒有用

OpenRouter 官方文件明確寫道：

> Making additional accounts or API keys will not affect your rate limits,
> as we govern capacity globally.

**額度是「全域治理」的，不是 per-key。** 所以：

- 同一個帳號底下多建幾把金鑰 → 上限不變
- 多開幾個帳號 → 官方說也不會提高（而且是服務條款問題）

**實際額度分級**（由「累計購買點數」決定，與 `is_free_tier` 無關）：

| 累計購買點數 | 每分鐘 | 每日 |
| --- | --- | --- |
| 未購買 | 20 次 | **50 次** |
| ≥ 10 點數 | 20 次 | **1000 次** |

`GET /api/v1/key` 的 `free_model_daily_requests` 欄位會回報真實用量：

```json
"free_model_daily_requests": { "used": 35, "limit": 50, "remaining": 15 }
```

`limit_reset` 為 `daily`，**每日重置**。

**唯一能合法提高上限的方法**：一次性購買 ≥ 10 點數（累計，非每月），
每日上限即由 50 提升到 1000（20 倍）。免費模型本身仍是 $0/次，
買點數只是提高「請求次數上限」，不會產生額外費用。

本專案的 `/api/ai-status` 已整合此查詢（快取 60 秒，查詢本身不消耗額度），
並在 `remaining` 為 0 時直接跳過 OpenRouter，省下一次註定失敗的往返。

---

## 環境需求

- Node.js 22 以上
- 一組 OpenRouter API Key（**選用，但強烈建議**，見下方說明）

---

## 安裝與啟動

```bash
npm install
```

### 設定 API 金鑰

到 https://openrouter.ai/keys 申請金鑰，然後：

```bash
cp .env.example .env
```

`.env` 內容：

```
OPENROUTER_API_KEY="sk-or-v1-..."
```

> ⚠️ **檔名必須是 `.env`。**
> 伺服器使用 `dotenv.config()`，它預設只讀取 `.env`。
> 命名為 `.env.local`、`.env.development` 等都不會被載入，金鑰會靜默失效。

`.env` 已被 `.gitignore` 排除，不會被提交。

### 啟動

```bash
npm run dev
```

開啟 http://localhost:3000

---

## ⚠️ 沒有設定 `OPENROUTER_API_KEY` 會發生什麼事

這點很重要，請務必了解：

1. 標題列的狀態徽章會顯示「**本機備援引擎**」而不是「雲端 AI 辨識」。
2. 所有掃描會改走 `server/` 底下的本機規則引擎，**不會真正辨識你拍的那張照片**。
3. 目前的本機備援引擎（`server/smartNutritionAnalyzer.ts`）是**依圖片位元組長度**在三組寫死的
   營養資料之間輪替，**與照片實際內容無關**。也就是說它可能對任何食品回覆捏造的結論。

同樣的降級也會在雲端連續失敗時發生（見下方「延遲與穩定性」）。

因此：**請務必設定金鑰，並注意降級時結果不可信。**

---

## 模型選擇與參數（實測結論）

`server.ts` 的 `DEFAULT_MODEL_CHAIN` 定義了免費模型的優先序。2026-09-23 以同一張高鈉泡麵標籤實測：

| 模型 | 結果 |
| --- | --- |
| `inclusionai/ling-3.0-flash-vl:free` | ✅ 1.2~1.8 秒，`cost=0`，正確讀出鈉 1980mg，並從成分表抓到「花生油」觸發過敏警示 |
| `google/gemma-4-31b-it:free` | ❌ 持續 429（上游 Google AI Studio 限流） |
| `qwen/qwen3.8-27b:free` | ❌ 持續 429 |

因此以 `ling-3.0-flash-vl` 為首選，其餘作為備援。可用 `.env` 的 `OPENROUTER_MODEL` 覆寫。

### 兩個關鍵參數（改動前請先讀）

**1. 必須關閉推理模式**（`reasoning: { enabled: false }`）

`ling` 是推理型模型，預設會先產生大量思考 token（實測 766~1804 個），造成兩個後果：

- 正式回答的 token 額度被吃光，JSON 被截斷（`finish_reason=length`）
- 單次請求超過 45 秒

實測關閉推理後，同一張標籤的回應時間由 **45 秒以上降到約 1.8 秒**。

**2. 提示詞必須限制輸出長度**

未限制時模型會寫出約 3000 tokens（2000+ 中文字）的長篇，端到端實測 **40~140 秒**，
對在超市貨架前的長者完全不可用。提示詞中已加入明確字數上限
（`plain_summary` ≤ 80 字、`alternative_advice` ≤ 60 字等），
加上關閉推理後，端到端延遲降到 **3~6 秒**。

> 附帶效益：限制長度同時改善了語音朗讀體驗——朗讀 2000 字對長者毫無意義。

### 延遲與穩定性

- 免費模型**會被上游間歇性限流（429）**。`callAiModel` 內建 3 次嘗試與指數退避
  （0 / 1.5 / 3.5 秒），單次逾時上限 45 秒（可用 `AI_REQUEST_TIMEOUT_MS` 調整）。
- 三次全失敗時會降級至本機備援引擎，此時 `analysis_mode` 為 `smart_nutrition_engine`。
- OpenRouter 免費層有每日請求數上限（未儲值帳號通常為 50 次/日）。

---

## 可用的 npm 指令

| 指令 | 說明 |
| --- | --- |
| `npm run dev` | 啟動開發伺服器（Express + Vite 中介軟體，埠 3000） |
| `npm run build` | 建置前端（`vite build`）並打包後端為 `dist/server.cjs` |
| `npm start` | 執行正式版後端 |
| `npm run preview` | 預覽 Vite 建置產物 |
| `npm run lint` | 型別檢查（`tsc --noEmit`） |
| `npm run clean` | 清除 `dist/` |

> `npm start` 需搭配 `NODE_ENV=production`，否則 `server.ts` 會以開發模式啟動並嘗試載入 Vite 中介軟體。
> Windows PowerShell：`$env:NODE_ENV="production"; npm start`

---

## API 端點

| 方法 | 路徑 | 狀態 | 說明 |
| --- | --- | --- | --- |
| POST | `/api/analyze-label` | 使用中 | 接收標籤圖片 Base64 + 慢性病史 + 生理指標，回傳三色風險評估 |
| GET | `/api/ai-status` | 使用中 | 回報金鑰與模型就緒狀態（**請以 `hasKey` 欄位判斷，勿只看 `status`**） |
| GET | `/api/health` | 使用中 | 健康檢查 |
| POST | `/api/analyze-indicators` | ⚠️ 無人呼叫 | 生理指標大白話分析。前端入口元件未被引用 |
| POST | `/api/ask-health-question` | ⚠️ 無人呼叫 | 長者健康問答。前端入口元件未被引用 |

---

## 專案結構

```
├── server.ts                       # Express 伺服器：Vite 中介軟體 + API 端點 + AI 代理（OpenRouter）
├── server/                         # 本機備援引擎（無金鑰或斷網時使用）
│   ├── smartNutritionAnalyzer.ts   #   食品營養規則引擎
│   ├── smartIndicatorAnalyzer.ts   #   生理指標大白話分析
│   └── smartHealthQA.ts            #   常見健康問答
├── index.html                      # 網頁入口
├── metadata.json                   # AI Studio Applet 元數據
├── vite.config.ts                  # Vite 設定
├── tsconfig.json                   # TypeScript 編譯規則
├── .env.example                    # 環境變數範本
└── src/
    ├── main.tsx                    # React 掛載點
    ├── App.tsx                     # 主控制器：三個分頁、狀態、掃描流程、語音
    ├── index.css                   # Tailwind 入口與全域樣式
    ├── types.ts                    # 全域型別定義
    ├── components/                 # UI 元件（14 個）
    ├── data/                       # 靜態資料（慢性病清單、示範紀錄、示範標籤）
    └── utils/
        ├── tts.ts                  # Web Speech API 封裝（粵語優先、語速 0.88）
        └── imageCompression.ts     # Canvas 前端壓縮（長邊 1024px、JPEG 0.8）
```

### 目前的三個分頁

1. **📸 拍照辨識** — 拍照／選圖／一鍵載入示範標籤，顯示三色結論與語音朗讀
2. **🩺 健康設定** — 血壓／心跳／血糖量測，以及慢性病與過敏原勾選
3. **📊 飲食紀錄** — 一週 A／B／C 分級、三色比例、匯出健康週報給家人

---

## 已知落差與待辦

以下是目前程式碼與設計文件之間**尚未對齊**的地方，修改前請先確認方向：

### ⚠️ 最優先：免費模型的字元可靠度

`inclusionai/ling-3.0-flash-vl:free` 是 27B 等級的免費模型，**判斷結論是可靠的，
但個別中文字會出錯**。同一個「鈉」字，連續四次實測出現三種不同寫法：

| 次數 | 實際輸出 | 正確應為 |
| --- | --- | --- |
| 1 | 鈣含量超高（1980毫克） | 鈉含量超高 |
| 2 | ✅ 鈉含量超高（1980毫克） | — |
| 3 | 鈦含量超高（1980毫克） | 鈉含量超高 |
| 4 | 無糖低鈣 | 無糖低鈉 |

（鈣 = calcium、鈦 = titanium，都是錯的；正確的是鈉 = sodium。）

**風險評估**：`risk_level`、`warning_title`、`matched_conditions` 與營養數字都是正確的，
受影響的是 `plain_summary` 的敘述文字。也就是說**結論不會錯，但說明會出現看不懂的字**。

**已做的緩解**：

- 提示詞中把術語規則提到第 2 條，並附上錯誤／正確示範（有效但非 100%）
- 新增簡體→繁體後處理（`SIMPLIFIED_TO_TRADITIONAL`），修正了實測出現的「过敏 → 過敏」
- 該對照表只收錄「簡繁一對一且無歧義」的字，刻意排除 后/後、干/乾、只/隻 這類有歧義者

**無法用字串處理修好**：鈉 → 鈦 是同音／形近的**字元替換**，不是簡繁問題，
用對照表改不了，硬改又有誤傷正確文字的風險。

**建議方向**：正式上線時改用付費模型。OpenRouter 上有多個中文表現更好的視覺模型，
只要在 `.env` 設定 `OPENROUTER_MODEL` 即可切換，程式不用改。
免費層的瓶頸是中文輸出可靠度，不是辨識能力。

### 1. 慢性病項目：文件寫 12 項，實際只有 4 項

`src/data/conditions.ts` 定義了完整的 12 項慢性病，`server/smartNutritionAnalyzer.ts`
也比對了 12 項。但現役的 `App.tsx` 只實作了 4 項勾選（高血壓、糖尿病、腎臟病、花生過敏），
且只把這 4 個名稱傳給後端。

**影響**：痛風、高血脂、心血管疾病、胃食道逆流、骨質疏鬆、海鮮過敏、乳糖不耐、麩質過敏
這 8 項的把關邏輯永遠不會被觸發。

### 2. 14 個元件中有 11 個未被任何地方引用

`Header`、`FunctionSwitchBar`、`CaptureSection`、`CameraViewfinderModal`、`ResultDisplay`、
`AnalysisStatus`、`HealthSettings`、`PhysicalIndicatorSection`、`SeniorHealthQASection`、
`SettingsModal`、`UsageGuideModal` — 共約 4,300 行。

連帶使得以下功能**目前點不到**：

- 一鍵放大鏡／特大字體模式、高對比主題（在 `SettingsModal`）
- 語速、音量、自動播報開關、防連按 debounce（在 `SettingsModal`）
- 語音發問與飲食諮詢（在 `SeniorHealthQASection`）
- 生理指標 AI 分析與超市買菜指南（在 `PhysicalIndicatorSection`）
- 相機取景框（在 `CameraViewfinderModal`）、使用說明（在 `UsageGuideModal`）

### 3. 本機備援引擎不具備實際辨識能力

見上方「沒有設定 `OPENROUTER_API_KEY` 會發生什麼事」。

**這一項目前比以往更值得注意**：現在雲端 AI 已經可以正常運作，代表本機備援引擎只在
「無金鑰」或「雲端連續失敗（含免費層限流）」時才會啟動。而 `App.tsx` **不會把
`analysis_mode` 顯示給使用者看**，所以長者無法分辨眼前的結論是真的 AI 辨識，還是規則引擎
用圖片長度猜出來的。

建議後續處理方向（任選）：

- 在掃描結果卡片上加一個明顯標示，區分「雲端 AI 辨識」與「本機備援（僅供參考）」；或
- 雲端失敗時直接回傳錯誤（HTTP 503），讓長者看到「請稍後再試」而不是捏造的結論。

長期方向仍是改為在手機端部署量化的視覺辨識模型，取代目前的規則引擎。

### 4. 生理指標有三個欄位無法從 UI 修改

`kidneyStatus`、`symptoms`、`ageGroup` 在現役的 `VitalMetricsSection` 中沒有對應操作介面，
但 `App.tsx` 會寫入硬編碼預設值。後端所有症狀相關的分支因此永遠不會觸發。

### 5. 語音語系寫死為粵語

`App.tsx` 有 8 處 `preferLanguage: 'cantonese'`，按鈕文案也寫死「（粵語）」。
在未安裝粵語語音包的裝置上會自動降級為中文發音，但文案不會跟著變。

### 6. 後端接受前端傳入的 API 金鑰

`server.ts` 的三個端點都接受 `x-gemini-key` 標頭或 `body.apiKey` 作為金鑰來源，
優先序為：前端傳入 → 環境變數。

目前只有 `PhysicalIndicatorSection` 與 `SeniorHealthQASection` 這兩個**未被引用的元件**
會傳送它，現役的 `App.tsx` 從不傳送。

這是「使用者自備金鑰」的設計而非漏洞（洩漏的只會是使用者自己的金鑰），
但由於端點沒有任何速率限制，對外開放時建議一併評估。
**移除這條路徑前請先確認是否要接回上述兩個元件，否則會靜默失效。**

---

## 授權

Apache-2.0
