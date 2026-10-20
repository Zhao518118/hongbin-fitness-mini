const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Engine, D, setup, clone, fillAll } = require('./helpers');

function harness(mode = 'demo', initial = setup()) {
  let stored = { state: clone(initial), revision: 0 };
  let queue = Promise.resolve();
  let openid = 'demo-member';
  const database = {
    runTransaction(fn) {
      const execute = async () => {
        let draft;
        const value = await fn({ collection() { return { doc() { return {
          async get() { return { data: clone(stored) }; },
          async set({ data }) { draft = clone(data); }
        }; } }; } });
        if (draft) stored = draft;
        return value;
      };
      const result = queue.then(execute);
      queue = result.catch(() => {});
      return result;
    }
  };
  const cloud = { init() {}, database: () => database, getWXContext: () => ({ OPENID: openid }) };
  const exports = {};
  const filename = path.resolve(__dirname, '../cloudfunctions/api/index.js');
  const sandbox = { exports, Buffer, Date, process: { env: { APP_MODE: mode, ADMIN_OPENIDS: 'demo-admin', ENABLE_SCHEDULER: 'true' } }, require(name) {
    if (name === 'wx-server-sdk') return cloud;
    if (name === './shared/engine') return Engine;
    if (name === './shared/domain') return D;
    throw new Error('unexpected require ' + name);
  } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return {
    call(actor, event) { openid = actor; return exports.main(event); },
    state() { return clone(stored); }
  };
}

test('云函数身份来自微信上下文，payload角色、actor、mode不能越权', async () => {
  const api = harness();
  const result = await api.call('demo-member', { action: 'settle', payload: { actor: 'demo-admin', isAdmin: true } });
  assert.equal(result.ok, false); assert.equal(result.code, 'FORBIDDEN');
  const read = await api.call('demo-member', { action: 'view', payload: { actor: 'demo-admin' } });
  assert.equal(read.data.isAdmin, false); assert.equal(read.data.localDemo, false);
});
test('客户端伪造Timer事件不能调用系统结算；未认证普通请求被拒绝', async () => {
  const api = harness();
  const result = await api.call('demo-member', { Type: 'Timer', action: 'settle' });
  assert.equal(result.code, 'FORBIDDEN');
  assert.equal((await api.call(undefined, { action: 'view' })).code, 'AUTH');
  assert.equal((await api.call(undefined, { Type: 'Timer' })).ok, true);
});
test('云函数生产模式无法用客户端mode触发模拟支付或退款', async () => {
  const api = harness('production');
  const result = await api.call('demo-member', { action: 'simulatePayment', payload: { orderId: 'seed-demo-member', mode: 'demo' } });
  assert.equal(result.code, 'DEMO_ONLY');
  assert.equal((await api.call('demo-admin', { action: 'confirmRefunds' })).code, 'REFUND_NOT_CONFIGURED');
});
test('云事务并发结算及重复退款请求幂等，累计90000分', async () => {
  const state = setup(); fillAll(state);
  const api = harness('demo', state);
  const results = await Promise.all(Array.from({ length: 25 }, () => api.call('demo-admin', { action: 'settle' })));
  assert.ok(results.every(row => row.ok));
  await Promise.all(Array.from({ length: 10 }, () => api.call('demo-admin', { action: 'processRefunds' })));
  await Promise.all(Array.from({ length: 10 }, () => api.call('demo-admin', { action: 'confirmRefunds' })));
  const saved = api.state().state;
  const rows = Object.values(saved.refunds).filter(row => row.orderId === 'seed-demo-member');
  assert.equal(rows.length, 13);
  assert.equal(rows.reduce((sum, row) => sum + row.amountFen, 0), 90000);
  assert.ok(rows.every(row => row.status === 'refunded'));
});
test('云事务操作失败不提交半成品状态，不向普通用户返回健康档案', async () => {
  const api = harness();
  const revision = api.state().revision;
  assert.equal((await api.call('demo-member', { action: 'body', payload: { weight: -1 } })).ok, false);
  assert.equal(api.state().revision, revision);
  const result = await api.call('demo-peer', { action: 'view' });
  assert.equal(result.data.admin, undefined);
  assert.ok(result.data.bodies.every(row => row.userId === 'demo-peer'));
});
