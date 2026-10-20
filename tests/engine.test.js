const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, D, context, clone, setup, call, screening, fillAll, complete } = require('./helpers');
const { createLocalService, createCloudService } = require('../miniprogram/lib/service');

test('同日覆盖而非累加，部分记录不算达标，普通用户不能补签', () => {
  const state = setup();
  for (let i = 0; i < 3; i++) call(state, 'demo-member', 'checkin', complete);
  assert.equal(call(state, 'demo-member', 'view').period.valid, 1);
  call(state, 'demo-member', 'checkin', Object.assign({}, complete, { dietDone: false }));
  assert.equal(call(state, 'demo-member', 'view').period.valid, 0);
  assert.throws(() => call(state, 'demo-member', 'checkin', Object.assign({}, complete, { date: '2026-10-19' })), { code: 'BACKDATE' });
});
test('每周期两天免打卡、不计有效日、不跨周期累计', () => {
  const state = setup();
  for (const offset of [0, 1]) {
    state.demoDate = D.addDays('2026-10-20', offset);
    call(state, 'demo-member', 'checkin', { exempt: true });
    call(state, 'demo-member', 'checkin', { exempt: true });
  }
  state.demoDate = '2026-10-22';
  assert.throws(() => call(state, 'demo-member', 'checkin', { exempt: true }), { code: 'EXEMPT_LIMIT' });
  let view = call(state, 'demo-member', 'view');
  assert.equal(view.period.valid, 0); assert.equal(view.period.remainingExempt, 0);
  state.demoDate = '2026-10-27';
  view = call(state, 'demo-member', 'view');
  assert.equal(view.period.remainingExempt, 2);
});
test('开营前和第91天不能打卡；不以60分钟统一判断所有人的完成', () => {
  const state = setup();
  const start = state.camps[0].startDate;
  state.demoDate = D.addDays(start, -1);
  assert.throws(() => call(state, 'demo-member', 'checkin', complete), { code: 'CAMP_DATES' });
  state.demoDate = D.addDays(start, 90);
  assert.throws(() => call(state, 'demo-member', 'checkin', complete), { code: 'CAMP_DATES' });
  state.demoDate = '2026-10-20';
  assert.equal(call(state, 'demo-member', 'checkin', Object.assign({}, complete, { minutes: 20 })).currentRecord.status, 'complete');
});
test('不完整问卷、未单独同意、旧版本协议不能通过', () => {
  for (const patch of [{ privacyConsent: false }, { healthConsent: false }, { documentVersion: 'old' }, { answers: {} }]) {
    const state = setup();
    assert.throws(() => call(state, 'demo-visitor', 'screen', screening(patch)));
    assert.notEqual(state.users['demo-visitor'].healthStatus, 'clear');
  }
});
for (const answer of ['yes', 'unsure']) {
  test('健康回答' + answer + '进入评估、禁止付款，前端伪造通过无效', () => {
    const state = setup();
    const payload = screening(); payload.answers.pressure = answer;
    const view = call(state, 'demo-visitor', 'screen', payload);
    assert.equal(view.me.healthStatus, 'review');
    assert.throws(() => call(state, 'demo-visitor', 'createOrder', { termsConsent: true, documentVersion: D.DOCUMENT_VERSION, healthStatus: 'clear' }), { code: 'HEALTH_REVIEW' });
    assert.equal(Object.values(state.orders).filter(row => row.userId === 'demo-visitor').length, 0);
  });
}
test('35—55岁服务范围和必要数值校验', () => {
  for (const age of [34, 56, 42.5]) assert.throws(() => call(setup(), 'demo-visitor', 'screen', screening({ age })), { code: 'INPUT' });
  assert.throws(() => call(setup(), 'demo-member', 'body', { weight: '' }), { code: 'INPUT' });
});
test('订单金额由服务端固定，创建和支付重试幂等，开营后分配下一期', () => {
  const state = setup();
  call(state, 'demo-visitor', 'screen', screening());
  const params = { termsConsent: true, documentVersion: D.DOCUMENT_VERSION, amountFen: 1 };
  call(state, 'demo-visitor', 'createOrder', params);
  const view = call(state, 'demo-visitor', 'createOrder', params);
  assert.equal(view.orders.length, 1);
  const order = state.orders[view.orders[0].id];
  assert.equal(order.amountFen, 90000); assert.equal(order.campId, 'camp-2');
  assert.equal(order.rulesSnapshot.extraBonusFen, 0);
  call(state, 'demo-visitor', 'simulatePayment', { orderId: order.id });
  call(state, 'demo-visitor', 'simulatePayment', { orderId: order.id });
  assert.equal(Object.values(state.enrollments).filter(row => row.userId === 'demo-visitor').length, 1);
  assert.equal(state.audits.filter(row => row.action === 'demo_payment').length, 1);
});
test('不能支付其他人的订单，未同意服务规则不能下单', () => {
  const state = setup();
  call(state, 'demo-visitor', 'screen', screening());
  assert.throws(() => call(state, 'demo-visitor', 'createOrder', { termsConsent: false, documentVersion: D.DOCUMENT_VERSION }), { code: 'TERMS' });
  assert.throws(() => call(state, 'demo-visitor', 'simulatePayment', { orderId: 'seed-demo-member' }), { code: 'ORDER' });
});
test('真实模式缺少支付适配器明确阻止收款、模拟支付和模拟退款', () => {
  const state = setup();
  call(state, 'demo-visitor', 'screen', screening());
  const ctx = context({ mode: 'production' });
  assert.throws(() => call(state, 'demo-visitor', 'createOrder', { termsConsent: true, documentVersion: D.DOCUMENT_VERSION }, ctx), { code: 'PAYMENT_NOT_CONFIGURED' });
  assert.throws(() => call(state, 'demo-member', 'simulatePayment', { orderId: 'seed-demo-member' }, ctx), { code: 'DEMO_ONLY' });
  assert.throws(() => call(state, 'demo-admin', 'confirmRefunds', {}, ctx), { code: 'REFUND_NOT_CONFIGURED' });
  assert.throws(() => call(state, 'demo-admin', 'advanceDemo', { days: 7 }, ctx), { code: 'DEMO_ONLY' });
});
test('5天周达标返7000分，4天不返，当前未结束周不结算', () => {
  const state = setup();
  assert.equal(state.refunds['seed-demo-member:0'].amountFen, 7000);
  assert.equal(state.settlements['seed-demo-peer:0'].status, 'not_qualified');
  call(state, 'demo-admin', 'settle');
  assert.equal(state.settlements['seed-demo-member:1'], undefined);
});
test('全90天达标多次结算、重复发起与到账仍最多90000分', () => {
  const state = setup(); fillAll(state);
  for (let i = 0; i < 20; i++) call(state, 'demo-admin', 'settle');
  const rows = Object.values(state.refunds).filter(row => row.orderId === 'seed-demo-member');
  assert.equal(rows.length, 13);
  assert.equal(rows.reduce((sum, row) => sum + row.amountFen, 0), 90000);
  for (let i = 0; i < 10; i++) { call(state, 'demo-admin', 'processRefunds'); call(state, 'demo-admin', 'confirmRefunds'); }
  assert.equal(Engine.moneyTotals(state, state.enrollments['demo-member']).refundedFen, 90000);
});
test('末期6天4天返6000分，3天不返，体重不影响已取得周返款', () => {
  for (const count of [3, 4]) {
    const state = setup();
    const start = state.camps[0].startDate;
    for (let i = 0; i < count; i++) {
      const date = D.addDays(start, 84 + i);
      state.checkins[D.recordKey('demo-member', 'camp-1', date)] = { status: 'complete' };
    }
    state.bodies = []; state.demoDate = D.addDays(start, 90);
    call(state, 'demo-admin', 'settle');
    assert.equal((state.refunds['seed-demo-member:12'] || {}).amountFen, count === 4 ? 6000 : undefined);
    assert.equal(state.refunds['seed-demo-member:0'].amountFen, 7000);
  }
});
test('待处理申请暂缓结算，处理结果留痕后可继续', () => {
  const state = setup();
  call(state, 'demo-member', 'request', { type: '暂停/调整', reason: '身体不适，申请联系调整' });
  fillAll(state); call(state, 'demo-admin', 'settle');
  assert.equal(state.settlements['seed-demo-member:1'], undefined);
  const request = state.requests[0];
  call(state, 'demo-admin', 'resolveRequest', { requestId: request.id, resolution: '已沟通；测试中按原记录结算，不提供医疗判断' });
  call(state, 'demo-admin', 'settle');
  assert.equal(state.settlements['seed-demo-member:1'].status, 'qualified');
  assert.ok(state.audits.some(row => row.action === 'resolve_request'));
});
test('退款处理中不算到账；失败重试保留同一退款标识', () => {
  const state = setup();
  call(state, 'demo-admin', 'processRefunds');
  let totals = Engine.moneyTotals(state, state.enrollments['demo-member']);
  assert.equal(totals.processingFen, 7000); assert.equal(totals.refundedFen, 0);
  state.refunds['seed-demo-member:0'].status = 'failed';
  call(state, 'demo-admin', 'processRefunds'); call(state, 'demo-admin', 'confirmRefunds');
  assert.equal(Object.keys(state.refunds).length, 1);
  assert.equal(Engine.moneyTotals(state, state.enrollments['demo-member']).refundedFen, 7000);
});
test('异常超额退款在写入前被阻止', () => {
  const state = setup(); fillAll(state);
  state.refunds.corrupt = { orderId: 'seed-demo-member', amountFen: 90000, status: 'processing' };
  assert.throws(() => call(state, 'demo-admin', 'settle'), { code: 'CAP' });
  assert.equal(state.refunds['seed-demo-member:1'], undefined);
});
test('付费墙和管理员权限由业务层执行，前端传入角色不能越权', () => {
  const state = setup();
  for (const action of ['checkin', 'post', 'body']) assert.throws(() => call(state, 'demo-visitor', action, complete), { code: 'PAYWALL' });
  for (const action of ['settle', 'export', 'processRefunds', 'moderate', 'resolveRequest', 'advanceDemo']) assert.throws(() => call(state, 'demo-member', action, { isAdmin: true }), { code: 'FORBIDDEN' });
  assert.throws(() => call(state, 'demo-member', 'view', { reportPeriodIndex: 0 }), { code: 'FORBIDDEN' });
});
test('普通视图不泄露他人健康信息、身体记录、订单或管理快照', () => {
  const state = setup();
  state.users['demo-peer'].healthAnswers = { private: '不要泄露' };
  const view = call(state, 'demo-member', 'view');
  assert.equal(view.admin, undefined);
  assert.equal(view.me.healthAnswers, undefined);
  assert.ok(view.bodies.every(row => row.userId === 'demo-member'));
  assert.ok(view.orders.every(row => row.id === 'seed-demo-member'));
  assert.ok(!JSON.stringify(view).includes('不要泄露'));
});
test('心得待审仅本人可见、通过后同营可见、跨营不能点赞或举报', () => {
  const state = setup();
  call(state, 'demo-member', 'post', { text: '今天按自己的节奏快走，很舒服。' });
  const post = state.posts[0];
  assert.ok(!call(state, 'demo-peer', 'view').posts.some(row => row.id === post.id));
  call(state, 'demo-admin', 'moderate', { postId: post.id, status: 'approved' });
  assert.ok(call(state, 'demo-peer', 'view').posts.some(row => row.id === post.id));
  call(state, 'demo-peer', 'like', { postId: post.id });
  assert.equal(post.likes.length, 1);
  state.enrollments['demo-peer'].campId = 'camp-2';
  assert.throws(() => call(state, 'demo-peer', 'like', { postId: post.id }), { code: 'POST' });
  assert.throws(() => call(state, 'demo-peer', 'report', { postId: post.id, reason: '测试举报' }), { code: 'POST' });
});
test('举报去重，管理员隐藏后营友不可见；远程任意图片地址不被接受', () => {
  const state = setup();
  for (let i = 0; i < 2; i++) call(state, 'demo-member', 'report', { postId: 'welcome-post', reason: '不当内容' });
  assert.equal(state.reports.length, 1);
  call(state, 'demo-admin', 'moderate', { postId: 'welcome-post', status: 'hidden' });
  assert.equal(call(state, 'demo-member', 'view').posts.length, 0);
  assert.equal(state.reports[0].status, 'resolved');
  assert.throws(() => call(state, 'demo-member', 'post', { text: '测试图片', image: 'https://untrusted.example/image.jpg' }), { code: 'IMAGE' });
});
test('统计分母排除待处理与未开始周期；缺失体重不是零变化；CSV防公式注入', () => {
  const state = setup();
  state.bodies = state.bodies.filter(row => row.userId !== 'demo-peer');
  call(state, 'demo-member', 'request', { type: '系统故障申诉', reason: '打卡记录需要确认' });
  state.users['demo-member'].nickname = '=HYPERLINK("x")';
  const view = call(state, 'demo-admin', 'view', { reportPeriodIndex: 0 });
  assert.equal(view.admin.assessedCount, 1);
  assert.equal(view.admin.weightCount, 1);
  assert.equal(view.admin.members.find(row => row.userId === 'demo-peer').changeKg, null);
  const future = call(state, 'demo-admin', 'view', { reportPeriodIndex: 12 });
  assert.equal(future.admin.rate, null);
  const csv = call(state, 'demo-admin', 'export', { reportPeriodIndex: 0 }).exportCsv;
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(!csv.includes('healthAnswers'));
});
test('本机服务失败事务不保留部分修改，保存后可重新启动', async () => {
  const memory = new Map();
  const storage = { get: key => clone(memory.get(key) || null), set: (key, value) => memory.set(key, clone(value)) };
  const service = createLocalService(storage, () => new Date('2026-10-20T02:00:00Z'));
  service.switchActor('demo-visitor');
  await assert.rejects(service.call('screen', screening({ nickname: '' })));
  assert.equal((await service.call('view')).me.healthStatus, 'unknown');
  await service.call('screen', screening());
  const restarted = createLocalService(storage, () => new Date('2026-10-20T02:00:00Z'));
  assert.equal((await restarted.call('view')).me.healthStatus, 'clear');
});
test('云配置缺失与服务错误不会自动切换本机演示', async () => {
  assert.throws(() => createCloudService({}, { cloudEnv: '' }), { code: 'CLOUD_CONFIG' });
  const service = createCloudService({ cloud: { init() {}, callFunction: async () => ({ result: { ok: false, code: 'PAYMENT_NOT_CONFIGURED', message: '未接入' } }) } }, { cloudEnv: 'test', apiFunction: 'api' });
  await assert.rejects(service.call('createOrder'), { code: 'PAYMENT_NOT_CONFIGURED' });
  assert.equal(service.mode, 'cloud');
});
test('模拟已支付订单切到生产模式不产生付费权限或真实结算', () => {
  const state = setup(); fillAll(state);
  const ctx = context({ mode: 'production' });
  assert.equal(call(state, 'demo-member', 'view', {}, ctx).paid, false);
  assert.throws(() => call(state, 'demo-member', 'checkin', complete, ctx), { code: 'PAYWALL' });
  call(state, 'demo-admin', 'settle', {}, ctx);
  assert.equal(state.refunds['seed-demo-member:1'], undefined);
  assert.equal(call(state, 'demo-admin', 'view', {}, ctx).admin.count, 0);
});
test('已付款订单锁定开营日与周期规则，不跟随后台期次日期变化', () => {
  const state = setup();
  const originalStart = state.camps[0].startDate;
  state.camps[0].startDate = '2030-01-01';
  state.camps[0].rulesVersion = 'modified';
  const view = call(state, 'demo-member', 'view');
  assert.equal(view.camp.startDate, originalStart);
  assert.equal(view.day, 8);
  assert.equal(view.period.required, 5);
  assert.equal(state.orders['seed-demo-member'].rulesSnapshot.rulesVersion, D.RULES_VERSION);
});
