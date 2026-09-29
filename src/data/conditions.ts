/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChronicCondition, ConditionCategory } from '../types';

export interface ConditionCategoryItem {
  id: 'all' | ConditionCategory;
  name: string;
  icon: string;
}

// ⚠️ 膠囊要在 320px 窄機上「一行放得下兩顆」才不會變成直排。
//    實測可用寬約 310px，一顆膠囊 = emoji 20px + gap 6px + 文字 + 左右內距 24px。
//    所以名稱一律控制在 5 個全形字以內（約 80px）→ 一顆約 130px，兩顆剛好。
//    若日後加長名稱，請重新驗證 320px 下是否還能兩顆一行。
export const CONDITION_CATEGORIES: ConditionCategoryItem[] = [
  { id: 'all', name: '全部 (12種)', icon: '📋' },
  { id: 'cardio', name: '心血管', icon: '🫀' },
  { id: 'metabolic', name: '血糖代謝', icon: '🩸' },
  { id: 'organ', name: '臟器骨骼', icon: '🦴' },
  { id: 'digestive', name: '腸胃消化', icon: '🌿' },
  { id: 'allergen', name: '食物過敏原', icon: '🛡️' },
];

export const PHYSICAL_INDICATORS: ChronicCondition[] = [
  {
    id: 'hypertension',
    name: '高血壓',
    category: 'cardio',
    description: '把關食品鈉含量與鹽分，預防血壓飆高及中風風險（少鹽、少味精）',
    targetNutrients: ['鈉 (Sodium)', '食鹽', '味精 (L-麩酸鈉)', '高鈉醬油', '小蘇打'],
    defaultChecked: true,
  },
  {
    id: 'diabetes',
    name: '糖尿病',
    category: 'metabolic',
    description: '把關精緻糖、麥芽糊精與高 GI 碳水化合物，防止飯後血糖劇烈波動',
    targetNutrients: ['添加糖 (Added Sugars)', '高果糖玉米糖漿', '麥芽糖', '葡萄糖', '精緻澱粉'],
    defaultChecked: true,
  },
  {
    id: 'hyperlipidemia',
    name: '高血脂',
    category: 'cardio',
    description: '把關飽和脂肪、反式脂肪與膽固醇，預防動脈硬化與心血管堵塞',
    targetNutrients: ['飽和脂肪 (Saturated Fat)', '反式脂肪 (Trans Fat)', '棕櫚油', '人造奶油', '氫化植物油'],
    defaultChecked: true,
  },
  {
    id: 'gout',
    name: '痛風',
    category: 'metabolic',
    description: '把關高普林成分（濃縮高湯、動物內臟抽出物、酵母）與果糖，預防痛風發作',
    targetNutrients: ['高普林 (Purine)', '果糖 (Fructose)', '酵母抽出物', '濃縮高湯粉', '肉精膏'],
    defaultChecked: false,
  },
  {
    id: 'kidney_disease',
    name: '腎臟病',
    category: 'organ',
    description: '嚴格把關鈉、鉀、無機磷酸鹽（加工防腐劑/品質改良劑）與過量蛋白質負荷',
    targetNutrients: ['多磷酸鹽/焦磷酸鈉', '高鉀鹽', '高鈉', '高蛋白負荷'],
    defaultChecked: false,
  },
  {
    id: 'cardiovascular',
    name: '心血管疾病',
    category: 'cardio',
    description: '排查反式脂肪酸、重油重鹽及加工紅肉亞硝酸鹽，維護心臟與微血管彈性',
    targetNutrients: ['反式脂肪', '重度加工鹽', '亞硝酸鹽 (加工肉)', '精煉棕櫚油'],
    defaultChecked: false,
  },
  {
    id: 'gerd',
    name: '胃食道逆流',
    category: 'digestive',
    description: '排查辛辣刺激（辣椒、黑胡椒）、高酸度（檸檬酸）、咖啡因、薄荷及油膩油炸',
    targetNutrients: ['辣椒素 (Capsaicin)', '高濃度咖啡因', '濃檸檬酸', '薄荷腦', '重度油炸'],
    defaultChecked: false,
  },
  {
    id: 'osteoporosis',
    name: '骨質疏鬆',
    category: 'organ',
    description: '評估鈣質成分，警示過量碳酸飲料、多磷酸鹽與重鹽加速體內鈣質流失',
    targetNutrients: ['碳酸/磷酸 (Phosphoric Acid)', '超量鈉鹽 (加速排鈣)', '無機磷添加物'],
    defaultChecked: false,
  },
  {
    id: 'peanut_allergy',
    name: '花生過敏',
    category: 'allergen',
    description: '清查花生、堅果與產線交叉污染警示',
    targetNutrients: ['花生 (Peanuts)', '核桃/腰果/杏仁 (Tree Nuts)', '花生油脂'],
    defaultChecked: false,
  },
  {
    id: 'seafood_allergy',
    name: '海鮮過敏',
    category: 'allergen',
    description: '清查蝦蟹、貝類、魚類及魚露蝦醬',
    targetNutrients: ['蝦蟹甲殼類 (Crustacean)', '魚類 (Fish)', '貝類 (Mollusks)', '蝦醬/魚露'],
    defaultChecked: false,
  },
  {
    id: 'lactose_intolerance',
    name: '乳糖不耐',
    category: 'allergen',
    description: '清查牛奶、乳清蛋白、酪蛋白與奶油',
    targetNutrients: ['乳糖 (Lactose)', '全脂/脫脂奶粉', '乳清蛋白 (Whey)', '酪蛋白 (Casein)'],
    defaultChecked: false,
  },
  {
    id: 'gluten_sensitivity',
    name: '麩質過敏',
    category: 'allergen',
    description: '清查小麥、大麥、黑麥與燕麥成分',
    targetNutrients: ['小麥粉 (Wheat Flour)', '大麥芽 (Barley Malt)', '黑麥 (Rye)', '麵筋蛋白 (Gluten)'],
    defaultChecked: false,
  },
];
