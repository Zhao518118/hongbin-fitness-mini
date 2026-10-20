const Engine = require('./engine');
const D = require('./domain');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function createLocalService(storage, clock) {
  const now = clock || (() => new Date());
  let state = storage.get('camp-state-v1') || Engine.demoState(D.businessDate(now()));
  let actor = storage.get('camp-actor') || 'demo-member';
  function save() { storage.set('camp-state-v1', state); storage.set('camp-actor', actor); }
  const context = () => ({ mode: 'demo', localDemo: true, now: now(), adminIds: ['demo-admin'] });
  save();
  return {
    mode: 'demo',
    async call(action, payload) {
      // 一次操作全部成功才提交，失败不保留半份订单、记录或退款。
      const draft = clone(state);
      const result = Engine.handle(draft, actor, action, payload, context());
      state = draft;
      save();
      return clone(result);
    },
    switchActor(value) {
      if (!['demo-member', 'demo-peer', 'demo-visitor', 'demo-admin'].includes(value)) D.fail('ACTOR', '演示身份无效');
      actor = value; save();
    },
    async jumpToStart() {
      const en = state.enrollments[actor];
      D.requireThat(en, 'PAYWALL', '请先完成模拟报名');
      const start = state.camps.find(row => row.id === en.campId).startDate;
      D.requireThat(start > state.demoDate, 'DATE', '您已在训练期内，无需跳转');
      state.demoDate = start; save();
      return this.call('view');
    },
    reset() { state = Engine.demoState(D.businessDate(now())); actor = 'demo-member'; save(); }
  };
}
function createCloudService(wxApi, config) {
  D.requireThat(config.cloudEnv, 'CLOUD_CONFIG', '请先配置云环境ID；当前不会降级为模拟模式');
  wxApi.cloud.init({ env: config.cloudEnv, traceUser: true });
  return {
    mode: 'cloud',
    async call(action, payload) {
      const response = await wxApi.cloud.callFunction({ name: config.apiFunction, data: { action, payload: payload || {} } });
      const result = response.result;
      if (!result || !result.ok) D.fail(result && result.code || 'CLOUD', result && result.message || '云服务返回异常');
      return result.data;
    }
  };
}
module.exports = { createLocalService, createCloudService };
