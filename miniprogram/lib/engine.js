'use strict';

const D = require('./domain');
const { requireThat: guard } = D;
const HEALTH_KEYS = ['cardiac', 'pressure', 'symptoms', 'glucose', 'injury', 'other'];
const HEALTH_QUESTIONS = [
  '是否有心脑血管疾病，或医生要求限制运动的疾病？',
  '是否有控制不佳或控制情况不明确的高血压？',
  '是否运动时胸痛、晕厥或明显异常气促？',
  '是否有低血糖风险、相关用药或近期反复低血糖？',
  '是否近期手术、受伤或有明显影响运动的关节问题？',
  '是否存在妊娠、进食障碍等不适合普通减脂计划的情况？'
];

function emptyState(date) {
  return {
    version: 1, sequence: 0, demoDate: date,
    camps: [{ id: 'camp-1', title: '90天晨练减脂营', startDate: date, rulesVersion: D.RULES_VERSION }],
    users: {}, consents: [], orders: {}, enrollments: {}, checkins: {}, bodies: [],
    posts: [], reports: [], requests: [], settlements: {}, refunds: {}, audits: []
  };
}
function id(state, prefix) { state.sequence += 1; return prefix + '-' + state.sequence; }
function today(state, ctx) { return ctx.mode === 'demo' ? state.demoDate : D.businessDate(ctx.now); }
function timestamp(ctx) { return new Date(ctx.now).toISOString(); }
function user(state, actor) {
  guard(typeof actor === 'string' && actor.length > 0, 'AUTH', '请先登录');
  if (!state.users[actor]) state.users[actor] = { id: actor, nickname: '新营友', healthStatus: 'unknown' };
  return state.users[actor];
}
function isAdmin(actor, ctx) { return (ctx.adminIds || []).includes(actor); }
function admin(actor, ctx) { guard(isAdmin(actor, ctx), 'FORBIDDEN', '需要管理员权限'); }
function enrollment(state, actor, ctx) {
  const row = state.enrollments[actor];
  guard(row && state.orders[row.orderId] && state.orders[row.orderId].status === 'paid' && state.orders[row.orderId].mode === ctx.mode, 'PAYWALL', '请完成当前环境的健康准入并支付后入营');
  return row;
}
function campFor(state, en) {
  const camp = state.camps.find(item => item.id === en.campId);
  guard(camp, 'CAMP', '期次不存在');
  const order = state.orders[en.orderId];
  return Object.assign({}, camp, { startDate: order.rulesSnapshot.startDate || camp.startDate });
}
function rulesSnapshot(camp) {
  return { rulesVersion: camp.rulesVersion, documentVersion: D.DOCUMENT_VERSION, startDate: camp.startDate,
    capFen: D.PRICE, weeklyFen: 7000, finalFen: 6000, extraBonusFen: 0, requiredDays: 5, finalRequiredDays: 4,
    periods: D.periods(camp.startDate) };
}
function enrollmentPeriods(state, en) {
  const rows = state.orders[en.orderId].rulesSnapshot.periods;
  guard(Array.isArray(rows) && rows.length === 13, 'RULES', '订单营规快照不完整，请联系运营方');
  return rows;
}
function enrollmentPeriod(state, en, date) {
  const rows = enrollmentPeriods(state, en);
  return rows.find(row => row.start <= date && row.end >= date) || (date < rows[0].start ? rows[0] : rows[12]);
}
function audit(state, actor, action, detail, ctx) {
  state.audits.push({ id: id(state, 'audit'), actor, action, detail, at: timestamp(ctx) });
}
function moneyTotals(state, en) {
  const rows = Object.values(state.refunds).filter(row => row.orderId === en.orderId);
  return {
    eligibleFen: rows.reduce((sum, row) => sum + row.amountFen, 0),
    refundedFen: rows.filter(row => row.status === 'refunded').reduce((sum, row) => sum + row.amountFen, 0),
    processingFen: rows.filter(row => row.status === 'processing').reduce((sum, row) => sum + row.amountFen, 0)
  };
}
function publicPosts(state, actor, en) {
  return state.posts.filter(post => post.campId === en.campId && (post.status === 'approved' || post.authorId === actor))
    .filter(post => post.status !== 'deleted')
    .map(post => ({ id: post.id, nickname: (state.users[post.authorId] || {}).nickname || '营友', text: post.text,
      image: post.image || '', status: post.status, statusText: { pending: '待审核', approved: '已发布', hidden: '已隐藏', rejected: '未通过' }[post.status],
      likeCount: post.likes.length, liked: post.likes.includes(actor), mine: post.authorId === actor, at: post.at.slice(0, 10) }));
}
function snapshot(state, actor, ctx) {
  const me = user(state, actor);
  const en = state.enrollments[actor];
  const paid = !!(en && state.orders[en.orderId] && state.orders[en.orderId].status === 'paid' && state.orders[en.orderId].mode === ctx.mode);
  const date = today(state, ctx);
  const result = {
    mode: ctx.mode, localDemo: ctx.localDemo === true, today: date, isAdmin: isAdmin(actor, ctx), paid,
    me: { id: me.id, nickname: me.nickname, age: me.age || '', height: me.height || '', healthStatus: me.healthStatus },
    healthQuestions: HEALTH_QUESTIONS, healthKeys: HEALTH_KEYS,
    documentVersion: D.DOCUMENT_VERSION, price: '900',
    camp: paid ? campFor(state, en) : state.camps.find(camp => camp.startDate >= date) || null,
    bodies: state.bodies.filter(row => row.userId === actor).sort((a, b) => a.date.localeCompare(b.date)),
    requests: state.requests.filter(row => row.userId === actor).map(row => ({ id: row.id, type: row.type, reason: row.reason, status: row.status, resolution: row.resolution || '' })),
    orders: Object.values(state.orders).filter(row => row.userId === actor).map(row => ({ id: row.id, status: row.status, amount: D.money(row.amountFen), campId: row.campId, rulesVersion: row.rulesSnapshot.rulesVersion })),
    posts: [], refunds: []
  };
  if (paid) {
    const camp = result.camp;
    const period = enrollmentPeriod(state, en, date);
    const stats = D.periodStats(state, en, period);
    const day = D.dayNumber(camp.startDate, date);
    result.day = day;
    result.started = day >= 1 && day <= 90;
    result.progress = Math.round(Math.min(90, Math.max(0, day - 1)) / 90 * 100);
    result.period = Object.assign({}, period, stats);
    result.currentRecord = state.checkins[D.recordKey(actor, en.campId, date)] || null;
    result.totals = moneyTotals(state, en);
    result.refunds = Object.values(state.refunds).filter(row => row.orderId === en.orderId).map(row => Object.assign({}, row, { amount: D.money(row.amountFen), label: row.periodIndex === 12 ? '结营6天' : '第' + (row.periodIndex + 1) + '周' }));
    result.posts = publicPosts(state, actor, en);
    result.weekly = enrollmentPeriods(state, en).map(item => Object.assign({}, item, D.periodStats(state, en, item), { settlement: (state.settlements[en.orderId + ':' + item.index] || {}).status || 'unsettled' }));
  }
  if (result.isAdmin) result.admin = adminSnapshot(state, date, ctx.reportPeriodIndex, ctx.mode);
  return result;
}
function adminSnapshot(state, date, reportPeriodIndex, mode) {
  const members = Object.values(state.enrollments).filter(en => state.orders[en.orderId].status === 'paid' && state.orders[en.orderId].mode === mode).map(en => {
    const camp = campFor(state, en);
    const p = reportPeriodIndex == null ? enrollmentPeriod(state, en, date) : enrollmentPeriods(state, en)[reportPeriodIndex];
    const stats = D.periodStats(state, en, p);
    const body = state.bodies.filter(row => row.userId === en.userId).sort((a, b) => a.date.localeCompare(b.date));
    return { nickname: state.users[en.userId].nickname, camp: camp.title, campId: camp.id, period: p.label,
      userId: en.userId, valid: stats.valid, required: p.required, qualified: stats.qualified, periodStarted: p.start <= date,
      rows: stats.rows.map(row => Object.assign({}, row, { symbol: { complete: '✓', partial: '半', exempt: '免', missing: '—' }[row.status] })),
      pending: state.requests.some(row => row.userId === en.userId && row.status === 'pending'),
      weightCount: body.length, changeKg: body.length >= 2 ? Math.round((body[body.length - 1].weight - body[0].weight) * 10) / 10 : null,
      eligible: D.money(moneyTotals(state, en).eligibleFen), refunded: D.money(moneyTotals(state, en).refundedFen) };
  });
  const assessed = members.filter(row => !row.pending && row.periodStarted);
  return { members, count: members.length, assessedCount: assessed.length,
    qualifiedCount: assessed.filter(row => row.qualified).length,
    rate: assessed.length ? Math.round(assessed.filter(row => row.qualified).length / assessed.length * 100) : null,
    weightCount: members.filter(row => row.weightCount >= 2).length,
    posts: state.posts.filter(row => row.status === 'pending' || row.status === 'hidden').map(row => ({ id: row.id, text: row.text, nickname: state.users[row.authorId].nickname, status: row.status })),
    reports: state.reports.filter(row => row.status === 'pending'),
    requests: state.requests.filter(row => row.status === 'pending').map(row => ({ id: row.id, type: row.type, reason: row.reason, nickname: state.users[row.userId].nickname })),
    refunds: Object.values(state.refunds).filter(row => row.mode === mode).map(row => Object.assign({}, row, { amount: D.money(row.amountFen), nickname: state.users[state.orders[row.orderId].userId].nickname })),
    audits: state.audits.slice(-30).reverse(), camps: state.camps };
}
function settle(state, actor, ctx) {
  admin(actor, ctx);
  const date = today(state, ctx);
  for (const en of Object.values(state.enrollments)) {
    const order = state.orders[en.orderId];
    if (!order || order.status !== 'paid' || order.mode !== ctx.mode) continue;
    const camp = campFor(state, en);
    for (const period of enrollmentPeriods(state, en)) {
      const key = en.orderId + ':' + period.index;
      if (date <= period.end || state.settlements[key]) continue;
      if (state.requests.some(row => row.userId === en.userId && row.status === 'pending')) continue;
      const stats = D.periodStats(state, en, period);
      const eligible = stats.qualified;
      if (eligible) {
        const reserved = moneyTotals(state, en).eligibleFen;
        guard(reserved + period.rewardFen <= Math.min(D.PRICE, order.amountFen, order.rulesSnapshot.capFen), 'CAP', '累计退款超过订单实付，已阻止');
        state.refunds[key] = { id: key, orderId: order.id, periodIndex: period.index, amountFen: period.rewardFen, status: 'eligible', mode: ctx.mode };
      }
      state.settlements[key] = { status: eligible ? 'qualified' : 'not_qualified', valid: stats.valid, required: period.required, at: timestamp(ctx) };
      audit(state, actor, 'settle', key + ':' + state.settlements[key].status, ctx);
    }
  }
}

function handle(state, actor, action, payload, ctx) {
  payload = payload || {};
  const me = user(state, actor);
  const date = today(state, ctx);
  if (payload.reportPeriodIndex != null) {
    admin(actor, ctx);
    ctx = Object.assign({}, ctx, { reportPeriodIndex: D.integer(payload.reportPeriodIndex, 0, 12, '统计周期为1—13') });
  }
  switch (action) {
    case 'view': {
      if (payload.reportPeriodIndex != null) {
        admin(actor, ctx);
        ctx = Object.assign({}, ctx, { reportPeriodIndex: D.integer(payload.reportPeriodIndex, 0, 12, '统计周期为1—13') });
      }
      break;
    }
    case 'export': {
      admin(actor, ctx);
      const periodIndex = payload.reportPeriodIndex == null ? undefined : D.integer(payload.reportPeriodIndex, 0, 12, '统计周期为1—13');
      const report = adminSnapshot(state, date, periodIndex, ctx.mode);
      const cell = value => '"' + String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
      const rows = [['昵称', '期次', '周期', '有效天数', '要求天数', '待处理申请', '累计可返元', '已退款元']];
      report.members.forEach(row => rows.push([row.nickname, row.camp, row.period, row.valid, row.required, row.pending ? '是' : '否', row.eligible, row.refunded]));
      audit(state, actor, 'export_weekly', '不含健康问卷', ctx);
      const view = snapshot(state, actor, ctx);
      view.exportCsv = '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n');
      return view;
    }
    case 'screen': {
      guard(payload.healthConsent === true && payload.privacyConsent === true, 'CONSENT', '请先分别同意健康告知和健康信息处理说明');
      guard(payload.documentVersion === D.DOCUMENT_VERSION, 'CONSENT_VERSION', '协议版本已变更，请重新阅读');
      const age = D.integer(payload.age, 35, 55, '首版服务年龄为35—55岁');
      const height = D.finiteNumber(payload.height, 120, 230, '请输入有效身高（厘米）');
      const weight = D.finiteNumber(payload.weight, 30, 300, '请输入有效体重（公斤）');
      const answers = HEALTH_KEYS.map(key => payload.answers && payload.answers[key]);
      guard(answers.every(value => ['no', 'yes', 'unsure'].includes(value)), 'SCREEN', '请完整回答全部健康问题');
      const nickname = D.text(payload.nickname, 1, 16, '昵称为1—16字');
      Object.assign(me, { age, height, nickname, healthStatus: answers.every(value => value === 'no') ? 'clear' : 'review', healthAnswers: Object.fromEntries(HEALTH_KEYS.map((key, index) => [key, answers[index]])) });
      state.consents.push({ userId: actor, version: D.DOCUMENT_VERSION, health: true, privacy: true, at: timestamp(ctx) });
      if (!state.bodies.some(row => row.userId === actor)) state.bodies.push({ userId: actor, date, weight, waist: null });
      break;
    }
    case 'createOrder': {
      guard(me.healthStatus === 'clear', 'HEALTH_REVIEW', '尚未通过服务范围筛查，暂不能支付');
      guard(payload.termsConsent === true && payload.documentVersion === D.DOCUMENT_VERSION, 'TERMS', '请阅读并确认当前服务及退款规则');
      guard(ctx.mode === 'demo', 'PAYMENT_NOT_CONFIGURED', '真实支付尚未接入，当前不能收款；不会自动模拟支付');
      const camp = state.camps.filter(row => row.startDate >= date).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
      guard(camp, 'CAMP', '暂无开放报名期次，请联系运营方');
      guard(!state.enrollments[actor], 'ENROLLED', '您已经入营');
      let order = Object.values(state.orders).find(row => row.userId === actor && row.campId === camp.id && row.status === 'unpaid');
      if (!order) {
        const orderId = id(state, 'order');
        order = { id: orderId, userId: actor, campId: camp.id, amountFen: D.PRICE, status: 'unpaid', mode: ctx.mode,
          rulesSnapshot: rulesSnapshot(camp), at: timestamp(ctx) };
        state.orders[orderId] = order;
        state.consents.push({ userId: actor, version: D.DOCUMENT_VERSION, terms: true, orderId, at: timestamp(ctx) });
      }
      break;
    }
    case 'simulatePayment': {
      guard(ctx.mode === 'demo', 'DEMO_ONLY', '仅模拟环境可以模拟支付');
      guard(me.healthStatus === 'clear', 'HEALTH_REVIEW', '尚未通过服务范围筛查');
      const order = state.orders[payload.orderId];
      guard(order && order.userId === actor && order.amountFen === D.PRICE && order.rulesSnapshot.documentVersion === D.DOCUMENT_VERSION, 'ORDER', '订单不存在或金额/协议不匹配');
      guard(order.mode === 'demo', 'ORDER', '不能模拟真实订单');
      if (order.status === 'paid') break;
      guard(order.status === 'unpaid' && !state.enrollments[actor], 'ORDER', '订单状态不允许支付');
      order.status = 'paid';
      order.paidAt = timestamp(ctx);
      state.enrollments[actor] = { userId: actor, campId: order.campId, orderId: order.id };
      audit(state, actor, 'demo_payment', order.id, ctx);
      break;
    }
    case 'checkin': {
      const en = enrollment(state, actor, ctx);
      const camp = campFor(state, en);
      guard(!payload.date || payload.date === date, 'BACKDATE', '只能提交或修改当天记录，补签请联系管理员');
      const day = D.dayNumber(camp.startDate, date);
      guard(day >= 1 && day <= 90, 'CAMP_DATES', '当前不在您的90天训练期内');
      const key = D.recordKey(actor, en.campId, date);
      const period = enrollmentPeriod(state, en, date);
      const settlement = state.settlements[en.orderId + ':' + period.index];
      guard(!settlement, 'LOCKED', '该周期已结算');
      if (payload.exempt === true) {
        const stats = D.periodStats(state, en, period);
        guard((state.checkins[key] || {}).status === 'exempt' || stats.exempt < 2, 'EXEMPT_LIMIT', '本周期两天免打卡已用完');
        state.checkins[key] = { status: 'exempt', date, userId: actor, campId: en.campId };
      } else {
        const minutes = D.integer(payload.minutes, 0, 180, '运动时长为0—180分钟，请按个人计划填写');
        guard(typeof payload.exerciseDone === 'boolean' && typeof payload.dietDone === 'boolean', 'INPUT', '请确认运动和饮食完成状态');
        guard(!payload.exerciseDone || minutes > 0, 'INPUT', '完成运动时请填写大于0的时长');
        const exercise = D.text(payload.exercise, 1, 20, '请选择活动类型');
        guard(typeof payload.dinnerTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(payload.dinnerTime), 'INPUT', '请填写晚餐时间');
        state.checkins[key] = { status: payload.exerciseDone && payload.dietDone ? 'complete' : 'partial', date, userId: actor, campId: en.campId,
          exercise, minutes, exerciseDone: payload.exerciseDone, dietDone: payload.dietDone, dinnerTime: payload.dinnerTime };
      }
      break;
    }
    case 'body': {
      enrollment(state, actor, ctx);
      const weight = D.finiteNumber(payload.weight, 30, 300, '体重为30—300公斤');
      const waist = payload.waist === '' || payload.waist == null ? null : D.finiteNumber(payload.waist, 40, 200, '腰围为40—200厘米');
      const old = state.bodies.find(row => row.userId === actor && row.date === date);
      if (old) Object.assign(old, { weight, waist }); else state.bodies.push({ userId: actor, date, weight, waist });
      break;
    }
    case 'post': {
      const en = enrollment(state, actor, ctx);
      const content = D.text(payload.text, 1, 600, '心得为1—600字');
      guard(state.posts.length < 150, 'CAPACITY', '试营心得容量已满，请联系管理员归档');
      guard(!payload.image || (ctx.mode === 'demo' && ctx.localDemo === true && typeof payload.image === 'string' && /^(wxfile:\/\/|http:\/\/(tmp|usr)\/)/.test(payload.image)), 'IMAGE', '图片仅支持本机演示选择；云端图片审核尚未接入');
      state.posts.unshift({ id: id(state, 'post'), authorId: actor, campId: en.campId, text: content, image: payload.image || '', likes: [], status: 'pending', at: timestamp(ctx) });
      break;
    }
    case 'like': case 'report': {
      const en = enrollment(state, actor, ctx);
      const post = state.posts.find(row => row.id === payload.postId && row.campId === en.campId && row.status === 'approved');
      guard(post, 'POST', '该内容不可访问');
      if (action === 'like') {
        post.likes = post.likes.includes(actor) ? post.likes.filter(item => item !== actor) : post.likes.concat(actor);
      } else {
        const reason = D.text(payload.reason, 1, 120, '请填写举报原因');
        if (!state.reports.some(row => row.userId === actor && row.postId === post.id && row.status === 'pending')) state.reports.push({ id: id(state, 'report'), userId: actor, postId: post.id, reason, status: 'pending' });
      }
      break;
    }
    case 'request': {
      guard(['暂停/调整', '系统故障申诉', '退出/退款咨询', '个人数据申请'].includes(payload.type), 'INPUT', '申请类型不支持');
      if (payload.type !== '个人数据申请') enrollment(state, actor, ctx);
      const reason = D.text(payload.reason, 2, 300, '请填写2—300字说明，不要上传病历或证件');
      guard(!state.requests.some(row => row.userId === actor && row.status === 'pending'), 'PENDING', '已有待处理申请，请等待联系');
      state.requests.push({ id: id(state, 'request'), userId: actor, type: payload.type, reason, status: 'pending', at: timestamp(ctx) });
      break;
    }
    case 'moderate': {
      admin(actor, ctx);
      const post = state.posts.find(row => row.id === payload.postId);
      guard(post && ['approved', 'rejected', 'hidden'].includes(payload.status), 'POST', '审核对象或状态无效');
      post.status = payload.status;
      state.reports.filter(row => row.postId === post.id).forEach(row => { row.status = 'resolved'; });
      audit(state, actor, 'moderate', post.id + ':' + post.status, ctx);
      break;
    }
    case 'resolveRequest': {
      admin(actor, ctx);
      const request = state.requests.find(row => row.id === payload.requestId);
      guard(request && request.status === 'pending', 'REQUEST', '申请不存在或已处理');
      request.resolution = D.text(payload.resolution, 2, 300, '请填写处理结果与已告知用户的安排');
      request.status = 'resolved';
      audit(state, actor, 'resolve_request', request.id, ctx);
      break;
    }
    case 'settle': settle(state, actor, ctx); break;
    case 'processRefunds': case 'confirmRefunds': {
      admin(actor, ctx);
      guard(ctx.mode === 'demo', 'REFUND_NOT_CONFIGURED', '真实退款适配器尚未接入，不会模拟到账');
      for (const refund of Object.values(state.refunds)) {
        if (action === 'processRefunds' && ['eligible', 'failed'].includes(refund.status)) refund.status = 'processing';
        else if (action === 'confirmRefunds' && refund.status === 'processing') refund.status = 'refunded';
      }
      audit(state, actor, action, 'DEMO_ONLY', ctx);
      break;
    }
    case 'advanceDemo': {
      admin(actor, ctx);
      guard(ctx.mode === 'demo', 'DEMO_ONLY', '真实环境不能修改时间');
      state.demoDate = D.addDays(date, D.integer(payload.days, 1, 100, '推进天数为1—100天'));
      settle(state, actor, ctx);
      break;
    }
    default: D.fail('ACTION', '不支持的操作');
  }
  return snapshot(state, actor, ctx);
}

function demoState(baseDate) {
  const state = emptyState(D.addDays(baseDate, -7));
  state.demoDate = baseDate;
  state.camps[0].title = '晨光一期 · 90天同行';
  state.camps.push({ id: 'camp-2', title: '晨光二期 · 新人招募', startDate: D.addDays(baseDate, 2), rulesVersion: D.RULES_VERSION });
  const ctx = { mode: 'demo', now: baseDate + 'T02:00:00Z', adminIds: ['demo-admin'] };
  for (const [userId, nickname, days] of [['demo-member', '林晓', 5], ['demo-peer', '周远', 4]]) {
    state.users[userId] = { id: userId, nickname, age: 42, height: 168, healthStatus: 'clear' };
    const orderId = 'seed-' + userId;
    state.orders[orderId] = { id: orderId, userId, campId: 'camp-1', amountFen: D.PRICE, status: 'paid', mode: 'demo', rulesSnapshot: rulesSnapshot(state.camps[0]) };
    state.enrollments[userId] = { userId, campId: 'camp-1', orderId };
    for (let index = 0; index < 7; index++) {
      const date = D.addDays(state.camps[0].startDate, index);
      state.checkins[D.recordKey(userId, 'camp-1', date)] = { date, userId, campId: 'camp-1', status: index < days ? 'complete' : index < days + 2 ? 'exempt' : 'partial' };
    }
    state.bodies.push({ userId, date: state.camps[0].startDate, weight: userId === 'demo-member' ? 82 : 88, waist: 96 });
    state.bodies.push({ userId, date: baseDate, weight: userId === 'demo-member' ? 81.4 : 87.8, waist: 95 });
  }
  state.posts.push({ id: 'welcome-post', authorId: 'demo-peer', campId: 'camp-1', text: '这一周没有拼速度，早上先快走。把早餐提前准备好，出门也从容了。一起慢慢坚持。', image: '', likes: [], status: 'approved', at: timestamp(ctx) });
  state.users['demo-admin'] = { id: 'demo-admin', nickname: '营长', healthStatus: 'unknown' };
  state.users['demo-visitor'] = { id: 'demo-visitor', nickname: '新营友', healthStatus: 'unknown' };
  settle(state, 'demo-admin', ctx);
  return state;
}

module.exports = { HEALTH_KEYS, HEALTH_QUESTIONS, emptyState, demoState, handle, snapshot, settle, moneyTotals };
