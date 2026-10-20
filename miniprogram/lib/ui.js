const D = require('./domain');
const Food = require('./nutrition');
const Brand = require('./brand');
const REFUND_LABELS = { eligible: '已取得资格', processing: '退款处理中', refunded: '已退款', failed: '退款失败' };
function decorate(view) {
  const data = Object.assign({}, view);
  data.brand = Brand;
  data.mealCards = Food.MEALS.map(meal => Food.summary(meal.id, view.nutrition && view.nutrition.plans[meal.id], view.nutrition && view.nutrition.preferences || []));
  data.dayNumberText = String(Math.min(90, Math.max(1, view.day || 1))).padStart(2, '0');
  data.healthLabel = { unknown: '尚未填写', clear: '符合当前服务范围', review: '待进一步评估' }[view.me.healthStatus];
  if (view.period) {
    data.period = Object.assign({}, view.period, { reward: D.money(view.period.rewardFen),
      rows: view.period.rows.map(row => Object.assign({}, row, { symbol: { complete: '✓', partial: '半', exempt: '免', missing: '—' }[row.status] })) });
    data.validPercent = Math.min(100, Math.round(view.period.valid / view.period.required * 100));
    data.eligible = D.money(view.totals.eligibleFen);
    data.refunded = D.money(view.totals.refundedFen);
    data.dayLabel = view.day < 1 ? '等待开营' : view.day > 90 ? '本期已结营' : '第 ' + view.day + ' / 90 天';
  }
  data.refunds = (view.refunds || []).map(row => Object.assign({}, row, { statusLabel: REFUND_LABELS[row.status] || row.status }));
  const bodies = view.bodies || [];
  const first = bodies[0];
  const latest = bodies[bodies.length - 1];
  data.latestWeight = latest ? latest.weight : '—';
  data.weightChange = first && latest && bodies.length > 1 ? Math.round((latest.weight - first.weight) * 10) / 10 : null;
  data.bodyRows = bodies.slice(-8).map(row => Object.assign({}, row, { bar: Math.round(Math.min(100, Math.max(8, row.weight / 150 * 100))) }));
  if (data.admin) data.admin.refunds = data.admin.refunds.map(row => Object.assign({}, row, { statusLabel: REFUND_LABELS[row.status] || row.status }));
  return data;
}
function showError(error) { wx.showToast({ title: error.message || '操作失败，请重试', icon: 'none', duration: 3000 }); }
async function refresh(page) {
  try {
    page.setData({ loading: true, error: '' });
    const view = decorate(await getApp().service.call('view'));
    page.setData({ view, loading: false });
    return view;
  } catch (error) { page.setData({ loading: false, error: error.message }); showError(error); return null; }
}
async function perform(page, action, payload, success) {
  if (page.data.busy) return null;
  page.setData({ busy: true });
  try {
    const view = decorate(await getApp().service.call(action, payload));
    page.setData({ view });
    if (success) wx.showToast({ title: success, icon: 'success' });
    return view;
  } catch (error) { showError(error); return null; }
  finally { page.setData({ busy: false }); }
}
function formInput(page, event) { page.setData({ [event.currentTarget.dataset.field]: event.detail.value }); }
module.exports = { refresh, perform, decorate, showError, formInput };
