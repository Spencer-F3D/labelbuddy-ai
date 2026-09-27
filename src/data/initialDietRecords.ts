import { DietRecord } from '../types';

/**
 * 預設長者過去一週的真實超市食品掃描紀錄（7 天內）
 * 幫助長輩一進來就能看到本週的健康飲食分析與習慣追蹤反饋
 */
export function getInitialDietRecords(): DietRecord[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  return [
    {
      id: 'rec-1',
      timestamp: now - Math.floor(dayMs * 0.5), // 今天上午
      dateString: '今天 上午 10:15',
      foodName: '純天然高纖大燕麥片',
      risk_level: 'green',
      warning_title: '✅ 適合食用：高纖無鈉，保護血管',
      plain_summary: '長輩您好！這款燕麥片幾乎沒有添加鈉和砂糖，膳食纖維非常豐富，對您的血壓和腸胃都很有幫助，可以放心每天當早餐吃！',
      alternative_advice: '煮的時候可以加一點溫熱的無糖黑豆漿，營養更全面更香濃。',
      matched_conditions: ['高血壓', '糖尿病'],
    },
    {
      id: 'rec-2',
      timestamp: now - Math.floor(dayMs * 1.3), // 昨天
      dateString: '昨天 下午 03:40',
      foodName: '低糖黑豆豆漿',
      risk_level: 'green',
      warning_title: '✅ 適合食用：天然植物蛋白',
      plain_summary: '這款黑豆豆漿只有微量天然大豆糖分，沒有額外加精緻果糖，植物蛋白質豐富，很適合當下午點心解渴補充體力！',
      alternative_advice: '如果不習慣喝冰的，倒進馬克杯微波加熱一分鐘溫溫喝，對腸胃更好。',
      matched_conditions: ['糖尿病'],
    },
    {
      id: 'rec-3',
      timestamp: now - Math.floor(dayMs * 2.2), // 2天前
      dateString: '2天前 上午 11:20',
      foodName: '特濃紅燒牛肉泡麵',
      risk_level: 'red',
      warning_title: '⚠️ 不建議購買：一包鈉含量高達 2350mg',
      plain_summary: '這包泡麵鈉含量超過整天的一日上限！而且調味油包含有花生油脂香料，對您的高血壓和花生過敏都有極大負擔，千萬不要買！',
      alternative_advice: '想吃熱呼呼的湯麵，推薦改選超市生鮮區的純蕎麥麵或無鹽米粉，自己加青菜瘦肉煮清湯。',
      matched_conditions: ['高血壓', '花生過敏'],
    },
    {
      id: 'rec-4',
      timestamp: now - Math.floor(dayMs * 3.5), // 3天前
      dateString: '3天前 下午 02:10',
      foodName: '古法日曬無添加海鹽蘇打餅',
      risk_level: 'yellow',
      warning_title: '🟡 請留意份量：吃兩片嚐味即可',
      plain_summary: '這款蘇打餅乾口感酥脆，但表面灑了些許海鹽，吃兩三片配茶很舒服，但千萬別不知不覺吃完整條，否則鈉攝取容易超標。',
      alternative_advice: '吃的時候配一大杯溫開水或決明子茶，幫助體內代謝多餘鹽分。',
      matched_conditions: ['高血壓', '腎臟病'],
    },
    {
      id: 'rec-5',
      timestamp: now - Math.floor(dayMs * 4.8), // 4天前
      dateString: '4天前 上午 09:50',
      foodName: '無加糖全脂鮮牛奶',
      risk_level: 'green',
      warning_title: '✅ 適合食用：天然高鈣，骨質強健',
      plain_summary: '100% 純生乳製成，無任何化學防腐劑或外加糖精，豐富優質鈣質對長輩骨骼保養特別好！',
      alternative_advice: '早起飯後喝一杯溫牛奶，吸收效果最好。',
      matched_conditions: ['高血壓'],
    },
    {
      id: 'rec-6',
      timestamp: now - Math.floor(dayMs * 6.1), // 6天前
      dateString: '6天前 下午 04:30',
      foodName: '傳統五香滷豆乾零嘴包',
      risk_level: 'yellow',
      warning_title: '🟡 請留意份量：醬汁鈉糖偏高',
      plain_summary: '豆乾雖然豆香十足，但因為是五香蜜汁厚滷，醬油與砂糖比例較重，嚐一兩塊解解饞就好，不要當正餐吃。',
      alternative_advice: '建議可選購冷藏未調味的純板豆腐或生豆包，回家用少許蔥花香油清蒸更健康。',
      matched_conditions: ['高血壓', '糖尿病'],
    },
  ];
}
