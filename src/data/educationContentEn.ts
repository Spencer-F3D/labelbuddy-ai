/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * 食育教學內容的英文對照（Education Content — English）
 * ============================================================================
 * 【為什麼不把 educationContent.ts 翻成兩份】
 *   與 bilingualContent.ts 的理由相同：那一份是**單一資料來源**，
 *   而且 `relatedCardId`、`correctIndex`、`topic`、`forProfiles` 這些欄位
 *   與語言無關。複製成兩份只會讓日後改題目時兩邊不同步。
 *   → 維持「原文 + 對照表 + localizeXxx() 取值函式」的既有模式。
 *
 * 【安全退回原則】
 *   查不到英文時一律**退回中文原文**（由 localizeXxx 負責），
 *   不回傳 undefined、不留空 —— 寧可顯示中文，也不要畫面出現空白。
 *
 * 【純資料模組】
 *   不得引入瀏覽器或 Node 專屬 API。
 */

import type { KnowledgeCard, QuizQuestion } from '../types';
import type { Language } from '../i18n/translations';

/** 知識卡的可翻譯欄位 */
export interface KnowledgeCardText {
  title: string;
  headline: string;
  body: string[];
  tip: string;
  /** 語音朗讀稿。英文模式會用英文語音念，所以必須是英文。 */
  voiceScript: string;
}

/** 測驗題的可翻譯欄位 */
export interface QuizQuestionText {
  question: string;
  options: string[];
  explanation: string;
}

/* ===========================================================================
 * 知識卡（21 張）
 * =========================================================================*/

export const KNOWLEDGE_CARDS_EN: Record<string, KnowledgeCardText> = {
  /* --------------------------- 讀標基本功（5 張） --------------------------- */
  'card-basics-1': {
    title: 'Per 100 g vs per serving',
    headline: 'Check the unit, or the numbers will fool you',
    body: [
      'Nutrition labels usually use one of two units: "per 100 g" or "per serving".',
      '"Per 100 g" is the standard unit for comparing different products. "Per serving" is how much you actually eat.',
      'The most commonly missed point: one serving may not be the whole pack. Some biscuits have 3 servings per pack — finish the pack and you have eaten three times the numbers.',
    ],
    tip: 'Find "servings per pack" first, then multiply by how many you actually ate.',
    voiceScript:
      'When you read a nutrition label, the first thing is to check the unit. Per one hundred grams is for comparing products. Per serving is what you actually eat. Find the servings per pack first, then multiply by how much you ate.',
  },
  'card-basics-2': {
    title: 'Ingredients are listed by weight',
    headline: 'The earlier it appears, the more there is',
    body: [
      'The order of the ingredient list is regulated: the largest amount first, the smallest last.',
      'So if "sugar" is in the top three, sugar makes up a large share of the product.',
      'The reverse also holds: if a healthy ingredient the advert highlights is near the end, its actual amount may be very small.',
    ],
    tip: 'Read the first five ingredients and you can judge what this food really is.',
    voiceScript:
      'Ingredients are listed by weight, heaviest first. If sugar is in the top three, the product is high in sugar. If a healthy ingredient the advert promotes is listed last, there may be very little of it. Reading the first five is enough.',
  },
  'card-basics-3': {
    title: 'Trans fat 0 does not mean none',
    headline: 'Under 0.3 g per 100 g may be labelled 0',
    body: [
      'The rules say trans fat below 0.3 g per 100 g may be labelled as "0".',
      'So "trans fat 0 g" does not mean there is none — only that the amount is very low.',
      'To really avoid trans fat, look in the ingredient list for "hydrogenated vegetable oil", "hydrogenated palm oil" or "margarine".',
    ],
    tip: 'The word "hydrogenated" should make you pause.',
    voiceScript:
      'Trans fat labelled zero does not mean there is none. The rules allow a zero label when it is under zero point three grams per one hundred grams. To avoid it properly, check the ingredients for hydrogenated vegetable oil or margarine. The word hydrogenated is the warning sign.',
  },
  'card-basics-4': {
    title: 'Converting sodium to salt',
    headline: '400 mg of sodium is about 1 g of salt',
    body: [
      'The label says "sodium", but we normally talk about "salt". They are not the same.',
      'The conversion is simple: multiply milligrams of sodium by 2.5 to get milligrams of salt.',
      'For example, 400 mg of sodium is about 1 g of salt. The daily salt recommendation is 5 g, which is 2000 mg of sodium.',
    ],
    tip: 'Multiply sodium by 2.5 to get an amount of salt you can picture.',
    voiceScript:
      'The label says sodium, but we usually talk about salt. They are different. Multiply sodium by two point five to get salt. For example, four hundred milligrams of sodium is about one gram of salt. The daily recommendation is five grams of salt, which is two thousand milligrams of sodium.',
  },
  'card-basics-5': {
    title: 'The daily reference value',
    headline: 'That percentage is based on 2000 kcal',
    body: [
      'Labels often carry a "percentage of daily reference value" column, set by the health authority.',
      'It is calculated on 2000 kcal a day, although everyone\u2019s actual needs differ.',
      'It is still useful: if one nutrient alone reaches 40%, that item is especially high in this food.',
    ],
    tip: 'Over 20% is worth noting; over 40% deserves real caution.',
    voiceScript:
      'The daily reference value percentage on a label is based on two thousand kilocalories a day. Everyone needs different amounts, but it is still a useful guide. If one nutrient alone reaches forty percent, that item is especially high in this food. Over twenty percent is worth noting.',
  },

  /* ------------------------- 三大危險成分（5 張） ------------------------- */
  'card-dangers-1': {
    title: 'Sodium: the hidden killer in the soup',
    headline: 'One pack of instant noodles is often a whole day of salt',
    body: [
      'A pack of instant noodles usually contains 1500 to 2500 mg of sodium — close to the whole daily limit.',
      'More importantly, most of the sodium sits in the seasoning powder and the soup. Eat the noodles without drinking the soup and you cut sodium by more than half.',
      'Other high-sodium traps: hotpot broth, braising sauce, processed meats such as sausage and ham, and every kind of dipping sauce.',
    ],
    tip: 'Eating the noodles but not the soup is the fastest way to cut sodium.',
    voiceScript:
      'Sodium is the hidden killer in the soup. One pack of instant noodles often holds a whole day of salt, and most of it is in the seasoning and the soup. So eating the noodles without the soup removes more than half the sodium. Hotpot broth, braising sauce, sausage and ham are traps too.',
  },
  'card-dangers-2': {
    title: 'Added sugar: every name counts',
    headline: 'It is not only the word "sugar"',
    body: [
      'Added sugar goes by many names: sucrose, fructose, high-fructose corn syrup, maltodextrin, concentrated fruit juice, honey.',
      'The law requires "added sugar" to be declared — sugar put in during manufacturing, not sugar naturally present in the ingredients.',
      'One full-sugar bubble tea can contain over 50 g of added sugar, reaching the whole daily limit at once.',
    ],
    tip: 'The more different sugar names appear in the ingredients, the higher the total sugar usually is.',
    voiceScript:
      'Added sugar has many names: sucrose, fructose, high fructose corn syrup, maltodextrin, honey. One full-sugar bubble tea can hold more than fifty grams of added sugar, which is the whole daily limit. The more sugar names you see in the ingredients, the higher the total sugar usually is.',
  },
  'card-dangers-3': {
    title: 'Saturated fat and trans fat',
    headline: 'One raises cholesterol, the other is worst for the heart',
    body: [
      'Saturated fat comes mainly from animal fat, palm oil and coconut oil; too much raises bad cholesterol.',
      'Trans fat is man-made and harms the heart more than saturated fat. It comes mostly from hydrogenated vegetable oil and fried food.',
      'Check both on the label: read the number for saturated fat, and look for "hydrogenated" in the ingredients for trans fat.',
    ],
    tip: 'Not all fats are equal — where they come from changes what they do to your body.',
    voiceScript:
      'Saturated fat comes mainly from animal fat, palm oil and coconut oil, and raises bad cholesterol. Trans fat is man-made, worse for the heart, and comes from hydrogenated vegetable oil and fried food. For saturated fat read the number. For trans fat look for the word hydrogenated in the ingredients.',
  },
  'card-dangers-4': {
    title: 'The phosphorus and potassium you cannot see',
    headline: 'People with kidney problems must watch both',
    body: [
      'Phosphorus and potassium are minerals the body needs, but when kidney function is poor they cannot be cleared and become a burden.',
      'Processed food often contains added phosphates as a quality improver — ready-to-eat meats, hotpot items, fizzy drinks.',
      'Potassium is high in vegetables and fruit. People with kidney disease usually need to limit it, but everyone else should eat more.',
    ],
    tip: 'Seeing "phosphate" in the ingredients means phosphorus has been added.',
    voiceScript:
      'Phosphorus and potassium are minerals the body needs, but poor kidneys cannot clear them and they become a burden. Processed food often adds phosphates: ready to eat meats, hotpot items, fizzy drinks. If you see phosphate in the ingredients, phosphorus has been added. Potassium is high in vegetables and fruit. Most people should eat more, but kidney patients must limit it.',
  },
  'card-dangers-5': {
    title: 'Fibre: what people who eat out lack most',
    headline: 'Nine in ten people do not get enough',
    body: [
      'The recommendation is 25 to 35 g of fibre a day, but most people get only half.',
      'Meals eaten out rarely include many vegetables, and white rice and white noodles replace wholegrains — so fibre falls short.',
      'It is easy to fix: swap white rice for brown or mixed grain rice, add a portion of greens to every meal, and eat fruit with the skin on.',
    ],
    tip: 'Ask yourself at every meal: did I eat a fist-sized portion of vegetables?',
    voiceScript:
      'The fibre recommendation is twenty five to thirty five grams a day, but most people get half. Eating out means few vegetables and more white rice and noodles, so fibre falls short. It is easy to fix: swap white rice for brown rice, add greens to every meal, eat fruit with the skin on. Ask yourself at every meal whether you had a fist sized portion of vegetables.',
  },

  /* ------------------------- 我的專屬眉角（7 張） ------------------------- */
  'card-profiles-1': {
    title: 'High blood pressure: sodium first, then potassium',
    headline: 'Besides cutting sodium, potassium helps too',
    body: [
      'Sodium is the mineral most directly linked to high blood pressure. Keeping sodium under 2000 mg a day helps most clearly.',
      'Potassium helps the body flush out excess sodium, so more vegetables, fruit and wholegrains help as well.',
      'One caution: if you have kidney disease, potassium should not be increased — ask your doctor.',
    ],
    tip: 'Cutting sodium is step one; more vegetables and fruit is step two (unless you have kidney disease).',
    voiceScript:
      'Sodium is most directly linked to high blood pressure. Keeping sodium under two thousand milligrams a day helps most. Potassium helps flush out excess sodium, so more vegetables, fruit and wholegrains help too. But if your kidneys are not healthy, do not increase potassium. Ask your doctor.',
  },
  'card-profiles-2': {
    title: 'Diabetes: watch the blood sugar rise, not just the sugar',
    headline: 'Some foods with no added sugar still spike blood sugar',
    body: [
      'With diabetes you look not only at the sugar number, but at how fast the food raises blood sugar.',
      'Refined starches such as white rice, white bread and mashed potato raise blood sugar quickly even with no added sugar.',
      'Brown rice, oats and beans have more fibre, so blood sugar rises more gently.',
    ],
    tip: 'More fibre means a slower rise; more refined means a faster rise.',
    voiceScript:
      'With diabetes you look not only at the sugar number, but at how fast blood sugar rises. White rice, white bread and mashed potato are refined starches. Even with no added sugar they spike blood sugar. Brown rice, oats and beans have more fibre and rise more gently. More fibre means a slower rise.',
  },
  'card-profiles-3': {
    title: 'Muscle building: protein divided by calories',
    headline: 'Do not trust the big print on the front',
    body: [
      'Many products print "high protein" on the front, while the back shows only a dozen grams of protein and a lot of calories.',
      'What matters is the protein-to-calorie ratio: for example, 20 g of protein in 200 kcal is 10%.',
      'Watch out for maltodextrin and corn syrup — refined carbohydrates that add calories without adding protein.',
    ],
    tip: 'If protein is under 30% of the calories, it is not really high protein.',
    voiceScript:
      'Many products print high protein on the front, but the back may show only a dozen grams while calories are high. What matters is protein divided by calories. For example, twenty grams of protein in two hundred kilocalories is ten percent. Watch out for maltodextrin and corn syrup, which are refined carbohydrates. Under thirty percent is not really high protein.',
  },
  'card-profiles-4': {
    title: 'Eating out: how to combine convenience-store food',
    headline: 'One staple, one protein, one vegetable',
    body: [
      'To eat a balanced meal from a convenience store, use the rule of one staple, one protein, one vegetable.',
      'For the staple choose wholegrain or a rice ball; for protein, a tea egg, chicken breast or unsweetened soy milk; for vegetables, a salad or hotpot vegetables.',
      'Soup is the trap: a bowl of soup often has more sodium than the main dish. Drink less if you can.',
    ],
    tip: 'Pick the vegetables and protein first and decide the staple last — you buy less impulsively.',
    voiceScript:
      'To eat a balanced meal at a convenience store, remember one staple, one protein, one vegetable. Choose wholegrain or a rice ball, a tea egg, chicken breast or unsweetened soy milk, and salad or hotpot vegetables. Soup is the trap, because a bowl often has more sodium than the main dish. Pick the vegetables and protein first, then decide the staple.',
  },
  'card-profiles-5': {
    title: 'Students: the sugar cube trick',
    headline: 'Divide grams of sugar by 5 to get sugar cubes',
    body: [
      'One sugar cube is about 5 g of sugar. Divide the sugar on the label by 5 to get the number of cubes.',
      'For example, 40 g of sugar is 8 sugar cubes. That picture is easier to feel than a number.',
      'Sweetened drinks are the biggest sugar source for students. Switching to unsweetened tea or water is the most effective first step.',
    ],
    tip: 'Sugar ÷ 5 = sugar cubes. Use it to remind yourself.',
    voiceScript:
      'One sugar cube is about five grams of sugar. Divide the sugar on the label by five to get the number of cubes. For example, forty grams is eight cubes. That picture is easier to feel than a number. Sweetened drinks are the biggest sugar source for students. Unsweetened tea or water is the most effective first step.',
  },
  'card-profiles-6': {
    title: 'Children: fewer additives is better',
    headline: 'Names you cannot read are usually additives',
    body: [
      'Children weigh less than adults, so the same portion carries more additives per kilogram of body weight.',
      'Common ones to watch: artificial colours such as Yellow No. 4 and Red No. 40, preservatives such as benzoic acid and sorbic acid, and sweeteners.',
      'A practical rule: the more unreadable names in the ingredients, the more reason to choose something else.',
    ],
    tip: 'A child\u2019s sodium and sugar limits are only 60% of an adult\u2019s — use the child standard.',
    voiceScript:
      'Children weigh less than adults, so the same portion carries more additives per kilogram of body weight. Watch for artificial colours, preservatives and sweeteners. A practical rule is that the more unreadable names in the ingredients, the more reason to choose something else. A child\u2019s sodium and sugar limits are only sixty percent of an adult\u2019s.',
  },
  'card-profiles-7': {
    title: 'Teenagers: how much sugar is in bubble tea',
    headline: 'Full sugar, half sugar, low sugar — how many cubes?',
    body: [
      'A 700 ml full-sugar bubble tea often holds over 50 g of sugar — 10 sugar cubes.',
      'Half sugar is roughly half and low sugar roughly 30%, but every shop defines it differently and the real gap may be smaller.',
      'The most effective step is switching to unsweetened tea — that removes all the sugar at once.',
    ],
    tip: 'The daily added-sugar limit for teenagers is 40 g; one full-sugar drink goes over it.',
    voiceScript:
      'A seven hundred millilitre full sugar bubble tea often has more than fifty grams of sugar, which is ten sugar cubes. Half sugar is about half and low sugar about thirty percent, but every shop is different. The most effective step is unsweetened tea, which removes all the sugar at once. The teenage daily added sugar limit is forty grams.',
  },

  /* ------------------------- 聰明採買術（4 張） ------------------------- */
  'card-shopping-1': {
    title: 'Shorter ingredient lists are better',
    headline: 'Five items or fewer is usually closer to whole food',
    body: [
      'The longer the ingredient list, the more processing and the more additives.',
      'A practical rule: five items or fewer, with names you recognise, is usually the better choice.',
      'It is not an absolute standard, but it is a quick and useful test in the supermarket.',
    ],
    tip: 'The more ingredients you cannot read, the more reason to put it back.',
    voiceScript:
      'Shorter ingredient lists are better. A longer list means more processing and more additives. A practical rule is five items or fewer with names you recognise. The more you cannot read, the more reason to put it back.',
  },
  'card-shopping-2': {
    title: 'Compare similar products side by side',
    headline: 'Compare per 100 g, not per serving',
    body: [
      'When comparing two products, always use the same basis — usually per 100 g.',
      'Some manufacturers set a very small "serving" so the numbers look good. Comparing per 100 g avoids that.',
      'Compare these first: sodium, sugar and saturated fat — the three that matter most.',
    ],
    tip: 'Get out your phone calculator and compare per 100 g directly.',
    voiceScript:
      'To compare two products, always use the same basis, usually per one hundred grams. Some manufacturers set a very small serving so the numbers look good. Comparing per one hundred grams avoids that. Compare sodium, sugar and saturated fat first, because those three matter most.',
  },
  'card-shopping-3': {
    title: '"Sugar free" and "reduced sugar" are different',
    headline: 'Sugar free means none; reduced sugar just means less',
    body: [
      '"Sugar free" has a legal standard: under 0.5 g of sugar per 100 ml.',
      '"Reduced sugar" only means less than the original recipe — it may still be very sweet.',
      'A similar case is "no added sugar" — no sugar was added, but the sugar naturally in the ingredients remains.',
    ],
    tip: '"Free" and "reduced" are very different. Read which word it is.',
    voiceScript:
      'Sugar free and reduced sugar are different. Sugar free has a legal standard of under zero point five grams per one hundred millilitres. Reduced sugar only means less than the original recipe, and it may still be very sweet. No added sugar means no sugar was added, but the sugar already in the ingredients remains. Free and reduced are very different.',
  },
  'card-shopping-4': {
    title: 'Big packs are not always better value',
    headline: 'Work out the unit price — and how much you will eat',
    body: [
      'Big packs usually have a lower unit price, but if you then eat more, your total intake goes up.',
      'Snacks are the clearest case: a big pack is often finished in one sitting, so a small pack controls the portion better.',
      'How to decide: ask yourself "how many sittings will this pack take?" If the answer is "one", buy the small pack.',
    ],
    tip: 'Start with the small pack; move up only once you know you will finish it.',
    voiceScript:
      'Big packs are not always better value. The unit price is lower, but if you eat more, your total intake goes up. Snacks are the clearest case, because a big pack is often finished at once. Ask yourself how many sittings the pack will take. If the answer is one, buy the small pack.',
  },
};

/* ===========================================================================
 * 測驗題（14 題）
 * =========================================================================*/

export const QUIZ_QUESTIONS_EN: Record<string, QuizQuestionText> = {
  q1: {
    question:
      'A biscuit pack says "one serving 20 g, 3 servings per pack". You eat the whole pack — how many servings is that?',
    options: ['1 serving', '3 servings', 'It depends on the size of the biscuits'],
    explanation:
      'The label says 3 servings per pack, so finishing it means 3 servings. Multiply the nutrition numbers by 3 — this is the most common misreading.',
  },
  q2: {
    question: 'What order are ingredients listed in?',
    options: ['Alphabetical order', 'By weight, heaviest first', 'In the order they were added'],
    explanation:
      'Ingredients are listed from heaviest to lightest. The first items are present in the largest amounts, which makes this the fastest way to judge what a food really is.',
  },
  q3: {
    question: 'The label says "trans fat 0 g". Does that mean there is no trans fat at all?',
    options: [
      'Yes, 0 means none at all',
      'Not necessarily — under 0.3 g per 100 g may be labelled 0',
      'It depends on the manufacturer',
    ],
    explanation:
      'The rules allow a label of 0 when trans fat is under 0.3 g per 100 g. To be sure, check the ingredients for hydrogenated vegetable oil.',
  },
  q4: {
    question: 'The pack says 400 mg of sodium. Roughly how much salt is that?',
    options: ['About 1 g of salt', 'About 400 g of salt', 'They cannot be converted'],
    explanation:
      'Multiply milligrams of sodium by 2.5 to get milligrams of salt. 400 × 2.5 = 1000 mg, which is 1 g of salt.',
  },
  q5: {
    question:
      'The "percentage of daily reference value" on a label is based on how many calories?',
    options: ['1500 kcal', '2000 kcal', 'It depends on your body weight'],
    explanation:
      'The percentage is calculated on 2000 kcal a day. Individual needs differ, but it still helps you spot a nutrient that is unusually high.',
  },
  q6: {
    question: 'Where is most of the sodium in a pack of instant noodles?',
    options: ['In the noodles themselves', 'In the seasoning powder and the soup', 'In the packaging'],
    explanation:
      'Most of the sodium is in the seasoning and the soup. Eating the noodles without the soup cuts sodium a lot, and it is the most effective habit.',
  },
  q7: {
    question: 'Which of these is NOT an added sugar?',
    options: ['High-fructose corn syrup', 'Maltodextrin', 'The starch in brown rice'],
    explanation:
      'Added sugar means sugar put in during manufacturing. The starch naturally present in brown rice is not added sugar.',
  },
  q8: {
    question: 'To avoid trans fat, which word in the ingredients should you watch for?',
    options: ['"Hydrogenated"', '"Natural"', '"Vegetable"'],
    explanation:
      'Hydrogenated vegetable oil is the main source of trans fat. Seeing "hydrogenated vegetable oil", "hydrogenated palm oil" or "margarine" should make you pause.',
  },
  q9: {
    question: 'Seeing "phosphate" in the ingredients means the food…',
    options: ['Contains added phosphorus', 'Contains a lot of calcium', 'Is a natural food'],
    explanation:
      'Phosphates are often added to processed food as a quality improver. People with poor kidney function need to watch their phosphorus intake.',
  },
  q10: {
    question: 'Which nutrient do people who eat out most often lack?',
    options: ['Sodium', 'Dietary fibre', 'Saturated fat'],
    explanation:
      'Eating out means few vegetables and more refined starch, so fibre is most often lacking. Aim for a fist-sized portion of vegetables at every meal.',
  },
  q11: {
    question: 'The front of the pack says "high protein". Which number on the back should you check?',
    options: ['Only the grams of protein', 'The share of total calories that is protein', 'The pack size'],
    explanation:
      'Grams of protein alone can mislead you. Look at protein divided by calories; under 30% is usually not really high protein.',
  },
  q12: {
    question: 'A drink label says 40 g of sugar. About how many sugar cubes is that?',
    options: ['4 cubes', '8 cubes', '40 cubes'],
    explanation:
      'One sugar cube is about 5 g of sugar, so 40 ÷ 5 = 8 cubes. Sugar cubes are easier to picture than a number.',
  },
  q13: {
    question: 'To compare which of two drinks has more sugar, which basis should you use?',
    options: ['Per serving', 'Per 100 g (or 100 ml)', 'The total for the whole bottle'],
    explanation:
      'Comparing per 100 g or per 100 ml is fair. Some manufacturers set a very small "serving" so the numbers look better.',
  },
  q14: {
    question: 'What is the difference between "sugar free" and "reduced sugar"?',
    options: [
      'They mean exactly the same thing',
      'Sugar free has a legal standard; reduced sugar only means less than before',
      'Reduced sugar is less sweet than sugar free',
    ],
    explanation:
      '"Sugar free" must meet a legal standard (under 0.5 g of sugar per 100 ml). "Reduced sugar" only means less than the original recipe, and it may still be very sweet.',
  },
  b6: {
    question:
      'A pack shows both "per 100 g" and "per serving" columns. Which should you look at?',
    options: [
      'Just per serving',
      'Both: per serving tells you what you actually eat, per 100 g is the fair way to compare brands',
      'Just per 100 g',
],
    explanation:
      '"Per serving" answers "how much am I eating"; "per 100 g" answers "how heavy is this product really". Serving sizes are defined by each brand (20 g vs 50 g), so comparing per-serving numbers is easily misleading — per 100 g is the fair comparison.',
  },
  b7: {
    question:
      'The pack says "zero trans fat". Does that mean there is none at all?',
    options: [
      'Definitely none',
      'Below 0.3 g per 100 g may be labelled "zero", so there can still be a little',
      'It depends on the sugar',
],
    explanation:
      'Regulations allow "zero" when trans fat is under 0.3 g per 100 g. If the ingredient list contains "hydrogenated vegetable oil" or "margarine", it is still there and accumulates. The ingredient list is more honest than the nutrition numbers.',
  },
  b8: {
    question:
      'What is the difference between "best before" and "expiry date"?',
    options: [
      'They are the same',
      'Best before usually assumes the pack is unopened; the expiry date is the last day it is safe to eat',
      'The expiry date is the production date',
],
    explanation:
      '"Best before" typically means unopened and stored as stated; the "expiry date" is the last day it is safe to eat. Once opened, the shelf life no longer applies — follow the "consume soon after opening" note.',
  },
  b9: {
    question:
      'A snack says "one serving 25 g, 4 servings per pack, 130 kcal". You eat the whole pack. How many kcal?',
    options: [
      '130 kcal',
      '520 kcal',
      '260 kcal',
],
    explanation:
      '130 × 4 = 520 kcal. This is the most common label mistake: reading only the per-serving number while actually finishing the pack. Before buying, ask yourself: how many servings will I really eat?',
  },
  b10: {
    question:
      'Two soda crackers: brand A has 300 mg sodium per 100 g, brand B has 620 mg. What does that tell you?',
    options: [
      'They are about the same',
      'For the same weight, B has twice the salt — A is the better choice',
      'B tastes better',
],
    explanation:
      'The same kind of product can differ more than twofold between brands. Comparing within the same category is the single most effective shopping habit — better than memorising any absolute number.',
  },
  r1: {
    question:
      'What does the "% Daily Value" column on a nutrition label mean?',
    options: [
      'How much of one day\'s allowance this food uses',
      'How nutritious the food is',
      'Its ranking against other foods',
],
    explanation:
      'It answers "if I eat this serving, what share of my daily allowance is used?". It is more usable than absolute numbers — you do not need to remember that the sodium limit is 2000 mg, only what share this item takes.',
  },
  r2: {
    question:
      'A label says "sodium 800 mg, 40% Daily Value". How was that 40% worked out?',
    options: [
      'It is arbitrary',
      '800 ÷ 2000 (adult daily sodium limit) = 40%',
      '800 ÷ 800 = 100%',
],
    explanation:
      'The reference sodium limit is 2000 mg (about 5 g of salt), so 800 ÷ 2000 = 40%. Once you know who the denominator is, you can work it out yourself without memorising tables.',
  },
  r3: {
    question:
      'A serving contains 5 g of sugar. Against a 50 g daily added-sugar limit, what does that mean?',
    options: [
      'Negligible',
      'It uses 10% of the day\'s allowance; five servings reaches the limit',
      'It is already over the limit',
],
    explanation:
      '5 ÷ 50 = 10%. One serving is not much, but this kind of food is usually eaten several servings at a time. For sugar, ask "how many servings will I eat", not "how much per serving".',
  },
  r4: {
    question:
      'To compare two products whose serving sizes are defined differently, which column should you use?',
    options: [
      'Per serving',
      'Per 100 g',
      'Per pack',
],
    explanation:
      'Per 100 g is a fixed basis that does not depend on the brand\'s definition of a serving. When comparing across brands, always convert to per 100 g.',
  },
  r5: {
    question:
      'A label says "energy 2100 kJ". Roughly how many kcal is that?',
    options: [
      '2100 kcal',
      'About 500 kcal',
      'About 210 kcal',
],
    explanation:
      '1 kcal ≈ 4.184 kJ, so 2100 ÷ 4.184 ≈ 502 kcal. Imported packs often use kJ — do not panic at the big number before converting.',
  },
  r6: {
    question:
      'A label says "carbohydrate 60 g". Does that include the 8 g of sugar?',
    options: [
      'No, they are separate',
      'Yes, sugar is part of carbohydrate',
      'It depends whether added sugar is listed',
],
    explanation:
      'Carbohydrate is the family; sugars and starches are both inside it. So the sugar number is always less than or equal to the carbohydrate number. High carbohydrate with low sugar usually means starch (noodles, rice).',
  },
  r7: {
    question:
      'Which is more directly harmful to the heart: saturated fat or trans fat?',
    options: [
      'Saturated fat',
      'Trans fat',
      'Exactly the same',
],
    explanation:
      'Trans fat raises bad cholesterol and also lowers good cholesterol — it is bad on both counts. Watch for "hydrogenated vegetable oil", "shortening" and "margarine" in the ingredient list.',
  },
  r8: {
    question:
      'Are the percentages on the pack based on one serving or the whole pack?',
    options: [
      'The whole pack',
      'One serving',
      'It depends on the pack size',
],
    explanation:
      'By regulation it is per serving. If you finish the whole pack, multiply the percentage by the number of servings.',
  },
  r9: {
    question:
      'Dietary fibre shows 0 g. Does that mean there is none at all?',
    options: [
      'None at all',
      'Below the labelling threshold it may show 0, so there can be a trace',
      'It must be fake',
],
    explanation:
      'As with trans fat, small amounts may be rounded to zero. Fibre is a "more is better" nutrient, so 0 g simply means no credit here — get fibre from vegetables and whole grains.',
  },
  r10: {
    question:
      'Why do most packs not show a "% Daily Value" for protein?',
    options: [
      'Regulations do not require it',
      'Because it does not taste good',
      'Because protein does not matter',
],
    explanation:
      'Regulations only mandate percentages for a few core nutrients, and protein is not among them. Some rows show a percentage and some are blank — that is a regulatory difference, not a brand hiding something.',
  },
  d6: {
    question:
      'The ingredient list mentions "high-fructose corn syrup". How should you read that?',
    options: [
      'It is natural, so it is fine',
      'It is an added sugar, very sweet and cheap, common in drinks',
      'It is a kind of fibre',
],
    explanation:
      'High-fructose corn syrup is a very common added sugar in drinks and processed food. Its metabolism is debated, but the practical conclusion is the same: it is an added sugar and counts toward the daily limit.',
  },
  d7: {
    question:
      'The ingredient list says "hydrogenated vegetable oil". What does that usually mean?',
    options: [
      'A healthier oil',
      'The process can create trans fat, which burdens blood vessels',
      'It is olive oil',
],
    explanation:
      'Hydrogenation turns liquid oil semi-solid (for flaky texture and long shelf life), and partial hydrogenation can create trans fat. This is one of the key words to remember on an ingredient list.',
  },
  d8: {
    question:
      'Is a shorter ingredient list always better?',
    options: [
      'Shorter usually means less processed — a good quick signal',
      'Length does not matter; what matters is what the ingredients are',
      'Longer means more nutritious',
],
    explanation:
      'A short list usually means less processing. It is a quick filter, not an absolute rule — some necessary fortification also lengthens the list. The useful habit: within the same category, prefer the shorter list.',
  },
  d9: {
    question:
      'Should you worry about "monosodium glutamate" (MSG)?',
    options: [
      'Avoid it completely',
      'It mainly adds savouriness; the real thing to watch is the total sodium in the pack',
      'It is a harmful chemical',
],
    explanation:
      'MSG is generally regarded as safe at normal culinary amounts. But it contains sodium — so the question is not "does it have MSG" but "how much sodium does this pack total".',
  },
  d10: {
    question:
      'A pack says "no added cane sugar" but tastes very sweet. Why might that be?',
    options: [
      'It must be a lie',
      'It may use fructose, syrup or juice concentrate — all count as added sugar',
      'Sweeteners have no health effect at all',
],
    explanation:
      'No added cane sugar only rules out cane sugar. Judge sugar from the nutrition panel and the ingredient list (syrups, juice concentrate, maltodextrin), not from the claim on the front.',
  },
  n1: {
    question:
      'Instant noodles often approach or exceed a whole day\'s sodium. Where does it mostly come from?',
    options: [
      'The noodles themselves',
      'The seasoning and soup',
      'The packaging',
],
    explanation:
      'The noodles contain little sodium; most of it is in the powder, sauce and oil sachets. So not drinking the soup really works — it usually removes more than half the sodium.',
  },
  n2: {
    question:
      'The daily sodium limit is 2000 mg. Roughly how much table salt is that?',
    options: [
      '5 g (about one teaspoon)',
      '20 g',
      '50 g',
],
    explanation:
      'Salt is about 40% sodium, so 2000 mg sodium ≈ 5 g salt, about one dessert spoon. This conversion is handy: "sodium 800 mg" means you just ate half a teaspoon of salt.',
  },
  n3: {
    question:
      'Why is "do not drink the soup" one of the most effective ways to cut sodium?',
    options: [
      'Soup has no nutrition',
      'Salt dissolves into the soup, so skipping it removes a large share of the sodium',
      'Soup is high in calories',
],
    explanation:
      'Salt is water-soluble, so it dissolves into the broth during cooking. Eating the noodles but leaving the soup is one of the few ways to cut sodium without changing how the food tastes.',
  },
  n4: {
    question:
      'What does a "low sodium" claim actually mean?',
    options: [
      'No sodium at all',
      'Below a regulatory threshold per 100 g — lower than usual, but not low enough to eat freely',
      'You can eat it without limit',
],
    explanation:
      '"Low sodium" is a relative claim: lower than comparable products, not a licence to eat unlimited amounts. The safest habit is still to read the actual milligrams on the nutrition panel.',
  },
  n5: {
    question:
      'About how much sugar is in a 330 ml can of soft drink?',
    options: [
      'About 3 g',
      'About 30 g (6–7 sugar cubes)',
      'About 100 g',
],
    explanation:
      'Soft drinks run about 8–10 g sugar per 100 ml, so a 330 ml can is 26–33 g. One can uses more than half the daily added-sugar allowance — and it does not fill you up.',
  },
  n6: {
    question:
      'What is the difference between "sugar free" and "zero sugar"?',
    options: [
      'They are identical',
      '"Sugar free" usually means under 0.5 g per 100 ml, so traces may remain; both are relative claims',
      'Only "zero" means truly none',
],
    explanation:
      'Both are regulated content claims with slightly different thresholds, but the point is the same: they mean "below a certain amount", not "absolutely none". The only truly sugar-free drinks are water and unsweetened tea.',
  },
  n7: {
    question:
      'Does pure fruit juice deserve the same sugar attention?',
    options: [
      'No, it is natural',
      'Yes: the sugar is natural but the fibre is gone, so it absorbs quickly and is easy to overdrink',
      'Juice sugar does not count',
],
    explanation:
      'Whole fruit has fibre that slows absorption; juicing removes most of it, so one glass can carry the sugar of two or three fruits. Eat the fruit when you can.',
  },
  n8: {
    question:
      'When do you actually need a sports drink?',
    options: [
      'Every day',
      'After heavy sweating, more than an hour of exercise, or on medical advice',
      'Whenever you are thirsty',
],
    explanation:
      'Sports drinks are designed to replace lost electrolytes and sugar. If you have not been sweating heavily, it is just a sugary drink. For everyday thirst, water is best.',
  },
  n9: {
    question:
      'How does sugar affect teeth versus blood sugar?',
    options: [
      'Exactly the same',
      'Teeth are affected mainly by how often you eat sugar; blood sugar by the total amount',
      'It only affects teeth',
],
    explanation:
      'Cavities depend on how often and how long sugar sits in the mouth, so small amounts many times is worse than once. Blood sugar depends on total amount. The same sweet, viewed two ways.',
  },
  n10: {
    question:
      'What is the most overlooked source of sodium?',
    options: [
      'Salt added at home',
      'Bread, toast and biscuits — processed foods that do not taste salty',
      'Fruit',
],
    explanation:
      'Bread and baked goods often carry significant sodium (for fermentation and texture) while tasting not salty at all. Watching only "salty foods" misses these. That is why you read labels instead of trusting your tongue.',
  },
  pf3: {
    question:
      'Which two items should older adults check first?',
    options: [
      'Calories and protein',
      'Sodium and sugar',
      'Fibre and vitamins',
],
    explanation:
      'Blood pressure and blood sugar are the most common health concerns in later life, and sodium and sugar are their most direct dietary drivers. Checking these two first blocks most of the risk.',
  },
  pf4: {
    question:
      'Why are the sodium and sugar limits for children lower than for adults?',
    options: [
      'Children weigh less, so the same amount is relatively larger',
      'Because children do not like them',
      'There is no real difference',
],
    explanation:
      'Reference values are scaled by body weight and metabolism. The same serving that is "a bit salty" for an adult can be close to a whole day\'s allowance for a child.',
  },
  pf5: {
    question:
      'Teenagers are very active. What should they watch on a label?',
    options: [
      'Nothing, just eat',
      'Whether calories are enough, and whether the sugar comes from drinks',
      'Only protein',
],
    explanation:
      'High activity does need more calories, but they are best from proper meals rather than sugary drinks. Drink sugar is the easiest to overdo and the least filling.',
  },
  pf6: {
    question:
      'Which item should people who train check first?',
    options: [
      'Protein and total calories',
      'Sodium',
      'Dietary fibre',
],
    explanation:
      'Both bulking and cutting depend on protein and total calories. But processed meats (sausages, bacon) are high in protein and also very high in sodium — hitting your protein target does not make them a good choice.',
  },
  pf7: {
    question:
      'What is the most practical label habit for a student eating out?',
    options: [
      'Memorise every nutrient limit',
      'Check sodium and sugar per serving, then think about how many servings you will eat',
      'Only look at calories',
],
    explanation:
      'When eating out there is no time for a full audit. Two habits — check sodium and sugar, then multiply by servings — block most of the problems and take ten seconds.',
  },
  pf8: {
    question:
      'From midlife onward, which values matter most because they accumulate?',
    options: [
      'Sodium and saturated fat',
      'Vitamin C',
      'Water',
],
    explanation:
      'Blood pressure and blood lipids change gradually and do not send an acute warning. In midlife the goal is "a little less, consistently", not "very strict occasionally".',
  },
  pf9: {
    question:
      'Do the recommendations for the same food differ between profiles?',
    options: [
      'Exactly the same',
      'Yes — daily reference values depend on age and health status',
      'Only on body weight',
],
    explanation:
      'This is why the app asks you to choose a profile first. The same instant noodles can be red for an older adult and yellow for an active teenager. The standard is not inconsistent; the denominator is different.',
  },
  pf10: {
    question:
      'For someone with high blood pressure, what single habit is most useful when shopping?',
    options: [
      'Avoid everything',
      'Within the same category, always pick up two and compare their sodium',
      'Just do not drink soup',
],
    explanation:
      'You do not need absolute numbers — just the habit of comparing within the same shelf. Over time you notice that a just-as-tasty option with half the sodium is usually right next to it.',
  },
  sh3: {
    question:
      'Two products in the same category: one cheap, one dear. How to choose?',
    options: [
      'Take the cheap one',
      'Compare sodium and sugar per 100 g; if the gap is large, the dearer one is worth it',
      'Take the prettier pack',
],
    explanation:
      'A price difference is a one-off; a formulation difference is a daily accumulation. If the dearer one has half the sodium, the long-term effect outweighs the few extra dollars.',
  },
  sh4: {
    question:
      'Is a larger pack always better value?',
    options: [
      'Always',
      'The unit price may be lower, but you may eat more, so the total can be worse',
      'Larger packs keep longer',
],
    explanation:
      'Large packs usually cost less per gram, but "how much you take is how much you eat" is a well-documented effect. Ask "how much of this will I eat in one go", not "how much per gram".',
  },
  sh5: {
    question:
      'Canned and frozen ready meals usually run high in which item?',
    options: [
      'Sodium',
      'Vitamins',
      'Fibre',
],
    explanation:
      'For preservation and flavour, canned and ready meals are usually high in sodium. They are not forbidden — just understand they belong to the "already seasoned" group, so compare them with their peers, not with fresh food.',
  },
  sh6: {
    question:
      'What is the difference between "contains whole grain" and "100% whole grain"?',
    options: [
      'None',
      '"Contains" only means some was added, possibly very little; "100%" means all of the grain is whole',
      '"Contains" has more',
],
    explanation:
      '"Contains whole grain" does not guarantee a proportion. To judge, look at how early the whole grain appears in the ingredient list, or find a product that states the percentage.',
  },
  sh7: {
    question:
      'What is the fastest useful check when buying a drink?',
    options: [
      'Read the big claims on the front',
      'Turn it over: sugar per 100 ml, then the total volume',
      'Look at the colour',
],
    explanation:
      'Front-of-pack claims are marketing; the nutrition panel on the back is fact. Sugar per 100 ml × volume ÷ 100 gives the total sugar in the bottle — one mental calculation is enough.',
  },
  sh8: {
    question:
      'Why prefer foods with a shorter ingredient list?',
    options: [
      'Short means cheap',
      'It usually means less processing and fewer additives',
      'Short is always more nutritious',
],
    explanation:
      'A short ingredient list usually means the food is closer to its original form. It is a quick filter, not an absolute rule — the nutrition numbers still decide.',
  },
  sh9: {
    question:
      'Does shopping for fresh food first change what ends up in your trolley?',
    options: [
      'No effect',
      'Yes — it makes the trolley about "what shall I cook" rather than "what snacks do I fancy"',
      'Snacks first saves time',
],
    explanation:
      'Order affects the final trolley. Starting in the fresh section frames your shopping around meals rather than around snacks.',
  },
  sh10: {
    question:
      'What is the most rational response to a "buy one get one free" offer?',
    options: [
      'Great value, always buy',
      'Ask "would I have bought this anyway?" — a discount on something you do not need saves nothing',
      'Check the shelf life',
],
    explanation:
      'A discount changes the price, not your need. A useful self-check: "if it were not on offer, would I buy it today?" If not, the discount saved you nothing.',
  },
};

/* ===========================================================================
 * 取值函式
 * =========================================================================*/

/**
 * 把知識卡換成指定語言。
 *
 * ⚠️ 只換「可翻譯欄位」，`id`／`topic`／`forProfiles`／`relatedCardId` 原封不動 ——
 *    那些是程式邏輯在用的，翻了會壞。
 * ⚠️ 查不到英文時**整張退回中文原文**，不會出現半英半中。
 */
export function localizeCard(card: KnowledgeCard, language: Language): KnowledgeCard {
  if (language !== 'en') return card;
  const text = KNOWLEDGE_CARDS_EN[card.id];
  if (!text) return card;
  return {
    ...card,
    title: text.title,
    headline: text.headline,
    body: text.body,
    tip: text.tip,
    voiceScript: text.voiceScript,
  };
}

/** 把測驗題換成指定語言。同樣只換顯示欄位，`correctIndex` 不動。 */
export function localizeQuestion(
  question: QuizQuestion,
  language: Language
): QuizQuestion {
  if (language !== 'en') return question;
  const text = QUIZ_QUESTIONS_EN[question.id];
  if (!text) return question;
  return {
    ...question,
    question: text.question,
    options: text.options,
    explanation: text.explanation,
  };
}
