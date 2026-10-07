/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 長者常見健康疑問大白話解答引擎 (Senior Common Health Q&A Smart Engine)
 * ============================================================================
 * 專為長者日常提問設計：100% 轉換為大家聽得懂的大白話！
 * 依據長者輸入的身體指標（血壓、血糖等）進行個人化溫馨回覆。
 */

import { SeniorPhysicalIndicators, HealthQuestionAnswer } from '../src/types';

export function answerSeniorHealthQuestion(
  question: string,
  indicators?: Partial<SeniorPhysicalIndicators>,
  /**
   * 輸出語言。
   *
   * ⚠️ 這是**斷網後備**路徑（雲端 AI 是主要路徑）。
   *    但這裡有個中文路徑沒有的問題：**關鍵字比對是中文的**
   *    （`q.includes('咖啡')`…），英文提問一個字都對不上，
   *    會直接掉到最後的「通用解答」。
   *    → 所以英文必須**另寫一份**，連關鍵字一起換掉，
   *      不是把中文字串翻譯過來就好。
   *
   * 做法：英文走 `answerInEnglish()`，完全不動下面既有的中文邏輯
   *      （那條路徑已上線且經過驗證，不動它最安全）。
   */
  language: 'zh-TW' | 'en' = 'zh-TW',
  /**
   * ★ 2026-10-07 新增：**為什麼**走到這條路徑。
   *
   * 【為什麼需要這個參數】
   *   這條路徑原本一律假設自己是「連不上 AI 的後備」，
   *   所以英文的通用回覆寫著「I could not reach the AI right now」。
   *
   *   但「只在本機」模式的使用者是**主動選擇**不把問題送給 AI ——
   *   他是有連線的。告訴他「連不上 AI」是**假的**，
   *   而且會讓他以為「只要網路好一點就能得到 AI 回答」，事實並非如此。
   *
   *   'user_choice' = 使用者選了只在本機 → 文案要說「這個模式只用內建知識」
   *   'unreachable' = 雲端失敗／沒金鑰 → 文案才說「暫時連不上」
   *
   * ⚠️ 預設 'unreachable' 是刻意的：舊呼叫端（以及雲端失敗那條路徑）
   *    不改一行就維持原行為。
   */
  reason: 'user_choice' | 'unreachable' = 'unreachable'
): HealthQuestionAnswer {
  if (language === 'en') return answerInEnglish(question, indicators, reason);

  const q = (question || '').trim().toLowerCase();
  /**
   * ⚠️⚠️ **不要再用 `|| 135` 這種「預設值」**（2026-10-07 移除）。
   *
   *   預設值會把「沒有資料」悄悄變成「數值正常」，然後被寫進回覆裡 ——
   *   使用者讀到的是「您的血壓維持得還不錯」，而我們根本沒有他的血壓。
   *   那是**捏造健康數據**，比不回答更危險。
   *
   *   現在只有呼叫端真的給了血壓值，才允許出現「您的血壓」這種句子。
   */
  const hasBp = typeof indicators?.systolicBp === 'number' && indicators.systolicBp > 0;
  const systolic = hasBp ? Number(indicators?.systolicBp) : 0;
  const isHighBp = hasBp && systolic >= 140;
  /**
   * ⚠️ 順手移除 `bloodSugar` / `isHighSugar` / `isGout` —— 它們宣告了但**從來沒被用到**
   *    （2026-10-07 用 `grep -c` 逐一確認：各只出現 1～2 次，都是宣告本身）。
   *    死變數留著會讓人以為「這些指標有被納入判斷」，其實沒有。
   */

  // 1. 高血壓與咖啡
  if (q.includes('咖啡') || (q.includes('血壓') && q.includes('喝'))) {
    /**
     * ⚠️⚠️ 2026-10-07：**只有在真的收到血壓值時，才可以講「您的血壓」。**
     *
     * 【原本錯在哪 —— 這是最嚴重的一種錯：捏造健康數據】
     *   下面原本寫 `const systolic = indicators?.systolicBp || 135;`，
     *   於是**沒有收到任何血壓值**時，`systolic` 會變成 135，
     *   而 135 < 140 → 走到「您的血壓目前維持得還不錯」那一段。
     *
     *   問題是：問答區從 2026-09-30 起就**不再送出生理指標**
     *   （見 `HealthQASection` 的說明），所以這條路徑**永遠**拿不到血壓值。
     *   也就是說，每一位「只在本機」的使用者問咖啡問題，
     *   都會被告知「您的血壓目前維持得還不錯」——
     *   **一個我們完全沒有資料、憑預設值編出來的健康評估。**
     *
     *   這比不回答更危險：使用者會把它當成事實。
     *   （同型問題在標籤路徑已經修過一次：「離線時系統會捏造一份看起來很肯定的
     *     紅／黃／綠結論」—— 問答這條路當時漏掉了。）
     *
     * 【修法】分成三種：
     *   有血壓值 ＋ 偏高 → 個人化（保留原樣）
     *   有血壓值 ＋ 正常 → 個人化（保留原樣）
     *   **沒有血壓值 → 一般版：只講咖啡怎麼喝，不宣稱使用者任何數值**
     */
    if (hasBp && isHighBp) {
      return {
        question,
        key_takeaway: '🟡 可以喝一點點，但建議每天不要超過一小杯，且千萬不要加糖加奶精！',
        answer: `您好！看到您今天量到的上壓有 ${systolic}，稍微偏高了一點點。

高血壓並不是完全不能碰咖啡，但是咖啡因會讓心臟跳得稍微快一點、血管稍微收縮。
如果您本來就有每天喝咖啡的習慣，早上喝「一小杯淡黑咖啡」或加少許「低脂鮮奶」是可以的，但千萬不要喝三合一即溶咖啡（裡面含很多糖和反式脂肪），也不要在量血壓前半小時喝，下午兩點以後就不要喝了，才不會晚上睡不著影響血壓喔！`,
        safe_tips: [
          '每天最多喝一杯（約 150～200cc），建議在早上吃飽早餐後喝。',
          '千萬不要買三合一即溶包（糖分跟壞油脂太多）。',
          '量血壓前半小時不要喝，避免量出來數字虛高。',
        ],
        voice_script: `您好！針對您問的「高血壓能不能喝咖啡」，答案是可以喝一點點喔！因為您上壓有 ${systolic}，建議每天最多喝一小杯淡黑咖啡就好，千萬不要加糖或是奶精粉，下午也盡量不要喝，晚上睡得香甜，血壓才會穩喔！`,
        source: 'smart_health_qa',
      };
    }
    if (hasBp) {
      return {
        question,
        key_takeaway: '✅ 可以適量享用！每天 1～2 杯純黑咖啡沒問題，注意別加糖精奶精。',
        answer: `您好！您的血壓目前維持得還不錯。適量喝黑咖啡對血液循環與提神是有幫助的。

不過記得：盡量挑選純黑咖啡或加無糖鮮奶，不要加砂糖、煉乳或奶精。而且下午或晚上不要喝，以免影響晚上睡眠。`,
        safe_tips: [
          '推薦黑咖啡或加無糖低脂鮮奶。',
          '避免空腹大量喝咖啡，以防刺激胃酸逆流。',
          '下午兩點後改喝溫開水或大麥茶。',
        ],
        voice_script: `您好！您現在血壓維持得很標準，每天適量喝一杯到兩杯不加糖的黑咖啡是可以的喔！記得不要空腹喝，也不要加奶精跟砂糖，祝您喝得安心又開心！`,
        source: 'smart_health_qa',
      };
    }
    /**
     * ⚠️ 這一版是**沒有血壓值**時用的 —— 只講咖啡怎麼喝，不講「您的血壓」。
     *    任何「您的數值如何」的句子在這裡都是編的，一句都不能留。
     */
    return {
      question,
      key_takeaway: '✅ 可以適量享用！每天 1～2 杯純黑咖啡沒問題，注意別加糖加奶精。',
      answer: `您好！適量喝黑咖啡對血液循環與提神是有幫助的。

不過記得：盡量挑選純黑咖啡或加無糖鮮奶，不要加砂糖、煉乳或奶精。而且下午或晚上不要喝，以免影響晚上睡眠。

如果您有高血壓，每天控制在 1～2 杯以內會比較安心；實際要喝多少，建議下次看診時問一下您的醫師。`,
      safe_tips: [
        '推薦黑咖啡或加無糖低脂鮮奶。',
        '避免空腹大量喝咖啡，以防刺激胃酸逆流。',
        '下午兩點後改喝溫開水或大麥茶。',
      ],
      voice_script: `您好！適量喝黑咖啡對血液循環與提神是有幫助的。記得挑純黑咖啡或加無糖鮮奶，不要加砂糖、煉乳或奶精，下午或晚上也盡量不要喝，以免影響睡眠。如果您有高血壓，每天一到兩杯以內比較安心。`,
      source: 'smart_health_qa',
    };
  }

  // 2. 血糖高與水果 / 香蕉
  if (q.includes('香蕉') || q.includes('水果') || q.includes('血糖') || q.includes('糖尿病')) {
    return {
      question,
      key_takeaway: '🟡 水果可以吃，但要「挑不甜的」而且「每次吃一個拳頭大」就好！',
      answer: `血糖高不是完全不能吃水果！水果有很多天然維他命跟纖維，對排便很有好處。

重點是：
1. 像「香蕉、芒果、荔枝、西瓜、葡萄」糖分非常高，吃半條香蕉或幾顆就好，不要一次吃一整大根熟透的黃香蕉。
2. 建議多選「芭樂（番石榴）、小蘋果、大番茄、奇異果」，這些升糖比較慢。
3. 最重要的一點：水果要用咬的，千萬「不要打成果汁喝」，打成果汁糖分吸收太快，血糖會飆上去！`,
      safe_tips: [
        '每天吃水果份量不超過自己拳頭大小。',
        '推薦芭樂、小蘋果、牛番茄；少吃熟香蕉、龍眼、荔枝。',
        '吃水果當作兩餐之間的點心，千萬不要榨成果汁喝。',
      ],
      voice_script: `您好！血糖偏高是可以吃水果的，但是千萬不要打成果汁喝喔！像熟香蕉、西瓜糖分很高，一次吃兩三口就好；平常多吃芭樂或小蘋果，每次吃一個拳頭大小剛剛好，血糖就不會亂跳囉！`,
      source: 'smart_health_qa',
    };
  }

  // 3. 痛風 / 尿酸高能不能吃豆腐喝豆漿
  if (q.includes('豆腐') || q.includes('豆漿') || q.includes('痛風') || q.includes('尿酸')) {
    return {
      question,
      key_takeaway: '✅ 可以放心吃豆腐與無糖豆漿！痛風真正要避開的是火鍋濃湯、啤酒與內臟！',
      answer: `您好！這是很多人常誤會的事情。現在醫學研究已經證實，黃豆製品（像傳統豆腐、無加糖豆漿）是植物性蛋白質，並不會引起痛風發作！

痛風發作真正的大元兇是：
1. 熬了很久的大骨濃湯、火鍋高湯、肉汁肉燥。
2. 啤酒、烈酒。
3. 豬肝、豬腦、腰子等動物內臟，以及含糖飲料（果糖會阻礙尿酸排出）。
所以平時吃一塊蒸豆腐、喝一杯無糖溫豆漿是非常健康營養的！`,
      safe_tips: [
        '傳統板豆腐與無加糖豆漿可以安心適量吃。',
        '火鍋濃高湯、排骨大骨湯千萬不要喝。',
        '每天多喝 1500cc 溫開水，幫助身體尿酸排泄。',
      ],
      voice_script: `您好！請放心，痛風是可以吃傳統豆腐和喝無糖豆漿的喔！真正會讓腳趾痛風發作的是熬很久的火鍋濃湯、排骨高湯跟酒類。豆腐很健康，安心適量吃沒問題！`,
      source: 'smart_health_qa',
    };
  }

  // 4. 降血壓藥能不能吃柚子 / 葡萄柚
  if (q.includes('柚子') || q.includes('葡萄柚') || q.includes('降血壓藥') || q.includes('吃藥')) {
    return {
      question,
      key_takeaway: '⛔ 絕對不可以！吃降血壓藥前後千萬不能吃葡萄柚或文旦柚！',
      answer: `請特別當心！這點非常非常重要！

葡萄柚、文旦柚裡面有一種天然成分，會把我們肝臟裡分解降血壓藥的酵素「扣留住」。
結果就是：您吞進肚子裡的一顆血壓藥，效果突然放大好幾倍，等於一次吞了三四顆藥！這樣會讓血壓突然降得太低，會嚴重頭暈、甚至在浴室跌倒！即使跟吃藥時間隔開好幾小時也一樣有危險，所以有吃慢性病降壓藥的人，請完全不要吃葡萄柚喔！`,
      safe_tips: [
        '葡萄柚、西柚、文旦柚在服藥期間都應完全避免。',
        '想吃水果可以改吃蘋果、芭樂、水梨等安全水果。',
        '如果吃了柚子感到嚴重頭暈無力，請立刻坐下並聯絡家人或醫生。',
      ],
      voice_script: `請注意！有在吃降血壓藥的話，千萬不能吃葡萄柚或柚子！柚子會讓藥效突然暴增好幾倍，血壓會一下子掉太低，整個人會發暈站不穩。想吃水果請改吃蘋果或芭樂比較安全喔！`,
      source: 'smart_health_qa',
    };
  }

  // 5. 紅酒 / 喝酒護心
  if (q.includes('紅酒') || q.includes('喝酒') || q.includes('心臟') || q.includes('啤酒')) {
    return {
      question,
      key_takeaway: '🟡 不建議為了護心而喝酒！酒精會使血壓升高並加重肝腎負擔。',
      answer: `您好！以前常聽說「睡前喝一小杯紅酒可以活血軟化血管」，但現代世界心臟醫學會已經更新觀念：

酒精對長者的血管刺激很大，剛喝下去血管稍微擴張，但幾小時後會反彈性讓血壓飆高，而且容易影響夜間睡眠深度，半夜起床上廁所更容易跌倒。
如果平常沒有喝酒習慣，千萬不要為了護心開始喝酒；想要護心血管，最好的方法是每天在平地散步 20 分鐘、飲食少鹽少油、吃深海魚肉！`,
      safe_tips: [
        '千萬不要為了通血管而特地每天喝紅酒。',
        '酒精容易與慢性病降壓藥、安眠藥產生危險交互作用。',
        '多散步、少吃油膩肥肉才是最棒的護心秘訣。',
      ],
      voice_script: `您好！不建議為了護心臟去喝紅酒喔！酒精會讓血壓在半夜反彈飆高，也容易頭暈跌倒。平常多散步走動、少吃太鹹太油，心臟就會非常健康囉！`,
      source: 'smart_health_qa',
    };
  }

  // 6. 晚上水腫能不能喝水
  if (q.includes('水腫') || q.includes('喝水') || q.includes('水喝多')) {
    return {
      question,
      key_takeaway: '✅ 白天多喝溫水、排出身體多餘鹽分；睡前一小時少喝即可！',
      answer: `您好！很多人因為傍晚小腿或腳背水腫，就嚇得整天不敢喝水，其實這樣反而會讓血液變濃、容易便秘！

水腫主要是因為平時吃得太鹹（鈉鹽把水分鎖在身體裡），或者血液循環慢。
正確做法是：
1. 白天（早上和下午）多喝溫開水，幫助腎臟把肚子裡多餘的鹽分排出來。
2. 飲食一定要清淡，泡麵、醬瓜、鹹菜千萬少碰。
3. 晚上吃飽後在客廳慢慢走走，看電視時把雙腳微微墊高。
4. 睡前半小時少喝水，免得半夜常常爬起來上廁所打斷睡眠。`,
      safe_tips: [
        '白天每隔 1～2 小時喝半杯溫水，千萬不要刻意憋著不喝。',
        '飲食嚴格少鹽少醬油，鹽分排掉了，腳腫自然消。',
        '下午休息時可把雙腿墊在小枕頭上，幫助血液回流。',
      ],
      voice_script: `您好！腳有水腫白天還是要喝溫開水喔！水腫是因為吃得太鹹把水卡在身體裡，白天多喝水才能把鹽巴尿出來；晚上睡前一小時少喝水，才不會半夜一直爬起來上廁所喔！`,
      source: 'smart_health_qa',
    };
  }

  // 7. 通用溫馨大白話解答
  /**
   * ★★ 2026-10-07：**開頭一定要說清楚「這一題我答不了」。**
   *
   * 【為什麼要改】
   *   原本這段直接給一般養生建議，**完全不說自己沒聽懂**。
   *   使用者問了一個具體問題（例如「我可以吃人參嗎」），
   *   得到的是一段「少油少鹽多喝水」，而且看不出來問題根本沒被回答。
   *   那不是回答，那是**把問題掩蓋掉** —— 使用者會以為這就是針對他的答案。
   *
   *   而且開頭要依「為什麼走這條路」分開講：
   *     只在本機模式的使用者是**主動選擇**不送給 AI（他是有連線的），
   *     告訴他「連不上 AI」是假的，也會讓他以為「網路好一點就有 AI 回答」。
   */
  const fallbackLead =
    reason === 'user_choice'
      ? `您好！您選擇了「只在本機」模式，我只用 App 內建的知識回答。您問的「${question}」不在內建知識庫裡，所以我沒辦法針對這個問題回答，只能給您一般性的日常建議。`
      : `您好！我目前連不上 AI 服務，沒辦法針對您問的「${question}」詳細回答。`;

  return {
    question,
    key_takeaway:
      reason === 'user_choice'
        ? '💡 這一題不在內建知識庫裡，以下是通用的日常建議。'
        : '💡 目前連不上 AI，以下是通用的日常建議。',
    answer: `${fallbackLead}

針對日常身體保養，最核心的秘訣就是保持飲食清淡：
1. 烹飪少放一湯匙醬油、味精與豆瓣醬，減少心臟與腎臟負擔。
2. 避免高油炸物、香腸臘肉等加工製品。
3. 點心盡量吃新鮮水果或無糖黑豆漿，不要吃甜餅乾與蛋糕。
4. 每天多喝溫水，吃飽飯後散步 15 分鐘，晚上早點休息。

如果您有按時吃醫院開的慢性病藥物，記得一定要遵照醫囑，不要自行停藥或隨意吃偏方喔！`,
    safe_tips: [
      reason === 'user_choice'
        ? '內建知識庫只涵蓋常見問題，換個問法可能也對不上。'
        : '稍等一下再問一次 —— AI 可能只是暫時忙碌。',
      '新鮮原形食物最好（新鮮青菜、豆腐、魚肉）。',
      '如有特殊身體不適，請在看診時跟主治醫生諮詢。',
    ],
    voice_script:
      reason === 'user_choice'
        ? '您好！您選擇了只在本機模式，我只用 App 內建的知識回答。您問的這一題不在內建知識庫裡，所以我沒辦法針對它回答，只能給您一般性的日常建議：飲食少油少鹽、多喝溫開水、少吃加工零食。'
        : '您好！我目前連不上 AI 服務，沒辦法針對您的問題詳細回答，請稍後再問一次。這段時間請記得飲食少油少鹽、多喝溫開水、少吃加工零食。',
    source: 'smart_health_qa',
  };
}

/* ============================================================================
 * 英文版問答（斷網後備）
 * ============================================================================
 * 【為什麼要另寫一份，而不是翻譯中文字串】
 *   上面的中文分支靠 `q.includes('咖啡')` 這類**中文關鍵字**比對。
 *   英文提問（"can I drink coffee?"）一個字都對不上，會直接掉到通用解答。
 *   → 只翻譯輸出、不換關鍵字，等於英文版永遠只會回同一句話。
 *     所以關鍵字與輸出必須一起換。
 *
 * 【涵蓋的主題與中文版一致】咖啡／水果血糖／豆腐痛風／柚子藥物／
 *   酒精／水腫喝水／通用。
 */
function answerInEnglish(
  question: string,
  indicators?: Partial<SeniorPhysicalIndicators>,
  /** 見 `answerSeniorHealthQuestion` 的說明：決定後備文案怎麼講 */
  reason: 'user_choice' | 'unreachable' = 'unreachable'
): HealthQuestionAnswer {
  const q = (question || '').trim().toLowerCase();
  // 與中文版同一個理由：預設值會把「沒有資料」變成「數值正常」（見中文版的說明）
  const hasBp = typeof indicators?.systolicBp === 'number' && indicators.systolicBp > 0;
  const systolic = hasBp ? Number(indicators?.systolicBp) : 0;
  const isHighBp = hasBp && systolic >= 140;

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  // 1. High blood pressure and coffee
  if (has('coffee', 'caffeine') || (has('blood pressure', 'bp') && has('drink'))) {
    // 只有真的收到血壓值才能講「your blood pressure」—— 見中文版的說明
    if (hasBp && isHighBp) {
      return {
        question,
        key_takeaway:
          '🟡 A small cup is fine, but keep it to one a day — and never add sugar or creamer.',
        answer: `Hello! I see your top reading today was ${systolic}, which is a little high.

High blood pressure does not mean you must give up coffee completely. Caffeine makes the heart beat a little faster and tightens the blood vessels slightly. If you already drink coffee every day, one small cup of weak black coffee in the morning, or with a splash of low-fat milk, is fine. But please avoid 3-in-1 instant sachets — they are full of sugar and bad fats. Do not drink coffee in the half hour before you measure your blood pressure, and skip it after 2pm so it does not keep you awake.`,
        safe_tips: [
          'At most one cup a day (about 150-200 ml), ideally after breakfast.',
          'Avoid 3-in-1 instant sachets — far too much sugar and bad fat.',
          'Do not drink any in the half hour before measuring your blood pressure.',
        ],
        voice_script: `Hello! You asked whether you can drink coffee with high blood pressure. A small cup is fine. Your top reading was ${systolic}, so keep it to one small cup of weak black coffee a day, no sugar and no creamer, and try not to drink it in the afternoon. Sleep well and your blood pressure will stay steady.`,
        source: 'smart_health_qa',
      };
    }
    if (hasBp) {
      return {
        question,
        key_takeaway: '✅ Enjoy it in moderation — one to two cups of plain black coffee a day is fine.',
        answer: `Hello! Your blood pressure is holding up well. In moderation, black coffee can help circulation and alertness for many older adults.

Just remember: choose plain black coffee or add unsweetened milk. Do not add sugar, condensed milk or creamer. And avoid it in the afternoon or evening so it does not disturb your sleep.`,
        safe_tips: [
          'Plain black coffee, or with unsweetened low-fat milk.',
          'Avoid drinking a lot on an empty stomach — it can irritate acid reflux.',
          'After 2pm, switch to warm water or barley tea.',
        ],
        voice_script:
          'Hello! Your blood pressure is in a good range, so one or two cups of unsweetened black coffee a day is fine. Do not drink it on an empty stomach, and no creamer or sugar. Enjoy it with peace of mind!',
        source: 'smart_health_qa',
      };
    }
    /**
     * ⚠️ 這一版是**沒有血壓值**時用的 —— 一句「your blood pressure」都不能有，
     *    那會是我們憑空編出來、而使用者會當真的健康評估（見中文版的說明）。
     */
    return {
      question,
      key_takeaway: '✅ Enjoy it in moderation — one to two cups of plain black coffee a day is fine.',
      answer: `Hello! In moderation, black coffee can help circulation and alertness for many older adults.

Just remember: choose plain black coffee or add unsweetened milk. Do not add sugar, condensed milk or creamer. And avoid it in the afternoon or evening so it does not disturb your sleep.

If you have high blood pressure, keeping it to one or two cups a day is the safer choice — your doctor can tell you what is right for you.`,
      safe_tips: [
        'Plain black coffee, or with unsweetened low-fat milk.',
        'Avoid drinking a lot on an empty stomach — it can irritate acid reflux.',
        'After 2pm, switch to warm water or barley tea.',
      ],
      voice_script:
        'Hello! In moderation, black coffee can help circulation and alertness. Choose plain black coffee or add unsweetened milk, and no sugar or creamer. Avoid it in the afternoon or evening so it does not disturb your sleep. If you have high blood pressure, one or two cups a day is the safer choice.',
      source: 'smart_health_qa',
    };
  }

  // 2. Blood sugar and fruit
  if (has('banana', 'fruit', 'blood sugar', 'diabetes', 'sugar level')) {
    return {
      question,
      key_takeaway:
        '🟡 You can eat fruit, but choose the less sweet ones and keep each portion to the size of your fist.',
      answer: `Please do not worry — high blood sugar does not mean you must give up fruit! Fruit has natural vitamins and fibre, which help older adults with digestion.

The key points:
1. Bananas, mangoes, lychees, watermelon and grapes are very high in sugar. Half a banana or a few grapes is fine — do not eat a whole large ripe banana at once.
2. Choose guava, small apples, tomatoes or kiwi instead. These raise blood sugar more slowly.
3. Most importantly: eat fruit by biting it. Never blend it into juice — juice is absorbed far too quickly and your blood sugar will shoot up.`,
      safe_tips: [
        'One portion at a time, about the size of your fist.',
        'Eat fruit between meals rather than straight after a big meal.',
        'Never drink fruit juice — eat the fruit instead.',
      ],
      voice_script:
        'Hello! You asked about fruit and blood sugar. Fruit is fine, but pick the less sweet kinds like guava, small apples or kiwi, and keep each portion to the size of your fist. Please bite the fruit instead of blending it into juice, because juice makes blood sugar rise very fast.',
      source: 'smart_health_qa',
    };
  }

  // 3. Gout and soy products
  if (has('tofu', 'soy', 'gout', 'uric acid', 'bean curd')) {
    return {
      question,
      key_takeaway: '✅ Plain tofu and unsweetened soy milk are fine in normal amounts — skip the rich broths.',
      answer: `Hello! For gout, plain tofu and unsweetened soy milk are generally fine in normal amounts. Modern research shows plant purines from soy do not raise gout risk as much as people once thought.

The real culprits are:
1. Long-simmered soups and concentrated stock cubes — these are very high in purines.
2. Organ meats, sardines and shellfish.
3. Sugary drinks and fructose syrup, which stop your body flushing out uric acid.

Drink plenty of warm water through the day — that is the single most helpful habit for gout.`,
      safe_tips: [
        'Drink 1.5 to 2 litres of water a day unless your doctor says otherwise.',
        'Avoid long-boiled broth, stock cubes and organ meats.',
        'Cut out sugary drinks and fruit juice.',
      ],
      voice_script:
        'Hello! You asked about tofu and gout. Plain tofu and unsweetened soy milk in normal amounts are fine. What you really need to avoid is long-boiled soup and stock cubes, and sugary drinks. Drink plenty of warm water every day to help flush the uric acid out.',
      source: 'smart_health_qa',
    };
  }

  // 4. Blood pressure medicine and grapefruit
  if (has('grapefruit', 'pomelo', 'medicine', 'medication', 'pills', 'drug')) {
    return {
      question,
      key_takeaway: '⚠️ Do not eat grapefruit or pomelo if you take blood pressure medicine — ask your doctor first.',
      answer: `This one matters. Grapefruit and pomelo interfere with how your body breaks down several blood pressure medicines. The medicine can build up in your blood and your blood pressure may drop too low, making you dizzy or faint.

It is not only about eating them at the same time — the effect can last a day or more.

Please do not stop or change your medicine on your own. Ask your doctor or pharmacist whether your particular medicine is affected.`,
      safe_tips: [
        'Tell your doctor or pharmacist which medicine you take before eating grapefruit.',
        'Oranges and mandarins are usually safe — but check with them too.',
        'Never stop your blood pressure medicine on your own.',
      ],
      voice_script:
        'Please listen carefully. If you take blood pressure medicine, do not eat grapefruit or pomelo. They can make the medicine build up in your body and your blood pressure drop too low, which makes you dizzy. Please ask your doctor first, and never stop your medicine by yourself.',
      source: 'smart_health_qa',
    };
  }

  // 5. Alcohol
  if (has('wine', 'alcohol', 'beer', 'drink alcohol', 'heart')) {
    return {
      question,
      key_takeaway: '🟡 There is no safe amount of alcohol that is good for the heart — less is better.',
      answer: `Hello! The old idea that a glass of red wine protects the heart has not held up in newer research. For older adults, alcohol raises blood pressure, disturbs sleep and adds empty calories.

If you do drink, keep it occasional and small, and never on an empty stomach. If you take blood pressure or blood sugar medicine, please ask your doctor first — alcohol can interact with them.`,
      safe_tips: [
        'If you do not drink, there is no health reason to start.',
        'Never drink on an empty stomach.',
        'Ask your doctor if alcohol interacts with your medicine.',
      ],
      voice_script:
        'Hello! You asked about alcohol and the heart. Newer research shows there is no amount of alcohol that is truly good for the heart. If you do drink, keep it small and occasional, never on an empty stomach, and ask your doctor first if you take any medicine.',
      source: 'smart_health_qa',
    };
  }

  // 6. Swelling and drinking water
  if (has('swelling', 'swollen', 'edema', 'water retention', 'how much water')) {
    return {
      question,
      key_takeaway: '💧 Do not stop drinking water — cut down on salt instead, and raise your feet when resting.',
      answer: `Hello! If your ankles swell, many people stop drinking water — that is actually the wrong move. Swelling usually comes from too much salt, not too much water. Your body holds on to water to dilute the salt.

What helps:
1. Cut down on salt, pickled foods, fermented bean curd and soy sauce.
2. Raise your feet on a cushion when you sit down.
3. Keep drinking water normally through the day, but ease off in the two hours before bed.

If the swelling is sudden, or only in one leg, or you feel short of breath, please see a doctor promptly.`,
      safe_tips: [
        'Cut salt first — that is what usually causes the swelling.',
        'Raise your feet above heart level when resting.',
        'See a doctor if swelling is sudden or only on one side.',
      ],
      voice_script:
        'Hello! You asked about swelling and drinking water. Please do not stop drinking water. Swelling usually comes from too much salt, not too much water. Cut down on salt and pickled foods, raise your feet when you sit, and see a doctor if the swelling appears suddenly or only in one leg.',
      source: 'smart_health_qa',
    };
  }

  // 7. General fallback
  /**
   * ★★ 2026-10-07：開頭要依「為什麼走這條路」分開講（與中文版同一個理由）。
   *
   * 【原本錯在哪】
   *   這裡一律寫 "I could not reach the AI right now"。
   *   但「只在本機」模式的使用者是**主動選擇**不送給 AI —— 他是有連線的。
   *   告訴他連不上 AI 是假的，而且會讓他以為「網路好一點就能得到 AI 回答」。
   *
   * 【而且原本也漏了最重要的一句】
   *   沒有說「這一題不在內建知識庫裡」。使用者問了一個具體問題，
   *   得到一段通用建議，卻看不出來問題根本沒被回答。
   */
  const byChoice = reason === 'user_choice';
  const fallbackLead = byChoice
    ? `Hello! You chose the on-device-only mode, so I answer from the app's built-in knowledge only. Your question — "${question}" — is not in that knowledge base, so I cannot answer it directly. Here is some general advice instead.`
    : `Hello! I am not able to reach the AI service at the moment, so I cannot answer your exact question in detail. Please try again in a moment.`;

  return {
    question,
    key_takeaway: byChoice
      ? '💡 That question is not in the built-in knowledge base — here is some general advice.'
      : '💡 I could not reach the AI right now, so here is some general advice.',
    answer: `${fallbackLead}

In the meantime, a few things help most older adults:
1. Keep meals light and low in salt, and drink warm water through the day.
2. Eat at regular times and go easy on sugary drinks and snacks.
3. If you feel unwell, or your readings are far from your usual range, please see a doctor.`,
    safe_tips: [
      byChoice
        ? 'The built-in knowledge base only covers common questions, and rephrasing may not match either.'
        : 'Try asking again in a moment — the AI may just be busy.',
      'Check your readings and note them down for your doctor.',
      'See a doctor promptly if you feel unwell.',
    ],
    voice_script: byChoice
      ? 'Hello! You chose the on-device-only mode, so I answer from the app built-in knowledge only. Your question is not in that knowledge base, so I cannot answer it directly. Here is some general advice instead: keep meals light and low in salt, drink warm water, and see a doctor if you feel unwell.'
      : 'Hello! I am sorry, I cannot reach the AI service right now, so I cannot answer your question in full. Please try again in a moment. In the meantime, keep your meals light and low in salt, drink warm water, and see a doctor if you feel unwell.',
    source: 'smart_health_qa',
  };
}
