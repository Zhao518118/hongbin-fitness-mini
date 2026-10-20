const UI = require('../../lib/ui');
Page({
  data: { view: null, loading: true, busy: false, error: '', nickname: '', age: '', height: '', weight: '', healthConsent: false, privacyConsent: false, termsConsent: false, questions: [], options: ['请选择', '否', '是', '不确定'], answerValues: ['', 'no', 'yes', 'unsure'], answers: {} },
  async onShow() {
    const view = await UI.refresh(this);
    if (view && !this.data.questions.length) this.setData({ questions: view.healthQuestions.map((label, index) => ({ key: view.healthKeys[index], label, index: 0 })) });
  },
  input(event) { UI.formInput(this, event); },
  consents(event) {
    const selected = event.detail.value;
    this.setData({ healthConsent: selected.includes('health'), privacyConsent: selected.includes('privacy'), termsConsent: selected.includes('terms') });
  },
  answer(event) {
    const key = event.currentTarget.dataset.key;
    const index = Number(event.detail.value);
    const questions = this.data.questions.map(row => row.key === key ? Object.assign({}, row, { index }) : row);
    this.setData({ questions, ['answers.' + key]: this.data.answerValues[index] });
  },
  agreement(event) { wx.navigateTo({ url: '/pages/agreement/index?type=' + event.currentTarget.dataset.type }); },
  async screen() {
    const data = this.data;
    await UI.perform(this, 'screen', { nickname: data.nickname, age: data.age, height: data.height, weight: data.weight,
      healthConsent: data.healthConsent, privacyConsent: data.privacyConsent, documentVersion: data.view.documentVersion, answers: data.answers }, '问卷已保存');
  },
  async pay() {
    const view = await UI.perform(this, 'createOrder', { termsConsent: this.data.termsConsent, documentVersion: this.data.view.documentVersion });
    if (!view) return;
    const order = view.orders.find(row => row.status === 'unpaid');
    if (!order) return;
    wx.showModal({ title: '模拟支付 ¥900', content: '本次不会调起真实微信支付，也不会扣款。确认后仅开通演示入营权限。', confirmText: '模拟成功', success: async result => {
      if (!result.confirm) return;
      const paid = await UI.perform(this, 'simulatePayment', { orderId: order.id }, '模拟入营成功');
      if (paid) wx.switchTab({ url: '/pages/today/index' });
    } });
  },
  home() { wx.switchTab({ url: '/pages/today/index' }); }
});
