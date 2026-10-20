const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { clone } = require('./helpers');

function platform() {
  const memory = new Map();
  const dialogs = [];
  const pending = [];
  const navigation = [];
  const copied = [];
  let app;
  global.wx = {
    getStorageSync: key => clone(memory.get(key) || null), setStorageSync: (key, value) => memory.set(key, clone(value)),
    showToast(value) { dialogs.push(value.title); },
    showModal(value) { pending.push(Promise.resolve(value.success({ confirm: true, content: '已联系用户并记录处理结果' }))); },
    showActionSheet(value) { pending.push(Promise.resolve(value.success({ tapIndex: 0 }))); },
    navigateTo(value) { navigation.push(value.url); }, switchTab(value) { navigation.push(value.url); },
    setNavigationBarTitle() {}, setClipboardData(value) { copied.push(value.data); }
  };
  global.App = definition => { app = definition; };
  global.getApp = () => app;
  const appFile = path.resolve(__dirname, '../miniprogram/app.js'); delete require.cache[appFile]; require(appFile); app.onLaunch();
  return {
    app, dialogs, navigation, copied,
    async drain() { while (pending.length) await pending.shift(); },
    page(name) {
      let definition;
      global.Page = value => { definition = value; };
      const filename = path.resolve(__dirname, '../miniprogram/pages/' + name + '/index.js');
      delete require.cache[filename]; require(filename);
      const page = Object.assign({}, definition, { data: clone(definition.data) });
      page.setData = function setData(update) {
        for (const [key, value] of Object.entries(update)) {
          const parts = key.split('.'); let target = this.data;
          for (const part of parts.slice(0, -1)) { if (!target[part]) target[part] = {}; target = target[part]; }
          target[parts[parts.length - 1]] = value;
        }
      };
      return page;
    }
  };
}
function event(dataset, value) { return { currentTarget: { dataset }, detail: { value } }; }

test('原生Page处理器完整流程：报名→筛查→模拟支付→打卡→心得审核→周报→退款', async () => {
  const p = platform();
  let today = p.page('today'); await today.onShow();
  assert.equal(today.data.view.paid, true);
  today.setData({ exerciseDone: true, dietDone: true, minutes: '30' }); await today.submit();
  assert.equal(today.data.view.period.valid, 1);

  const community = p.page('community'); await community.onShow();
  community.input(event({}, '先把一小步做好，今天按计划快走。')); await community.publish();
  const post = community.data.view.posts.find(row => row.mine);
  assert.equal(post.status, 'pending'); assert.equal(community.data.content, '');

  p.app.service.switchActor('demo-admin');
  const admin = p.page('admin'); await admin.onShow();
  await admin.moderate(event({ id: post.id, status: 'approved' }));
  await admin.choosePeriod(event({}, '1'));
  assert.equal(admin.data.view.admin.qualifiedCount, 1);
  assert.equal(admin.data.view.admin.assessedCount, 2);
  await admin.exportCsv(); assert.ok(p.copied[0].includes('林晓'));
  await admin.action(event({ action: 'processRefunds' }));
  assert.equal(admin.data.view.admin.refunds[0].status, 'processing');
  await admin.action(event({ action: 'confirmRefunds' }));
  assert.equal(admin.data.view.admin.refunds[0].status, 'refunded');

  p.app.service.switchActor('demo-peer'); await community.onShow();
  assert.ok(community.data.view.posts.some(row => row.id === post.id));
  await community.like(event({ id: post.id }));
  assert.equal(community.data.view.posts.find(row => row.id === post.id).likeCount, 1);

  p.app.service.switchActor('demo-visitor');
  const enroll = p.page('enroll'); await enroll.onShow();
  enroll.setData({ nickname: '新同学', age: '43', height: '170', weight: '82' });
  enroll.consents(event({}, ['health', 'privacy', 'terms']));
  for (const question of enroll.data.questions) enroll.answer(event({ key: question.key }, '1'));
  await enroll.screen(); assert.equal(enroll.data.view.me.healthStatus, 'clear');
  await enroll.pay(); await p.drain();
  assert.equal(enroll.data.view.paid, true);
  assert.ok(p.navigation.includes('/pages/today/index'));
  today = p.page('today'); await today.onShow();
  assert.equal(today.data.view.started, false);
  await today.jump(); assert.equal(today.data.view.day, 1);
  today.setData({ exerciseDone: true, dietDone: true, minutes: '20' }); await today.submit();
  assert.equal(today.data.view.period.valid, 1);
  const profile = p.page('profile'); await profile.onShow();
  profile.setData({ weight: '81.8', waist: '95' }); await profile.saveBody();
  assert.equal(profile.data.view.latestWeight, 81.8);
  profile.setData({ reason: '身体不适，需要联系调整计划' }); await profile.request();
  assert.equal(profile.data.view.requests[0].status, 'pending');
  p.app.service.switchActor('demo-admin'); await admin.onShow();
  admin.resolve(event({ id: admin.data.view.admin.requests[0].id })); await p.drain();
  assert.equal(admin.data.view.admin.requests.length, 0);
  assert.ok(!p.dialogs.some(value => /失败|无效/.test(value)));
});
test('页面拒绝高风险报名、未勾选协议和普通成员管理操作', async () => {
  const p = platform(); p.app.service.switchActor('demo-visitor');
  const enroll = p.page('enroll'); await enroll.onShow();
  enroll.setData({ nickname: '待评估用户', age: '43', height: '170', weight: '82' });
  for (const question of enroll.data.questions) enroll.answer(event({ key: question.key }, '1'));
  await enroll.screen(); assert.equal(enroll.data.view.me.healthStatus, 'unknown');
  enroll.consents(event({}, ['health', 'privacy', 'terms']));
  enroll.answer(event({ key: 'symptoms' }, '2'));
  await enroll.screen(); assert.equal(enroll.data.view.me.healthStatus, 'review');
  await enroll.pay(); assert.equal(enroll.data.view.orders.length, 0);
  p.app.service.switchActor('demo-member');
  const admin = p.page('admin'); await admin.onShow();
  assert.equal(admin.data.view.admin, undefined);
  await admin.action(event({ action: 'settle' }));
  assert.ok(p.dialogs.includes('需要管理员权限'));
});
