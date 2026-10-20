const Engine = require('../miniprogram/lib/engine');
const D = require('../miniprogram/lib/domain');
const BASE = '2026-10-20';
const context = (overrides = {}) => Object.assign({ mode: 'demo', localDemo: true, now: BASE + 'T02:00:00Z', adminIds: ['demo-admin'] }, overrides);
const clone = value => JSON.parse(JSON.stringify(value));
const setup = () => Engine.demoState(BASE);
const call = (state, actor, action, payload = {}, ctx = context()) => Engine.handle(state, actor, action, payload, ctx);
function screening(overrides = {}) {
  return Object.assign({ nickname: '测试营友', age: 42, height: 170, weight: 80, healthConsent: true, privacyConsent: true, documentVersion: D.DOCUMENT_VERSION, answers: Object.fromEntries(Engine.HEALTH_KEYS.map(key => [key, 'no'])) }, overrides);
}
function fillAll(state, actor = 'demo-member') {
  const en = state.enrollments[actor];
  const camp = state.camps.find(row => row.id === en.campId);
  for (let index = 0; index < 90; index++) {
    const date = D.addDays(camp.startDate, index);
    state.checkins[D.recordKey(actor, camp.id, date)] = { date, userId: actor, campId: camp.id, status: 'complete' };
  }
  state.demoDate = D.addDays(camp.startDate, 90);
}
const complete = { minutes: 30, exercise: '快走', exerciseDone: true, dietDone: true, dinnerTime: '17:30' };
module.exports = { Engine, D, BASE, context, clone, setup, call, screening, fillAll, complete };
