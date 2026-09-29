/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * 長者身體指標大白話分析引擎 (Senior Physical Indicator Smart Analyzer)
 * ============================================================================
 * 專為長者設計：堅決不用艱深醫學名詞，100% 轉換為阿公阿嬤聽得懂的大白話！
 * 同步產出超市買菜指南（什麼千萬不能買、什麼可以安心買）與親切語音朗讀文稿。
 */

import { SeniorPhysicalIndicators, SeniorIndicatorAnalysis } from '../src/types';


/**
 * 靜態字串的英文對照（購物清單、生活提示、連動條件）。
 *
 * 【為什麼這些用對照表，而說明句用 inline 分支】
 *   說明句含有插值（血壓數值、血糖值），無法用字串查表；
 *   但購物清單／生活提示／連動條件是**完全靜態**的，
 *   用查表可以避免在 20 多處 push 各寫一次 isEn 分支 ——
 *   少寫一次分支就少一次漏翻的機會。
 */
const STATIC_EN: Record<string, string> = {
  // ── 不要買 ──
  '❌ 泡麵、罐頭肉醬、醃漬醬瓜豆腐乳（鹽巴放太多，吃下去血壓會飆高）':
    '❌ Instant noodles, tinned meat sauce, pickled vegetables and fermented bean curd (far too much salt — your blood pressure will spike)',
  '❌ 貢丸、香腸、煙燻火腿等加工肉（含鹽重而且含防腐化學物）':
    '❌ Processed meats such as meatballs, sausages and smoked ham (heavy on salt and full of preservatives)',
  '❌ 夾心甜餅乾、蛋黃酥、含糖奶茶果汁（糖分太高，吃完血糖會大衝）':
    '❌ Cream-filled biscuits, sweet pastries and sugary milk tea or juice (too much sugar — your blood sugar will jump)',
  '❌ 煉乳、甜麵包、精製白吐司（消化太快，血糖不穩定）':
    '❌ Condensed milk, sweet bread and refined white toast (digests too fast and makes blood sugar unstable)',
  '❌ 濃縮高湯塊、大骨濃湯包、香菇濃湯（普林太高，腳趾容易痛風發炎）':
    '❌ Stock cubes, bone-broth packets and mushroom soup concentrates (very high in purines — your toes can flare up)',
  '❌ 高果糖糖漿飲料（果糖會讓尿酸排不出去）':
    '❌ Drinks with high-fructose syrup (fructose stops your body clearing uric acid)',
  '❌ 豬油、牛油酥餅、人造奶油奶油泡芙（油質不好，容易卡在血管壁上）':
    '❌ Lard, butter pastry and margarine cream puffs (poor-quality fat that clings to your blood vessels)',
  '❌ 過度加工的油炸零食包、重鹹調味花生米':
    '❌ Heavily processed fried snacks and heavily salted peanuts',
  '❌ 過甜的高果糖冰飲與罐裝汽水':
    '❌ Overly sweet iced drinks and canned soft drinks',
  // ── 安心買 ──
  '✅ 新鮮大番茄、空心菜、綠花椰菜（含有天然鉀離子，幫阿公阿嬤把多餘鹽分排出來）':
    '✅ Fresh tomatoes, water spinach and broccoli (natural potassium helps flush out extra salt)',
  '✅ 傳統板豆腐、清蒸白身魚（清淡少油，優質蛋白質顧體力）':
    '✅ Traditional firm tofu and steamed white fish (light, low in oil, good-quality protein)',
  '✅ 無加糖純黑豆漿、燕麥片、糙米（高纖維，讓肚子慢慢消化，血糖不亂跳）':
    '✅ Unsweetened black soya milk, oats and brown rice (high fibre — slow digestion keeps blood sugar steady)',
  '✅ 芭樂、小蘋果（低糖好水果，洗乾淨慢慢嚼，補充維他命）':
    '✅ Guava and small apples (low-sugar fruit — wash them and chew slowly for vitamins)',
  '✅ 大瓶天然無糖麥茶、瓶裝溫和礦泉水（多喝水多排尿，預防痛風）':
    '✅ Large bottles of unsweetened barley tea or plain mineral water (drink more, pass more — helps prevent gout)',
  '✅ 鮮牛奶、無糖優格（低脂奶製品能幫助排泄尿酸，保護關節）':
    '✅ Fresh milk and unsweetened yoghurt (low-fat dairy helps clear uric acid and protect your joints)',
  '✅ 新鮮雞蛋、無調味烘焙核桃少許（補腦顧眼睛，每天吃一點點剛剛好）':
    '✅ Fresh eggs and a few plain roasted walnuts (good for brain and eyes — a small handful a day is plenty)',
  '✅ 台灣香菇、木耳、紅白蘿蔔（燉清淡蔬菜湯，腸胃順暢又清甜）':
    '✅ Shiitake mushrooms, wood ear and radish (simmer a light vegetable soup — gentle on the stomach and naturally sweet)',
  // ── 生活提示 ──
  '💧 每天起床與白天下床多喝 1 杯溫開水，幫助身體血液循環順暢。':
    '💧 Drink an extra glass of warm water when you get up and during the day — it helps your circulation.',
  '🚶 吃飽飯後不要馬上坐著看電視，在客廳慢走或到公園散步 15 到 20 分鐘。':
    '🚶 Do not sit down to watch TV right after eating — walk slowly indoors or in the park for 15 to 20 minutes.',
  '😴 晚上 10 點半前上床睡覺，睡飽 7 小時，血壓跟心臟才會舒服平穩。':
    '😴 Go to bed before 10:30 pm and get a full 7 hours — that keeps your blood pressure and heart settled.',
  // ── 連動至食品標籤掃描 ──
  '高血壓 (嚴防高鈉與高鹽)': 'Hypertension (watch sodium and salt)',
  '糖尿病 / 血糖守護 (嚴控添加糖)': 'Diabetes (watch added sugar)',
  '痛風 / 尿酸 (嚴防高普林濃湯與果糖)': 'Gout / uric acid (avoid rich broths and fructose)',
  '高血脂 (嚴防油膩飽和脂肪與反式脂肪)': 'High blood cholesterol (avoid saturated and trans fats)',
  '腎臟水腫 (嚴控加工磷酸鹽與重鹽)': 'Chronic kidney disease (avoid phosphate additives and salt)',
  '一般健康維護': 'General health',
};

/** 靜態字串翻譯：英文模式查表，查不到就原樣回傳（不會變成空白）。 */
function trStatic(s: string, isEn: boolean): string {
  return isEn ? (STATIC_EN[s] ?? s) : s;
}

export function analyzeSeniorPhysicalIndicators(
  ind: SeniorPhysicalIndicators,
  language: 'zh-TW' | 'en' = 'zh-TW'
): SeniorIndicatorAnalysis {
  // 英文模式（2026-09-29）：本機引擎是**斷網後備**，但仍必須輸出英文，
  // 否則英文介面在離線時會突然冒出中文 —— 那正是最難察覺的洩漏。
  const isEn = language === 'en';
  const systolic = ind.systolicBp || 125;
  const diastolic = ind.diastolicBp || 80;

  // 轉換血糖為 mmol/L 標準比對
  let sugarMmol = ind.bloodSugar || 5.5;
  if (ind.bloodSugarUnit === 'mg/dL') {
    sugarMmol = +(sugarMmol / 18).toFixed(1);
  }

  const isFasting = ind.bloodSugarTiming === 'fasting';
  let isBpHigh = systolic >= 145 || diastolic >= 92;
  let isBpBorderline = (systolic >= 135 && systolic < 145) || (diastolic >= 85 && diastolic < 92);

  let isSugarHigh = isFasting ? sugarMmol >= 7.0 : sugarMmol >= 10.0;
  let isSugarBorderline = isFasting
    ? (sugarMmol >= 6.1 && sugarMmol < 7.0)
    : (sugarMmol >= 7.8 && sugarMmol < 10.0);

  let isGoutConcern = ind.uricAcidStatus === 'high' || ind.uricAcidStatus === 'gout_history';
  let isLipidConcern = ind.cholesterolStatus === 'high' || ind.cholesterolStatus === 'borderline';
  let isKidneyConcern = ind.kidneyStatus === 'mild_edema' || ind.kidneyStatus === 'ckd';

  // 症狀分析
  const symptoms = ind.symptoms || [];
  const hasDizziness = symptoms.some((s) => s.includes('頭暈'));
  const hasThirsty = symptoms.some((s) => s.includes('口渴'));
  const hasEdema = symptoms.some((s) => s.includes('水腫'));
  const hasJointPain = symptoms.some((s) => s.includes('關節'));
  const hasAcidReflux = symptoms.some((s) => s.includes('胃酸') || s.includes('火燒心'));

  // 評估風險等級
  let redScore = 0;
  let yellowScore = 0;

  if (isBpHigh) redScore++;
  else if (isBpBorderline) yellowScore++;

  if (isSugarHigh) redScore++;
  else if (isSugarBorderline) yellowScore++;

  if (isGoutConcern) {
    if (ind.uricAcidStatus === 'gout_history') redScore++;
    else yellowScore++;
  }

  if (isLipidConcern) {
    if (ind.cholesterolStatus === 'high') redScore++;
    else yellowScore++;
  }

  if (isKidneyConcern) {
    if (ind.kidneyStatus === 'ckd') redScore++;
    else yellowScore++;
  }

  let statusLevel: 'green' | 'yellow' | 'red' = 'green';
  if (redScore >= 1 || yellowScore >= 3) {
    statusLevel = 'red';
  } else if (yellowScore >= 1) {
    statusLevel = 'yellow';
  }

  // 產生大白話標題
  let statusTitle = '';
  if (statusLevel === 'red') {
    statusTitle = isEn
      ? "⚠️ Please take note — some of today's numbers are a little high"
      : '⚠️ 阿公阿嬤注意喔！今天量到的指標有稍微偏高';
  } else if (statusLevel === 'yellow') {
    statusTitle = isEn
      ? '🟡 Things look mostly fine — go a little lighter on salt and sugar this week'
      : '🟡 體況大致還可以，這幾天飲食要稍微清淡一點喔';
  } else {
    statusTitle = isEn
      ? "✅ Great news — today's numbers look really good!"
      : '✅ 太棒了！阿公阿嬤今天的身體數字維持得很漂亮！';
  }

  // 產生通俗大白話解釋 (絕無艱澀名詞)
  const explanations: string[] = [];

  // 血壓白話
  if (isBpHigh) {
    explanations.push(
      isEn
        ? `[Blood pressure is high] Your reading was ${systolic} over ${diastolic}. Your heart is working harder and your blood vessels are tight. Have you been eating too much salt, or sleeping badly? Do not lift anything heavy, and rest sitting down.`
        : `【血壓偏高】：您量到的上壓有 ${systolic}、下壓 ${diastolic}。這表示最近心臟打血力氣比較大、血管比較緊繃。最近是不是吃得太鹹、或者夜裡沒睡好？千萬別提重物，坐著多休息。`
    );
  } else if (isBpBorderline) {
    explanations.push(
      isEn
        ? `[Blood pressure a little high] Your reading was ${systolic} over ${diastolic} — just above the line. Use one spoon less soy sauce and MSG when you cook, drink more water, and take a relaxed walk.`
        : `【血壓稍微高一點點】：上壓 ${systolic}、下壓 ${diastolic}，稍微超過標準一點點。最近煮菜少放一湯匙醬油跟味精，多喝水，放輕鬆散散步就好。`
    );
  } else {
    explanations.push(
      isEn
        ? `[Blood pressure is normal] ${systolic} over ${diastolic} — right where it should be. Your blood vessels are relaxed. Keep it up!`
        : `【血壓很標準】：上壓 ${systolic}、下壓 ${diastolic}，數字很正常，血管很輕鬆，請繼續保持！`
    );
  }

  // 血糖白話
  // ⚠️ 「度」是中文！這個字串會被插進 simple_explanation 與 voice_summary，
  //    英文模式下漏掉它就等於兩處洩漏（實測就是這樣抓到的）。
  const sugarDisplay = ind.bloodSugarUnit === 'mg/dL'
    ? `${ind.bloodSugar} mg/dL`
    : isEn
      ? `${sugarMmol} mmol/L`
      : `${sugarMmol} 度 (mmol/L)`;

  if (isSugarHigh) {
    explanations.push(
      isEn
        ? `[Blood sugar is high] Your reading was ${sugarDisplay} (${isFasting ? 'fasting' : 'after a meal'}). Sugar is building up and your body is clearing it slowly. Eat only half a bowl of rice or noodles per meal, choose less sweet fruit, and stay away from sugary drinks and sweet biscuits.`
        : `【血糖偏高】：您量到的血糖是 ${sugarDisplay}（${isFasting ? '空腹' : '飯後'}），表示肚子裡的糖分稍微堆積、代謝比較慢。白飯、麵條每餐吃半碗就好，水果不要吃太甜，含糖飲料與甜餅乾絕對不要碰！`
    );
  } else if (isSugarBorderline) {
    explanations.push(
      isEn
        ? `[Blood sugar a little high] Your reading was ${sugarDisplay}. Walk for 15 minutes after meals to help your body use up the sugar, and keep snacks on the less sweet side.`
        : `【血糖稍微高一點】：血糖是 ${sugarDisplay}，吃飽飯後散步走動 15 分鐘，幫助身體把糖分用掉，點心不要吃太甜喔！`
    );
  } else {
    explanations.push(
      isEn
        ? `[Blood sugar is steady] ${sugarDisplay} — well controlled, no big swings. That is healthy!`
        : `【血糖很平穩】：血糖 ${sugarDisplay} 控制得很棒，沒有忽高忽低，很健康！`
    );
  }

  // 尿酸與痛風
  if (isGoutConcern) {
    explanations.push(
      isEn
        ? `[Joints and uric acid] Do not drink long-simmered hotpot broth or bone stock. Go easy on seafood, and drink plenty of warm water to flush the uric acid out so your toes do not get red and painful.`
        : `【關節與尿酸防護】：阿公阿嬤記得，熬很久的火鍋濃湯、排骨大骨高湯千萬別喝！吃海鮮要節制，多喝溫開水幫助把尿酸尿出來，腳趾頭才不會紅腫疼痛。`
    );
  }

  // 血脂與心血管
  if (isLipidConcern) {
    explanations.push(
      isEn
        ? `[Looking after your blood vessels] If your blood test showed high fats, cut back on pork skin, fatty belly meat and fried chicken. Cook with vegetable oil so your vessels do not get clogged.`
        : `【血管保養】：抽血如果有說油質比較多，平時豬皮、五花肥肉、油炸雞排就要少吃，煮菜用植物油，血管才不容易塞住。`
    );
  }

  // 水腫與腎臟
  if (isKidneyConcern || hasEdema) {
    explanations.push(
      isEn
        ? `[Swollen feet and kidneys] If pressing your ankle in the evening leaves a dent that slowly springs back, water and salt are building up. Keep food very lightly salted, skip pickled bean curd and pickled vegetables, and put your feet up to rest.`
        : `【腳部水腫與腎臟】：如果傍晚腳盤壓下去會凹一個洞、慢慢才彈起來，代表水跟鹽分卡在身體裡。口味一定要非常清淡，醃漬豆腐乳、醬瓜不要吃，早點把腳抬高休息。`
    );
  }

  // 症狀特別叮嚀
  if (hasDizziness) {
    explanations.push(isEn ? '[Dizziness] Stand up slowly from bed or a chair — hold on for a moment before walking, so you do not fall.' : '【頭暈提醒】：從床上或椅子站起來時要慢慢來，扶著旁邊站一下再走，避免跌倒！');
  }
  if (hasThirsty) {
    explanations.push(isEn ? '[Often thirsty] If your mouth often feels dry, check your blood sugar on schedule, and do not quench it with sugary juice.' : '【常口渴提醒】：若常常覺得嘴巴很乾想喝水，記得按時量血糖，不要喝含糖果汁解渴。');
  }
  if (hasAcidReflux) {
    explanations.push(isEn ? '[Acid reflux] Do not lie down within two hours of eating, and go easy on sticky rice and very spicy or oily dishes.' : '【胃酸火燒心】：吃飽飯後兩個小時內千萬不要躺下睡覺，少吃糯米跟太辣太油的菜。');
  }

  // 超市買菜白話指南 (什麼不要買、什麼可以買)
  const doNotBuy: string[] = [];
  const recommendedToBuy: string[] = [];

  // 不要買清單
  if (isBpHigh || isBpBorderline) {
    doNotBuy.push('❌ 泡麵、罐頭肉醬、醃漬醬瓜豆腐乳（鹽巴放太多，吃下去血壓會飆高）');
    doNotBuy.push('❌ 貢丸、香腸、煙燻火腿等加工肉（含鹽重而且含防腐化學物）');
  }
  if (isSugarHigh || isSugarBorderline) {
    doNotBuy.push('❌ 夾心甜餅乾、蛋黃酥、含糖奶茶果汁（糖分太高，吃完血糖會大衝）');
    doNotBuy.push('❌ 煉乳、甜麵包、精製白吐司（消化太快，血糖不穩定）');
  }
  if (isGoutConcern) {
    doNotBuy.push('❌ 濃縮高湯塊、大骨濃湯包、香菇濃湯（普林太高，腳趾容易痛風發炎）');
    doNotBuy.push('❌ 高果糖糖漿飲料（果糖會讓尿酸排不出去）');
  }
  if (isLipidConcern) {
    doNotBuy.push('❌ 豬油、牛油酥餅、人造奶油奶油泡芙（油質不好，容易卡在血管壁上）');
  }
  if (doNotBuy.length === 0) {
    doNotBuy.push('❌ 過度加工的油炸零食包、重鹹調味花生米');
    doNotBuy.push('❌ 過甜的高果糖冰飲與罐裝汽水');
  }

  // 推薦買清單
  if (isBpHigh || isBpBorderline) {
    recommendedToBuy.push('✅ 新鮮大番茄、空心菜、綠花椰菜（含有天然鉀離子，幫阿公阿嬤把多餘鹽分排出來）');
    recommendedToBuy.push('✅ 傳統板豆腐、清蒸白身魚（清淡少油，優質蛋白質顧體力）');
  }
  if (isSugarHigh || isSugarBorderline) {
    recommendedToBuy.push('✅ 無加糖純黑豆漿、燕麥片、糙米（高纖維，讓肚子慢慢消化，血糖不亂跳）');
    recommendedToBuy.push('✅ 芭樂、小蘋果（低糖好水果，洗乾淨慢慢嚼，補充維他命）');
  }
  if (isGoutConcern) {
    recommendedToBuy.push('✅ 大瓶天然無糖麥茶、瓶裝溫和礦泉水（多喝水多排尿，預防痛風）');
    recommendedToBuy.push('✅ 鮮牛奶、無糖優格（低脂奶製品能幫助排泄尿酸，保護關節）');
  }
  if (recommendedToBuy.length < 3) {
    recommendedToBuy.push('✅ 新鮮雞蛋、無調味烘焙核桃少許（補腦顧眼睛，每天吃一點點剛剛好）');
    recommendedToBuy.push('✅ 台灣香菇、木耳、紅白蘿蔔（燉清淡蔬菜湯，腸胃順暢又清甜）');
  }

  // 生活小貼士
  const dailyCareTips: string[] = [
    '💧 每天起床與白天下床多喝 1 杯溫開水，幫助身體血液循環順暢。',
    '🚶 吃飽飯後不要馬上坐著看電視，在客廳慢走或到公園散步 15 到 20 分鐘。',
    '😴 晚上 10 點半前上床睡覺，睡飽 7 小時，血壓跟心臟才會舒服平穩。',
  ];

  // 語音朗讀專用白話文（像孫子一樣溫柔對長輩講話）
  let voiceSummary = '';
  if (statusLevel === 'red') {
    voiceSummary = isEn
      ? `Hello! I have just looked at today's numbers for you. Your blood pressure is ${systolic}, and your blood sugar is ${sugarDisplay} — a little on the high side. Cook lighter today, use one spoon less salt, and skip the sweet biscuits and drinks for now. When you shop, buy plenty of vegetables and tofu, and please do not buy instant noodles or sausages. Drink warm water and rest early!`
      : `阿公、阿婆您好！剛剛幫您看了身體數字，上壓是 ${systolic}，血糖是 ${sugarDisplay}，稍微有些偏高喔。今天煮菜要清淡一點，鹽巴少放一匙，甜的餅乾跟飲料先不要吃。去超市買菜，記得多買青菜跟豆腐，泡麵跟香腸千萬不要買喔！有空多喝溫水，早點休息！`;
  } else if (statusLevel === 'yellow') {
    voiceSummary = isEn
      ? `Hello! Your numbers today are fairly steady — blood pressure ${systolic}, blood sugar ${sugarDisplay}. Just be careful not to eat too heavily seasoned. When you shop, choose whole foods that are low in oil and salt, and take a walk — your body will feel much lighter.`
      : `長輩您好！今天的身體數字大致還算平穩，上壓 ${systolic}，血糖 ${sugarDisplay}。稍微注意不要吃太重口味，去超市買菜記得挑少油、少鹽的原形食物，散步走一走，身體就會很輕鬆喔！`;
  } else {
    voiceSummary = isEn
      ? `Hello! Wonderful news — your blood pressure ${systolic} and blood sugar ${sugarDisplay} both look really healthy today. Please keep up your good habit of eating lightly, and I wish you health and happiness every day!`
      : `阿公、阿婆您好！太棒了，您今天的血壓 ${systolic} 和血糖 ${sugarDisplay} 都非常漂亮又健康！請繼續保持清淡飲食的好習慣，祝您天天健康開心！`;
  }

  // 同步連動至食品標籤掃描的關注重點
  const linkedConditions: string[] = [];
  if (isBpHigh || isBpBorderline) linkedConditions.push('高血壓 (嚴防高鈉與高鹽)');
  if (isSugarHigh || isSugarBorderline) linkedConditions.push('糖尿病 / 血糖守護 (嚴控添加糖)');
  if (isGoutConcern) linkedConditions.push('痛風 / 尿酸 (嚴防高普林濃湯與果糖)');
  if (isLipidConcern) linkedConditions.push('高血脂 (嚴防油膩飽和脂肪與反式脂肪)');
  if (isKidneyConcern || hasEdema) linkedConditions.push('腎臟水腫 (嚴控加工磷酸鹽與重鹽)');

  return {
    status_level: statusLevel,
    status_title: statusTitle,
    simple_explanation: explanations.join('\n\n'),
    supermarket_rules: {
      do_not_buy: doNotBuy.slice(0, 4).map((x) => trStatic(x, isEn)),
      recommended_to_buy: recommendedToBuy.slice(0, 4).map((x) => trStatic(x, isEn)),
    },
    daily_care_tips: dailyCareTips.map((x) => trStatic(x, isEn)),
    voice_summary: voiceSummary,
    linked_conditions: (linkedConditions.length > 0 ? linkedConditions : ['一般健康維護']).map(
      (x) => trStatic(x, isEn)
    ),
    analysis_mode: 'smart_nutrition_engine',
  };
}
