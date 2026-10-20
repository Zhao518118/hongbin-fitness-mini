const test = require('node:test');
const assert = require('node:assert/strict');
const Food = require('../miniprogram/lib/nutrition');
const { setup, call, complete } = require('./helpers');
test('所有餐次、推荐组合和32种忌口组合均有合法搭配', () => {
  for (let mask = 0; mask < 32; mask++) {
    const avoid = Food.AVOIDS.filter((_, i) => mask & (1 << i)).map(row => row.id);
    for (const meal of Food.MEALS) for (const kind of Food.PRESETS) {
      const plan = Food.preset(meal.id, kind.id, avoid);
      assert.deepEqual(Food.validate(meal.id, plan, avoid), plan);
      const ids = [plan.grainId, plan.proteinId, ...plan.produceIds, plan.extraId].filter(Boolean);
      assert.ok(ids.every(id => !Food.FOOD.find(row => row.id === id).tags.some(tag => avoid.includes(tag))));
    }
  }
});
test('错误餐次、食物分组、重复蔬菜和偏好冲突会被拒绝', () => {
  const plan = Food.preset('lunch', 'balanced');
  for (const patch of [{ grainId: 'chicken' }, { produceIds: [] }, { produceIds: ['tomato', 'tomato'] }, { proteinId: 'yogurt' }]) assert.throws(() => Food.validate('lunch', { ...plan, ...patch }, []));
  assert.throws(() => Food.validate('other', plan, []));
  assert.throws(() => Food.validate('breakfast', Food.preset('breakfast', 'balanced'), ['egg']));
});
test('食谱仅本人可见，未付费不能保存，保存不会产生有效日', () => {
  const state = setup(); const payload = { meal: 'lunch', plan: Food.preset('lunch', 'balanced'), preferences: ['milk'] };
  assert.throws(() => call(state, 'demo-visitor', 'mealPlan', payload));
  const before = call(state, 'demo-member', 'view').period.valid;
  const view = call(state, 'demo-member', 'mealPlan', payload);
  assert.deepEqual(view.nutrition.preferences, ['milk']); assert.ok(view.nutrition.plans.lunch);
  assert.equal(view.period.valid, before);
  assert.equal(call(state, 'demo-peer', 'view').nutrition.plans.lunch, undefined);
});
test('显式未完成晚间或三餐不能伪造成有效日', () => {
  for (const patch of [{ mealDone: false }, { eveningDone: false }]) assert.equal(call(setup(), 'demo-member', 'checkin', { ...complete, ...patch }).currentRecord.status, 'partial');
});
