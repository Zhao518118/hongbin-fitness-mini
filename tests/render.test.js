const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const compiler = require('miniprogram-compiler');
const { Engine, context, setup, call, screening } = require('./helpers');
const UI = require('../miniprogram/lib/ui');

// 使用微信团队发布的wcc/wcsc封装编译真实模板，检查实际渲染树而不是模板字符串。
const source = compiler.wxmlToJs(path.resolve(__dirname, '../miniprogram'));
const renderFor = vm.runInNewContext('(function(global){' + source + '})({})', { window: {}, console });
function render(page, data) { return renderFor('pages/' + page + '/index.wxml')(Object.assign({ loading: false, busy: false, error: '' }, data)); }
function walk(node, callback) { callback(node); if (node && Array.isArray(node.children)) node.children.forEach(child => walk(child, callback)); }
function allText(tree) { const result = []; walk(tree, node => { if (typeof node === 'string' || typeof node === 'number') result.push(String(node)); }); return result.join(' '); }
function view(state, actor) { return UI.decorate(Engine.handle(state, actor, 'view', {}, context())); }

test('真实WXML渲染：付费用户只显示打卡分支，周日历正确循环7天', () => {
  const tree = render('today', { view: view(setup(), 'demo-member'), minutes: '30', exercises: ['快走'], exerciseIndex: 0, dinnerTime: '17:30' });
  const text = allText(tree);
  assert.ok(text.includes('保存今天的记录'));
  assert.ok(!text.includes('了解并报名'));
  assert.ok(!text.includes('正在读取你的计划'));
  let dots = 0; walk(tree, node => { if (node && node.attr && /^dot /.test(node.attr.class)) dots++; });
  assert.equal(dots, 7);
});
test('真实WXML渲染：未付费用户只有报名入口，无付费内容与打卡按钮', () => {
  const data = { view: view(setup(), 'demo-visitor') };
  const today = allText(render('today', data));
  assert.ok(today.includes('了解并报名')); assert.ok(!today.includes('保存今天的记录'));
  const community = allText(render('community', data));
  assert.ok(community.includes('完成健康准入并入营后'));
  assert.ok(!community.includes('提交心得'));
});
test('真实WXML渲染：普通用户管理页面不渲染结算或审核操作', () => {
  const text = allText(render('admin', { view: view(setup(), 'demo-member') }));
  assert.ok(text.includes('需要管理员权限'));
  assert.ok(!text.includes('结算所有已结束周期'));
  assert.ok(!text.includes('模拟确认到账'));
});
test('真实WXML渲染：同意前不展示问卷，风险回答后没有付款按钮', () => {
  const state = setup();
  const base = { healthConsent: false, privacyConsent: false, termsConsent: false, questions: Engine.HEALTH_QUESTIONS.map((label, index) => ({ label, key: Engine.HEALTH_KEYS[index], index: 0 })), options: ['请选择', '否', '是', '不确定'] };
  const before = allText(render('enroll', Object.assign({}, base, { view: view(state, 'demo-visitor') })));
  assert.ok(!before.includes('一分钟健康筛查'));
  const payload = screening(); payload.answers.cardiac = 'yes';
  call(state, 'demo-visitor', 'screen', payload);
  const after = allText(render('enroll', Object.assign({}, base, { healthConsent: true, privacyConsent: true, view: view(state, 'demo-visitor') })));
  assert.ok(after.includes('需要进一步评估'));
  assert.ok(!after.includes('模拟支付 ¥900 并入营'));
});
test('真实WXML渲染：管理周表、我的记录、协议及加载态均可生成', () => {
  const state = setup();
  const adminTree = render('admin', { view: view(state, 'demo-admin'), periods: ['当前周期'], periodChoice: 0 });
  assert.ok(allText(adminTree).includes('林晓')); assert.ok(allText(adminTree).includes('周远'));
  const profileTree = render('profile', { view: view(state, 'demo-member'), roles: [], requestTypes: ['暂停/调整'], requestType: 0 });
  assert.ok(allText(profileTree).includes('第12周')); assert.ok(allText(profileTree).includes('结营6天'));
  assert.ok(allText(render('agreement', { title: '健康告知', body: '演示风险说明' })).includes('演示风险说明'));
  for (const page of ['today', 'community', 'profile', 'enroll', 'admin']) assert.doesNotThrow(() => render(page, { view: null, loading: true }));
});
test('真实WXSS编译生成样式函数，所有页面共用样式可编译', () => {
  const style = compiler.wxssToJs(path.resolve(__dirname, '../miniprogram'));
  assert.ok(style.includes('app.wxss'));
  assert.doesNotThrow(() => new vm.Script('(function(global){' + style + '})'));
});
