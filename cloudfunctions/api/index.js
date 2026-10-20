'use strict';

const cloud = require('wx-server-sdk');
const Engine = require('./shared/engine');
const D = require('./shared/domain');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async function main(event) {
  try {
    const wxContext = cloud.getWXContext();
    const mode = process.env.APP_MODE === 'demo' ? 'demo' : 'production';
    const adminIds = (process.env.ADMIN_OPENIDS || '').split(',').map(value => value.trim()).filter(Boolean);
    let actor = wxContext.OPENID;
    let action = event.action || 'view';
    let payload = event.payload || {};
    if (!actor) {
      // 客户端传入Type不能绕过认证：真实客户端上下文有OPENID。
      D.requireThat(event.Type === 'Timer' && process.env.ENABLE_SCHEDULER === 'true', 'AUTH', '仅支持认证的小程序调用或已配置定时器');
      actor = 'system:timer'; adminIds.push(actor); action = 'settle'; payload = {};
    }
    D.requireThat(JSON.stringify(payload).length <= 16000, 'INPUT', '请求内容过大');
    const ctx = { mode, now: new Date(), adminIds };
    const response = await db.runTransaction(async transaction => {
      // 必须由运营者提前创建私有集合与状态文档；不存在时绝不自动重置。
      const doc = transaction.collection('camp_private').doc('state-v1');
      const stored = await doc.get();
      D.requireThat(stored.data && stored.data.state && stored.data.state.version === 1, 'INITIALIZE', '请先导入初始状态并配置数据库权限');
      const state = stored.data.state;
      const data = Engine.handle(state, actor, action, payload, ctx);
      D.requireThat(Buffer.byteLength(JSON.stringify(state), 'utf8') < 800000, 'STATE_CAPACITY', '试营数据接近容量上限，请联系运营方迁移归档');
      await doc.set({ data: { state, revision: (stored.data.revision || 0) + 1, updatedAt: new Date().toISOString() } });
      return { ok: true, data };
    });
    return response;
  } catch (error) {
    // 不输出健康问卷、请求体、OPENID、凭证或完整SDK异常。
    return { ok: false, code: error.safe ? error.code : 'CLOUD_STATE', message: error.safe ? error.message : '云服务未就绪，请检查状态文档、权限和部署配置' };
  }
};
