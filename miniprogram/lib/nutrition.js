'use strict';
const D = require('./domain');
const MEALS = [
  { id: 'breakfast', name: '早餐', english: 'BREAKFAST', time: '07:30', note: '蛋白质和主食一起吃，给清晨一个稳稳的开始。' },
  { id: 'lunch', name: '午餐', english: 'LUNCH', time: '12:00', note: '蔬菜占半盘，搭配蛋白质与适量主食，正常吃饱。' },
  { id: 'dinner', name: '晚餐', english: 'EARLY DINNER', time: '17:30', note: '17—18点完成一顿完整、方便的晚餐，不以挨饿为目标。' }
];
const FOOD = [
  { id: 'oats', group: 'grain', name: '燕麦', portion: '约半碗熟燕麦', meals: ['breakfast'], tags: [] },
  { id: 'bread', group: 'grain', name: '全麦面包', portion: '约1—2片', tags: [] },
  { id: 'corn', group: 'grain', name: '玉米', portion: '约1小根', tags: [] },
  { id: 'sweetpotato', group: 'grain', name: '红薯', portion: '约1小个', tags: [] },
  { id: 'rice', group: 'grain', name: '杂粮饭', portion: '约1拳熟饭', meals: ['lunch', 'dinner'], tags: [] },
  { id: 'noodles', group: 'grain', name: '荞麦面', portion: '约1拳熟面', meals: ['lunch', 'dinner'], tags: [] },
  { id: 'egg', group: 'protein', name: '鸡蛋', portion: '约1—2个，结合其他食物调整', tags: ['egg'] },
  { id: 'chicken', group: 'protein', name: '去皮鸡肉', portion: '约1掌熟肉', tags: [] },
  { id: 'fish', group: 'protein', name: '清蒸鱼', portion: '约1掌鱼肉', meals: ['lunch', 'dinner'], tags: ['seafood'] },
  { id: 'shrimp', group: 'protein', name: '虾仁', portion: '约1掌', meals: ['lunch', 'dinner'], tags: ['seafood'] },
  { id: 'beef', group: 'protein', name: '瘦牛肉', portion: '约1掌熟肉', meals: ['lunch', 'dinner'], tags: [] },
  { id: 'tofu', group: 'protein', name: '北豆腐', portion: '约1掌厚块，份量可调整', tags: ['soy'] },
  { id: 'yogurt', group: 'protein', name: '原味无糖酸奶', portion: '约1杯，可搭配其他蛋白质', meals: ['breakfast'], tags: ['milk'] },
  { id: 'tomato', group: 'produce', name: '番茄', portion: '约1拳', tags: [] },
  { id: 'cucumber', group: 'produce', name: '黄瓜', portion: '约1拳', tags: [] },
  { id: 'broccoli', group: 'produce', name: '西兰花', portion: '约1拳', tags: [] },
  { id: 'spinach', group: 'produce', name: '菠菜', portion: '约1拳熟菜', tags: [] },
  { id: 'lettuce', group: 'produce', name: '生菜', portion: '约1—2拳', tags: [] },
  { id: 'cabbage', group: 'produce', name: '圆白菜', portion: '约1拳', tags: [] },
  { id: 'bokchoy', group: 'produce', name: '小白菜', portion: '约1拳熟菜', tags: [] },
  { id: 'asparagus', group: 'produce', name: '芦笋', portion: '约1拳', tags: [] },
  { id: 'mushroom', group: 'produce', name: '菌菇', portion: '约1拳', tags: [] },
  { id: 'pepper', group: 'produce', name: '彩椒', portion: '约1拳', tags: [] },
  { id: 'zucchini', group: 'produce', name: '西葫芦', portion: '约1拳', tags: [] },
  { id: 'carrot', group: 'produce', name: '胡萝卜', portion: '约1拳', tags: [] },
  { id: 'cauliflower', group: 'produce', name: '菜花', portion: '约1拳', tags: [] },
  { id: 'celery', group: 'produce', name: '芹菜', portion: '约1拳', tags: [] },
  { id: 'milk', group: 'extra', name: '无糖奶', portion: '约1杯', tags: ['milk'] },
  { id: 'soymilk', group: 'extra', name: '无糖豆浆', portion: '约1杯', tags: ['soy'] },
  { id: 'apple', group: 'extra', name: '苹果', portion: '约1小个', tags: [] },
  { id: 'berries', group: 'extra', name: '莓果', portion: '约1小把', tags: [] },
  { id: 'orange', group: 'extra', name: '橙子', portion: '约1小个', tags: [] },
  { id: 'nuts', group: 'extra', name: '原味坚果', portion: '按小份取用，不边吃边添', tags: ['nuts'] }
];
const AVOIDS = [{ id: 'milk', name: '不选奶类' }, { id: 'egg', name: '不选蛋类' }, { id: 'seafood', name: '不选鱼虾' }, { id: 'soy', name: '不选大豆' }, { id: 'nuts', name: '不选坚果' }];
const GROUPS = [
  { id: 'grain', number: '01', name: '选一份主食', hint: '从约1拳熟食起步，结合个人需要调整。', field: 'grainId' },
  { id: 'protein', number: '02', name: '选一份蛋白质', hint: '肉、鱼、蛋、豆制品轮换，烹饪尽量少油。', field: 'proteinId' },
  { id: 'produce', number: '03', name: '选1—2种蔬菜', hint: '午晚餐争取蔬菜占半盘，深浅颜色搭配。', field: 'produceIds' },
  { id: 'extra', number: '04', name: '再加一份，可选', hint: '水果、奶或少量坚果按全天饮食安排，不必每样都吃。', field: 'extraId' }
];
const PRESETS = [{ id: 'balanced', name: '家常均衡' }, { id: 'convenient', name: '便利轻食' }, { id: 'plant', name: '植物友好' }];
const BASE = {
  breakfast: { grainId: 'oats', proteinId: 'egg', produceIds: ['tomato', 'cucumber'], extraId: 'milk' },
  lunch: { grainId: 'rice', proteinId: 'chicken', produceIds: ['broccoli', 'mushroom'], extraId: 'apple' },
  dinner: { grainId: 'corn', proteinId: 'tofu', produceIds: ['lettuce', 'tomato'], extraId: 'milk' }
};
function allowed(food, meal, preferences) { return (!food.meals || food.meals.includes(meal)) && !food.tags.some(tag => preferences.includes(tag)); }
function options(meal, preferences, group) { return FOOD.filter(food => food.group === group && allowed(food, meal, preferences)); }
function preferences(input) {
  D.requireThat(Array.isArray(input) && input.length <= AVOIDS.length && input.every(id => AVOIDS.some(row => row.id === id)), 'MEAL', '食材偏好无效');
  return Array.from(new Set(input));
}
function preset(meal, kind, avoid = []) {
  D.requireThat(MEALS.some(item => item.id === meal), 'MEAL', '餐次无效');
  const plan = Object.assign({}, BASE[meal], { produceIds: BASE[meal].produceIds.slice() });
  if (kind === 'convenient') Object.assign(plan, { grainId: meal === 'lunch' ? 'sweetpotato' : 'bread', proteinId: 'egg', produceIds: ['tomato', 'cucumber'], extraId: 'apple' });
  if (kind === 'plant') Object.assign(plan, { proteinId: 'tofu', extraId: meal === 'breakfast' ? 'soymilk' : 'orange' });
  for (const group of GROUPS) {
    const available = options(meal, avoid, group.id);
    if (group.id === 'produce') plan.produceIds = plan.produceIds.filter(id => available.some(row => row.id === id));
    else if (!available.some(row => row.id === plan[group.field])) plan[group.field] = group.id === 'extra' ? '' : available[0].id;
  }
  if (!plan.produceIds.length) plan.produceIds = [options(meal, avoid, 'produce')[0].id];
  return plan;
}
function validate(meal, input, avoid) {
  D.requireThat(MEALS.some(row => row.id === meal), 'MEAL', '请选择早餐、午餐或晚餐');
  D.requireThat(input && typeof input === 'object', 'MEAL', '请先选择搭配');
  const select = (field, group) => {
    const value = input[field];
    D.requireThat(typeof value === 'string' && options(meal, avoid, group).some(row => row.id === value), 'MEAL', '搭配包含不适合当前餐次或已避开的食材');
    return value;
  };
  const grainId = select('grainId', 'grain'); const proteinId = select('proteinId', 'protein');
  D.requireThat(Array.isArray(input.produceIds) && input.produceIds.length >= 1 && input.produceIds.length <= 2 && new Set(input.produceIds).size === input.produceIds.length, 'MEAL', '请选择1—2种不同蔬菜');
  const produceIds = input.produceIds.map(id => {
    D.requireThat(options(meal, avoid, 'produce').some(row => row.id === id), 'MEAL', '蔬菜选项无效'); return id;
  });
  const extraId = input.extraId ? select('extraId', 'extra') : '';
  return { grainId, proteinId, produceIds, extraId };
}
function summary(meal, saved, avoid = []) {
  const plan = saved || preset(meal, 'balanced', avoid);
  const ids = [plan.grainId, plan.proteinId].concat(plan.produceIds || [], plan.extraId || []).filter(Boolean);
  const foods = ids.map(id => FOOD.find(row => row.id === id)).filter(Boolean);
  return Object.assign({}, MEALS.find(row => row.id === meal), { text: foods.map(food => food.name).join(' · '), saved: !!saved,
    needsReview: foods.some(food => !allowed(food, meal, avoid)) });
}
module.exports = { MEALS, FOOD, AVOIDS, GROUPS, PRESETS, options, preferences, preset, validate, summary };
