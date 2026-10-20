const UI = require('../../lib/ui');
Page({
  data: { view: null, busy: false, loading: true, error: '', minutes: '30', exerciseIndex: 0, exercises: ['快走', '走跑结合', '骑行', '基础力量', '按计划恢复'], exerciseDone: false, dietDone: false, dinnerTime: '17:30' },
  async onShow() {
    const view = await UI.refresh(this);
    if (view && view.currentRecord && view.currentRecord.status !== 'exempt') {
      const row = view.currentRecord;
      this.setData({ minutes: String(row.minutes || 30), exerciseDone: !!row.exerciseDone, dietDone: !!row.dietDone, dinnerTime: row.dinnerTime || '17:30' });
    } else this.setData({ exerciseDone: false, dietDone: false });
  },
  retry() { return this.onShow(); },
  input(event) { UI.formInput(this, event); },
  chooseExercise(event) { this.setData({ exerciseIndex: Number(event.detail.value) }); },
  chooseDinner(event) { this.setData({ dinnerTime: event.detail.value }); },
  toggle(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  enroll() { wx.navigateTo({ url: '/pages/enroll/index' }); },
  async submit() {
    await UI.perform(this, 'checkin', { minutes: this.data.minutes, exercise: this.data.exercises[this.data.exerciseIndex], exerciseDone: this.data.exerciseDone, dietDone: this.data.dietDone, dinnerTime: this.data.dinnerTime }, '今日记录已保存');
  },
  exempt() {
    wx.showModal({ title: '今天灵活安排', content: '免打卡不计有效日，每周期最多两天。生病或受伤请申请暂停，不要硬撑。', success: async result => { if (result.confirm) await UI.perform(this, 'checkin', { exempt: true }, '已记录免打卡'); } });
  },
  async jump() {
    try { this.setData({ view: UI.decorate(await getApp().service.jumpToStart()) }); } catch (error) { UI.showError(error); }
  }
});
