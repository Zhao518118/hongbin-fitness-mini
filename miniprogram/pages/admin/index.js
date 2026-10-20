const UI = require('../../lib/ui');
Page({
  data: { view: null, loading: true, busy: false, error: '', periods: ['当前周期', '第1周', '第2周', '第3周', '第4周', '第5周', '第6周', '第7周', '第8周', '第9周', '第10周', '第11周', '第12周', '结营6天'], periodChoice: 0 },
  onShow() { this.setData({ periodChoice: 0 }); return UI.refresh(this); },
  retry() { return this.onShow(); },
  periodPayload() { return this.data.periodChoice ? { reportPeriodIndex: this.data.periodChoice - 1 } : {}; },
  async choosePeriod(event) { this.setData({ periodChoice: Number(event.detail.value) }); await UI.perform(this, 'view', this.periodPayload()); },
  action(event) { return UI.perform(this, event.currentTarget.dataset.action, this.periodPayload(), '操作完成'); },
  moderate(event) { return UI.perform(this, 'moderate', Object.assign({}, this.periodPayload(), { postId: event.currentTarget.dataset.id, status: event.currentTarget.dataset.status }), '审核已保存'); },
  resolve(event) {
    const requestId = event.currentTarget.dataset.id;
    wx.showModal({ title: '记录处理结果', editable: true, placeholderText: '填写与用户沟通的结果；此处不提供医学放行', success: result => {
      if (result.confirm) return UI.perform(this, 'resolveRequest', Object.assign({}, this.periodPayload(), { requestId, resolution: result.content }), '处理结果已保存');
    } });
  },
  async exportCsv() {
    const view = await UI.perform(this, 'export', this.periodPayload());
    if (view) wx.setClipboardData({ data: view.exportCsv });
  },
  advance(event) { return UI.perform(this, 'advanceDemo', Object.assign({}, this.periodPayload(), { days: Number(event.currentTarget.dataset.days) }), '演示时间已推进'); }
});
