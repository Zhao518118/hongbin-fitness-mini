const UI = require('../../lib/ui');
Page({
  data: { view: null, loading: true, busy: false, error: '', content: '', image: '' },
  onShow() { return UI.refresh(this); },
  retry() { return this.onShow(); },
  input(event) { this.setData({ content: event.detail.value }); },
  enroll() { wx.navigateTo({ url: '/pages/enroll/index' }); },
  async publish() {
    const result = await UI.perform(this, 'post', { text: this.data.content, image: this.data.image }, '已提交，等待审核');
    if (result) this.setData({ content: '', image: '' });
  },
  chooseImage() {
    if (!this.data.view || !this.data.view.localDemo) return wx.showToast({ title: '云端图片审核尚未接入', icon: 'none' });
    wx.chooseMedia({ count: 1, mediaType: ['image'], sizeType: ['compressed'], success: result => {
      const path = result.tempFiles[0].tempFilePath;
      wx.getFileSystemManager().saveFile({ tempFilePath: path, success: saved => this.setData({ image: saved.savedFilePath }), fail: UI.showError });
    } });
  },
  clearImage() { this.setData({ image: '' }); },
  like(event) { return UI.perform(this, 'like', { postId: event.currentTarget.dataset.id }); },
  report(event) {
    const postId = event.currentTarget.dataset.id;
    wx.showActionSheet({ itemList: ['危险减肥或用药建议', '广告或骚扰', '泄露个人隐私', '其他不当内容'], success: result => {
      const reason = ['危险减肥或用药建议', '广告或骚扰', '泄露个人隐私', '其他不当内容'][result.tapIndex];
      UI.perform(this, 'report', { postId, reason }, '已提交举报');
    } });
  }
});
