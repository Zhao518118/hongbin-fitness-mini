const UI = require('../../lib/ui');
const Food = require('../../lib/nutrition');
Page({
  data: { view: null, loading: true, busy: false, error: '', meal: 'breakfast', meals: Food.MEALS, presets: Food.PRESETS, preferences: [], draft: null, groups: [], avoids: [], activePreset: 'balanced', summary: '', showCustomization: false },
  onLoad(query) { if (query && Food.MEALS.some(row => row.id === query.meal)) this.setData({ meal: query.meal }); },
  async onShow() { const view = await UI.refresh(this); if (view) { this.setData({ preferences: view.nutrition.preferences.slice() }); this.loadDraft(); } },
  retry() { return this.onShow(); },
  loadDraft() {
    const saved = this.data.view.nutrition.plans[this.data.meal]; let draft;
    try { draft = saved ? Food.validate(this.data.meal, saved, this.data.preferences) : Food.preset(this.data.meal, 'balanced', this.data.preferences); }
    catch (_) { draft = Food.preset(this.data.meal, 'balanced', this.data.preferences); }
    this.setData({ draft, activePreset: saved ? '' : 'balanced' }); this.rebuild();
  },
  rebuild() {
    const { meal, draft, preferences } = this.data;
    this.setData({ mealInfo: Food.MEALS.find(row => row.id === meal), summary: Food.summary(meal, draft, preferences).text,
      avoids: Food.AVOIDS.map(row => Object.assign({}, row, { selected: preferences.includes(row.id) })),
      groups: Food.GROUPS.map(group => Object.assign({}, group, { foods: Food.options(meal, preferences, group.id).map(food => Object.assign({}, food, { selected: group.id === 'produce' ? draft.produceIds.includes(food.id) : draft[group.field] === food.id })) })) });
  },
  customize() { this.setData({ showCustomization: !this.data.showCustomization }); },
  chooseMeal(event) { this.setData({ meal: event.currentTarget.dataset.meal }); this.loadDraft(); },
  choosePreset(event) { const kind = event.currentTarget.dataset.preset; this.setData({ draft: Food.preset(this.data.meal, kind, this.data.preferences), activePreset: kind }); this.rebuild(); },
  chooseFood(event) {
    const { group, field, id } = event.currentTarget.dataset; const draft = Object.assign({}, this.data.draft, { produceIds: this.data.draft.produceIds.slice() });
    if (group === 'produce') {
      if (draft.produceIds.includes(id)) draft.produceIds = draft.produceIds.filter(value => value !== id);
      else if (draft.produceIds.length < 2) draft.produceIds.push(id);
      else { wx.showToast({ title: '先取消一种，再换喜欢的蔬菜', icon: 'none' }); return; }
    } else draft[field] = group === 'extra' && draft[field] === id ? '' : id;
    this.setData({ draft, activePreset: '' }); this.rebuild();
  },
  toggleAvoid(event) {
    const id = event.currentTarget.dataset.id; const preferences = this.data.preferences.includes(id) ? this.data.preferences.filter(value => value !== id) : this.data.preferences.concat(id);
    this.setData({ preferences, draft: Food.preset(this.data.meal, 'balanced', preferences), activePreset: 'balanced' }); this.rebuild();
  },
  async save() { const view = await UI.perform(this, 'mealPlan', { meal: this.data.meal, plan: this.data.draft, preferences: this.data.preferences }, '搭配已保存'); if (view) this.rebuild(); },
  enroll() { wx.navigateTo({ url: '/pages/enroll/index' }); }
});
