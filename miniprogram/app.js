const config = require('./config');
const { createLocalService, createCloudService } = require('./lib/service');
App({
  onLaunch() {
    try {
      this.service = config.mode === 'demo'
        ? createLocalService({ get: key => wx.getStorageSync(key), set: (key, value) => wx.setStorageSync(key, value) })
        : createCloudService(wx, config);
    } catch (error) {
      this.service = { mode: 'unavailable', call: async () => { throw error; } };
    }
  }
});
