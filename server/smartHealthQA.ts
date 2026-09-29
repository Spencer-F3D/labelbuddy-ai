/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 長者常見健康疑問大白話解答引擎 (Senior Common Health Q&A Smart Engine)
 * ============================================================================
 * 專為長者日常提問設計：100% 轉換為阿公阿嬤聽得懂的大白話！
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
  language: 'zh-TW' | 'en' = 'zh-TW'
): HealthQuestionAnswer {
  if (language === 'en') return answerInEnglish(question, indicators);

  const q = (question || '').trim().toLowerCase();
  const systolic = indicators?.systolicBp || 135;
  const isHighBp = systolic >= 140;
  const bloodSugar = indicators?.bloodSugar || 6.5;
  const isHighSugar = indicators?.bloodSugarUnit === 'mg/dL' ? bloodSugar >= 130 : bloodSugar >= 7.0;
  const isGout = indicators?.uricAcidStatus === 'high' || indicators?.uricAcidStatus === 'gout_history';

  // 1. 高血壓與咖啡
  if (q.includes('咖啡') || (q.includes('血壓') && q.includes('喝'))) {
    if (isHighBp) {
      return {
        question,
        key_takeaway: '🟡 可以喝一點點，但建議每天不要超過一小杯，且千萬不要加糖加奶精！',
        answer: `阿公、阿婆您好！看到您今天量到的上壓有 ${systolic}，稍微偏高了一點點。

高血壓並不是完全不能碰咖啡，但是咖啡因會讓心臟跳得稍微快一點、血管稍微收縮。
如果您本來就有每天喝咖啡的習慣，早上喝「一小杯淡黑咖啡」或加少許「低脂鮮奶」是可以的，但千萬不要喝三合一即溶咖啡（裡面含很多糖和反式脂肪），也不要在量血壓前半小時喝，下午兩點以後就不要喝了，才不會晚上睡不著影響血壓喔！`,
        safe_tips: [
          '每天最多喝一杯（約 150～200cc），建議在早上吃飽早餐後喝。',
          '千萬不要買三合一即溶包（糖分跟壞油脂太多）。',
          '量血壓前半小時不要喝，避免量出來數字虛高。',
        ],
        voice_script: `長輩您好！針對您問的「高血壓能不能喝咖啡」，答案是可以喝一點點喔！因為您上壓有 ${systolic}，建議每天最多喝一小杯淡黑咖啡就好，千萬不要加糖或是奶精粉，下午也盡量不要喝，晚上睡得香甜，血壓才會穩喔！`,
        source: 'smart_health_qa',
      };
    } else {
      return {
        question,
        key_takeaway: '✅ 可以適量享用！每天 1～2 杯純黑咖啡沒問題，注意別加糖精奶精。',
        answer: `長輩您好！您的血壓目前維持得還不錯。適量喝黑咖啡對很多長輩的血液循環與提神是有幫助的。

不過記得：盡量挑選純黑咖啡或加無糖鮮奶，不要加砂糖、煉乳或奶精。而且下午或晚上不要喝，以免影響晚上睡眠。`,
        safe_tips: [
          '推薦黑咖啡或加無糖低脂鮮奶。',
          '避免空腹大量喝咖啡，以防刺激胃酸逆流。',
          '下午兩點後改喝溫開水或大麥茶。',
        ],
        voice_script: `長輩您好！您現在血壓維持得很標準，每天適量喝一杯到兩杯不加糖的黑咖啡是可以的喔！記得不要空腹喝，也不要加奶精跟砂糖，祝您喝得安心又開心！`,
        source: 'smart_health_qa',
      };
    }
  }

  // 2. 血糖高與水果 / 香蕉
  if (q.includes('香蕉') || q.includes('水果') || q.includes('血糖') || q.includes('糖尿病')) {
    return {
      question,
      key_takeaway: '🟡 水果可以吃，但要「挑不甜的」而且「每次吃一個拳頭大」就好！',
      answer: `阿公、阿婆請放心，血糖高不是完全不能吃水果！水果有很多天然維他命跟纖維，對老人家排便很有好處。

重點是：
1. 像「香蕉、芒果、荔枝、西瓜、葡萄」糖分非常高，吃半條香蕉或幾顆就好，不要一次吃一整大根熟透的黃香蕉。
2. 建議多選「芭樂（番石榴）、小蘋果、大番茄、奇異果」，這些升糖比較慢。
3. 最重要的一點：水果要用咬的，千萬「不要打成果汁喝」，打成果汁糖分吸收太快，血糖會飆上去！`,
      safe_tips: [
        '每天吃水果份量不超過自己拳頭大小。',
        '推薦芭樂、小蘋果、牛番茄；少吃熟香蕉、龍眼、荔枝。',
        '吃水果當作兩餐之間的點心，千萬不要榨成果汁喝。',
      ],
      voice_script: `阿公阿嬤您好！血糖偏高是可以吃水果的，但是千萬不要打成果汁喝喔！像熟香蕉、西瓜糖分很高，一次吃兩三口就好；平常多吃芭樂或小蘋果，每次吃一個拳頭大小剛剛好，血糖就不會亂跳囉！`,
      source: 'smart_health_qa',
    };
  }

  // 3. 痛風 / 尿酸高能不能吃豆腐喝豆漿
  if (q.includes('豆腐') || q.includes('豆漿') || q.includes('痛風') || q.includes('尿酸')) {
    return {
      question,
      key_takeaway: '✅ 可以放心吃豆腐與無糖豆漿！痛風真正要避開的是火鍋濃湯、啤酒與內臟！',
      answer: `長輩您好！這是很多阿公阿嬤常誤會的事情。現在醫學研究已經證實，黃豆製品（像傳統豆腐、無加糖豆漿）是植物性蛋白質，並不會引起痛風發作！

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
      voice_script: `長輩您好！請放心，阿公阿嬤痛風是可以吃傳統豆腐和喝無糖豆漿的喔！真正會讓腳趾痛風發作的是熬很久的火鍋濃湯、排骨高湯跟酒類。豆腐很健康，安心適量吃沒問題！`,
      source: 'smart_health_qa',
    };
  }

  // 4. 降血壓藥能不能吃柚子 / 葡萄柚
  if (q.includes('柚子') || q.includes('葡萄柚') || q.includes('降血壓藥') || q.includes('吃藥')) {
    return {
      question,
      key_takeaway: '⛔ 絕對不可以！吃降血壓藥前後千萬不能吃葡萄柚或文旦柚！',
      answer: `阿公、阿婆請特別當心！這點非常非常重要！

葡萄柚、文旦柚裡面有一種天然成分，會把我們肝臟裡分解降血壓藥的酵素「扣留住」。
結果就是：您吞進肚子裡的一顆血壓藥，效果突然放大好幾倍，等於一次吞了三四顆藥！這樣會讓血壓突然降得太低，老人家會嚴重頭暈、甚至在浴室跌倒！即使跟吃藥時間隔開好幾小時也一樣有危險，所以有吃慢性病降壓藥的長輩，請完全不要吃葡萄柚喔！`,
      safe_tips: [
        '葡萄柚、西柚、文旦柚在服藥期間都應完全避免。',
        '想吃水果可以改吃蘋果、芭樂、水梨等安全水果。',
        '如果吃了柚子感到嚴重頭暈無力，請立刻坐下並聯絡家人或醫生。',
      ],
      voice_script: `阿公阿嬤注意喔！有在吃降血壓藥的話，千萬不能吃葡萄柚或柚子！柚子會讓藥效突然暴增好幾倍，血壓會一下子掉太低，整個人會發暈站不穩。想吃水果請改吃蘋果或芭樂比較安全喔！`,
      source: 'smart_health_qa',
    };
  }

  // 5. 紅酒 / 喝酒護心
  if (q.includes('紅酒') || q.includes('喝酒') || q.includes('心臟') || q.includes('啤酒')) {
    return {
      question,
      key_takeaway: '🟡 不建議為了護心而喝酒！酒精會使血壓升高並加重肝腎負擔。',
      answer: `長輩您好！以前常聽說「睡前喝一小杯紅酒可以活血軟化血管」，但現代世界心臟醫學會已經更新觀念：

酒精對長者的血管刺激很大，剛喝下去血管稍微擴張，但幾小時後會反彈性讓血壓飆高，而且容易影響夜間睡眠深度，半夜起床上廁所更容易跌倒。
如果平常沒有喝酒習慣，千萬不要為了護心開始喝酒；想要護心血管，最好的方法是每天在平地散步 20 分鐘、飲食少鹽少油、吃深海魚肉！`,
      safe_tips: [
        '千萬不要為了通血管而特地每天喝紅酒。',
        '酒精容易與慢性病降壓藥、安眠藥產生危險交互作用。',
        '多散步、少吃油膩肥肉才是最棒的護心秘訣。',
      ],
      voice_script: `長輩您好！不建議為了護心臟去喝紅酒喔！酒精會讓長輩血壓在半夜反彈飆高，也容易頭暈跌倒。平常多散步走動、少吃太鹹太油，心臟就會非常健康囉！`,
      source: 'smart_health_qa',
    };
  }

  // 6. 晚上水腫能不能喝水
  if (q.includes('水腫') || q.includes('喝水') || q.includes('水喝多')) {
    return {
      question,
      key_takeaway: '✅ 白天多喝溫水、排出身體多餘鹽分；睡前一小時少喝即可！',
      answer: `阿公、阿婆您好！很多長輩因為傍晚小腿或腳背水腫，就嚇得整天不敢喝水，其實這樣反而會讓血液變濃、容易便秘！

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
      voice_script: `阿公阿嬤您好！腳有水腫白天還是要喝溫開水喔！水腫是因為吃得太鹹把水卡在身體裡，白天多喝水才能把鹽巴尿出來；晚上睡前一小時少喝水，才不會半夜一直爬起來上廁所喔！`,
      source: 'smart_health_qa',
    };
  }

  // 7. 通用溫馨大白話解答
  return {
    question,
    key_takeaway: '✅ 遵守「少油、少鹽、無糖、多喝溫水」的大原則，吃原形食物最安心！',
    answer: `阿公、阿婆您好！關於您問的「${question}」：

針對長輩的身體保養，最核心的秘訣就是保持飲食清淡：
1. 烹飪少放一湯匙醬油、味精與豆瓣醬，減少心臟與腎臟負擔。
2. 避免高油炸物、香腸臘肉等加工製品。
3. 點心盡量吃新鮮水果或無糖黑豆漿，不要吃甜餅乾與蛋糕。
4. 每天多喝溫水，吃飽飯後散步 15 分鐘，晚上早點休息。

如果您有按時吃醫院開的慢性病藥物，記得一定要遵照醫囑，不要自行停藥或隨意吃偏方喔！`,
    safe_tips: [
      '新鮮原形食物最好（新鮮青菜、豆腐、魚肉）。',
      '少吃過度加工包裝零食與重口味醃漬品。',
      '如有特殊身體不適，請在看診時跟主治醫生諮詢。',
    ],
    voice_script: `長輩您好！關於您的健康疑問，最重要的是日常飲食少油少鹽、多喝溫開水，少吃加工零食，吃飽飯後散步走動一下，身體就會越來越硬朗舒適喔！`,
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
  indicators?: Partial<SeniorPhysicalIndicators>
): HealthQuestionAnswer {
  const q = (question || '').trim().toLowerCase();
  const systolic = indicators?.systolicBp || 135;
  const isHighBp = systolic >= 140;
  const bloodSugar = indicators?.bloodSugar || 6.5;
  const isHighSugar =
    indicators?.bloodSugarUnit === 'mg/dL' ? bloodSugar >= 130 : bloodSugar >= 7.0;

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  // 1. High blood pressure and coffee
  if (has('coffee', 'caffeine') || (has('blood pressure', 'bp') && has('drink'))) {
    if (isHighBp) {
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
  return {
    question,
    key_takeaway: '💡 I could not reach the AI right now, so here is some general advice.',
    answer: `Hello! I am not able to reach the AI service at the moment, so I cannot answer your exact question in detail. Please try again in a moment.

In the meantime, a few things help most older adults:
1. Keep meals light and low in salt, and drink warm water through the day.
2. Eat at regular times and go easy on sugary drinks and snacks.
3. If you feel unwell, or your readings are far from your usual range, please see a doctor.

When the connection is back, ask me again and I will give you a full answer based on your own numbers.`,
    safe_tips: [
      'Try asking again in a moment — the AI may just be busy.',
      'Check your readings and note them down for your doctor.',
      'See a doctor promptly if you feel unwell.',
    ],
    voice_script:
      'Hello! I am sorry, I cannot reach the AI service right now, so I cannot answer your question in full. Please try again in a moment. In the meantime, keep your meals light and low in salt, drink warm water, and see a doctor if you feel unwell.',
    source: 'smart_health_qa',
  };
}
