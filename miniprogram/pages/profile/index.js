const UI = require('../../lib/ui');
Page({
  data: { view: null, busy: false, loading: true, error: '', weight: '', waist: '', requestType: 0, requestTypes: ['暂停/调整', '系统故障申诉', '退出/退款咨询', '个人数据申请'], reason: '', roles: ['已入营成员 · 林晓', '已入营成员 · 周远', '新报名用户', '管理员'], roleIds: ['demo-member', 'demo-peer', 'demo-visitor', 'demo-admin'] },
  onShow() { return UI.refresh(this); },
  retry() { return this.onShow(); },
  input(event) { UI.formInput(this, event); },
  async saveBody() {
    const result = await UI.perform(this, 'body', { weight: this.data.weight, waist: this.data.waist }, '身体记录已保存');
    if (result) this.setData({ weight: '', waist: '' });
  },
  chooseRequest(event) { this.setData({ requestType: Number(event.detail.value) }); },
  async request() {
    const result = await UI.perform(this, 'request', { type: this.data.requestTypes[this.data.requestType], reason: this.data.reason }, '申请已提交');
    if (result) this.setData({ reason: '' });
  },
  agreement(event) { wx.navigateTo({ url: '/pages/agreement/index?type=' + event.currentTarget.dataset.type }); },
  enroll() { wx.navigateTo({ url: '/pages/enroll/index' }); },
  admin() { wx.navigateTo({ url: '/pages/admin/index' }); },
  async switchRole(event) {
    try { getApp().service.switchActor(this.data.roleIds[Number(event.detail.value)]); this.setData({ reason: '', weight: '', waist: '' }); await UI.refresh(this); }
    catch (error) { UI.showError(error); }
  },
  reset() {
    wx.showModal({ title: '重置本机演示', content: '会清除当前设备的模拟报名、打卡与心得，恢复虚构示例。不会操作任何真实订单。', success: async result => {
      if (result.confirm) { getApp().service.reset(); await UI.refresh(this); }
    } });
  }
});
