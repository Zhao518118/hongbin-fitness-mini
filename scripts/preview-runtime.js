/* global PREVIEW_SOURCES, PREVIEW_WXML */
'use strict';
(function browserPreview() {
  const screen = document.getElementById('screen');
  const phone = document.querySelector('.phone');
  const definitions = {};
  const frames = {};
  const modules = {};
  const memory = new Map();
  let app;
  let registering = '';
  let active = 'today';
  let stack = [];
  let queued = false;
  let typing = false;
  let toastTimer;
  let dialogFinish;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const titles = { today: '今日 · 晨光同行', community: '营友 · 一起坚持', profile: '我的 · 看见进步', enroll: '报名 · 90天同行', agreement: '服务说明', admin: '管理工作台' };
  function readStorage(key) {
    if (memory.has(key)) return clone(memory.get(key));
    try { const value = localStorage.getItem('morning-preview:' + key); return value ? JSON.parse(value) : undefined; }
    catch (_) { return clone(memory.get(key)); }
  }
  function writeStorage(key, value) {
    memory.set(key, clone(value));
    try { localStorage.setItem('morning-preview:' + key, JSON.stringify(value)); }
    catch (_) { /* 隐私模式可能禁用本机存储，此时本次打开仍可操作。 */ }
  }
  function toast(message) {
    const node = document.getElementById('toast'); node.textContent = message; node.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
  }
  function schedule() {
    if (queued || typing) return;
    queued = true;
    queueMicrotask(() => { queued = false; paint(); });
  }
  function resolve(from, request) {
    const parts = (from.slice(0, from.lastIndexOf('/') + 1) + request).split('/');
    const result = [];
    for (const item of parts) { if (item === '..') result.pop(); else if (item && item !== '.') result.push(item); }
    const filename = result.join('/'); return filename.endsWith('.js') ? filename : filename + '.js';
  }
  function load(filename) {
    if (modules[filename]) return modules[filename].exports;
    if (!Object.prototype.hasOwnProperty.call(PREVIEW_SOURCES, filename)) throw new Error('预览模块缺失：' + filename);
    const module = { exports: {} }; modules[filename] = module;
    new Function('require', 'module', 'exports', PREVIEW_SOURCES[filename])(request => load(resolve(filename, request)), module, module.exports);
    return module.exports;
  }
  window.App = definition => { app = definition; };
  window.getApp = () => app;
  window.Page = definition => { definitions[registering] = definition; };
  function frame(name) {
    if (!frames[name]) {
      registering = name; load('pages/' + name + '/index.js'); registering = '';
      const definition = definitions[name];
      const page = Object.assign({}, definition, { data: clone(definition.data) });
      page.setData = function setData(update) {
        for (const [key, value] of Object.entries(update)) {
          const parts = key.split('.'); let node = this.data;
          for (const part of parts.slice(0, -1)) { if (!node[part]) node[part] = {}; node = node[part]; }
          node[parts[parts.length - 1]] = value;
        }
        schedule();
      };
      frames[name] = page;
    }
    return frames[name];
  }
  function eventFor(node, value) { return { currentTarget: { dataset: Object.assign({}, node.dataset) }, detail: { value } }; }
  async function invoke(page, handler, node, value, isInput) {
    if (typeof page[handler] !== 'function') return;
    try {
      typing = !!isInput;
      const result = page[handler](eventFor(node, value));
      typing = false;
      if (result && typeof result.then === 'function') { await result; schedule(); }
    } catch (error) { typing = false; toast(error.message || '操作失败'); }
  }
  async function navigate(url, tab) {
    const [pathname, query] = url.split('?');
    const name = pathname.split('/')[2];
    if (!titles[name]) return;
    if (tab) stack = []; else if (active !== name) stack.push(active);
    active = name;
    document.getElementById('page-title').textContent = titles[name];
    const page = frame(name);
    if (page.onLoad) page.onLoad(Object.fromEntries(new URLSearchParams(query || '')));
    if (page.onShow) await page.onShow();
    screen.scrollTop = 0; paint();
  }
  async function back() {
    active = stack.pop() || 'today';
    document.getElementById('page-title').textContent = titles[active];
    if (frame(active).onShow) await frame(active).onShow();
    paint();
  }
  function modal(options, list) {
    const dialog = document.getElementById('dialog');
    if (dialog.open) dialog.close();
    document.getElementById('dialog-title').textContent = options.title || '请选择';
    document.getElementById('dialog-body').textContent = options.content || '';
    const input = document.getElementById('dialog-input'); input.hidden = !options.editable; input.value = ''; input.placeholder = options.placeholderText || '';
    const choices = document.getElementById('dialog-options'); choices.replaceChildren();
    const confirm = document.getElementById('dialog-confirm'); confirm.textContent = options.confirmText || '确定'; confirm.hidden = !!list;
    dialogFinish = async (accepted, tapIndex) => {
      dialog.close();
      if (accepted && options.success) await options.success(list ? { tapIndex } : { confirm: true, cancel: false, content: input.value });
      else if (!list && options.success) await options.success({ confirm: false, cancel: true });
      schedule();
    };
    if (list) list.forEach((label, index) => { const button = document.createElement('button'); button.textContent = label; button.onclick = () => dialogFinish(true, index); choices.appendChild(button); });
    dialog.showModal();
    if (options.editable) input.focus();
  }
  document.getElementById('dialog-confirm').onclick = () => dialogFinish(true);
  document.getElementById('dialog-cancel').onclick = () => dialogFinish(false);
  document.getElementById('dialog').addEventListener('cancel', () => { if (dialogFinish) dialogFinish(false); });

  window.wx = {
    getStorageSync: readStorage, setStorageSync: writeStorage,
    showToast: options => toast(options.title),
    showModal: options => modal(options),
    showActionSheet: options => modal(options, options.itemList),
    navigateTo: options => navigate(options.url, false),
    switchTab: options => navigate(options.url, true),
    setNavigationBarTitle: options => { document.getElementById('page-title').textContent = options.title; },
    setClipboardData(options) {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(options.data).then(() => toast('统计表已复制')).catch(() => downloadCSV(options.data));
      else downloadCSV(options.data);
    },
    chooseMedia(options) {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files[0]; if (!file) return;
        if (file.size > 2 * 1024 * 1024) return toast('预览版请选择小于2MB的图片');
        const reader = new FileReader();
        reader.onload = () => {
          const key = 'wxfile://preview/' + Date.now();
          try { writeStorage('image:' + key, reader.result); options.success({ tempFiles: [{ tempFilePath: key }] }); }
          catch (_) { toast('图片保存失败，请换较小图片'); }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
    getFileSystemManager() { return { saveFile(options) { options.success({ savedFilePath: options.tempFilePath }); } }; }
  };
  function downloadCSV(data) {
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = '晨光营周报.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000); toast('预览版：统计表已下载为CSV');
  }
  const renderer = new Function('global', PREVIEW_WXML)({});
  const ranges = { chooseExercise: 'exercises', answer: 'options', chooseRequest: 'requestTypes', switchRole: 'roles', choosePeriod: 'periods' };
  function dom(node, page) {
    if (node == null) return document.createTextNode('');
    if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node));
    const type = (node.tag || '').replace(/^wx-/, '');
    const attrs = node.attr || {};
    let element;
    if (type === 'picker') {
      element = document.createElement(attrs.mode === 'time' ? 'input' : 'select');
      element.className = 'picker preview-picker';
      if (attrs.mode === 'time') { element.type = 'time'; element.value = attrs.value || '17:30'; }
      else {
        const values = page.data[ranges[attrs.bindchange]] || [];
        values.forEach((value, index) => { const option = document.createElement('option'); option.value = index; option.textContent = value; element.appendChild(option); });
        if (attrs.bindchange === 'switchRole') {
          const me = page.data.view && page.data.view.me;
          element.value = me ? page.data.roleIds.indexOf(me.id) : 0;
        } else element.value = attrs.value == null ? 0 : attrs.value;
      }
    } else if (type === 'input' || type === 'switch' || type === 'checkbox') {
      element = document.createElement('input');
      if (type === 'switch' || type === 'checkbox') { element.type = 'checkbox'; element.checked = attrs.checked === true; if (type === 'switch') element.setAttribute('role', 'switch'); }
      else { element.type = 'text'; if (attrs.type === 'number' || attrs.type === 'digit') element.inputMode = attrs.type === 'digit' ? 'decimal' : 'numeric'; }
      if (attrs.value != null) element.value = String(attrs.value);
    } else if (type === 'textarea') { element = document.createElement('textarea'); element.value = attrs.value || ''; }
    else if (type === 'image') { element = document.createElement('img'); element.src = /^wxfile:\/\/preview\//.test(attrs.src || '') ? readStorage('image:' + attrs.src) || '' : ''; element.alt = '营友主动分享的图片'; }
    else element = document.createElement(type === 'button' ? 'button' : type === 'label' ? 'label' : type === 'text' ? 'span' : 'div');
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') element.className += (element.className ? ' ' : '') + value;
      else if (key === 'style') element.setAttribute('style', String(value).replace(/(-?\d*\.?\d+)rpx/g, 'calc(var(--rpx) * $1)'));
      else if (key.startsWith('data-')) element.setAttribute(key, String(value));
      else if (key === 'disabled') element.disabled = value === true;
      else if (key === 'maxlength' || key === 'placeholder') element.setAttribute(key, value);
    }
    if (type === 'checkbox-group') element.dataset.checkboxGroup = 'true';
    if (attrs.bindtap) element.addEventListener('click', event => { event.stopPropagation(); invoke(page, attrs.bindtap, element); });
    if (attrs.bindinput) element.addEventListener('input', () => invoke(page, attrs.bindinput, element, element.value, true));
    if (attrs.bindchange) element.addEventListener('change', event => {
      if (type === 'checkbox-group') {
        event.stopPropagation();
        const values = Array.from(element.querySelectorAll('input[type=checkbox]:checked')).map(item => item.value);
        invoke(page, attrs.bindchange, element, values);
      } else {
        event.stopPropagation(); invoke(page, attrs.bindchange, element, type === 'switch' ? element.checked : element.value);
      }
    });
    if (!['picker', 'textarea', 'input', 'switch', 'checkbox', 'image'].includes(type)) (node.children || []).forEach(child => element.appendChild(dom(child, page)));
    return element;
  }
  function paint() {
    try {
      const page = frames[active]; if (!page) return;
      const scroll = screen.scrollTop;
      const tree = renderer('pages/' + active + '/index.wxml')(page.data);
      screen.replaceChildren(dom(tree, page)); screen.scrollTop = scroll;
      document.querySelectorAll('.tabs button').forEach(button => button.classList.toggle('active', button.dataset.page === active));
      document.getElementById('back').hidden = !stack.length;
      const primary = ['today', 'community', 'profile'].includes(active);
      document.querySelector('.tabs').hidden = !primary;
    } catch (error) { screen.textContent = '预览出错：' + error.message; console.error(error); }
  }
  document.getElementById('back').onclick = back;
  document.querySelectorAll('.tabs button').forEach(button => { button.onclick = () => navigate('/pages/' + button.dataset.page + '/index', true); });
  document.querySelectorAll('[data-role]').forEach(button => { button.onclick = async () => {
    app.service.switchActor(button.dataset.role); Object.keys(frames).forEach(key => { delete frames[key]; });
    await navigate('/pages/' + (button.dataset.role === 'demo-admin' ? 'admin' : 'today') + '/index', true);
  }; });
  new ResizeObserver(() => { phone.style.setProperty('--rpx', phone.clientWidth / 750 + 'px'); }).observe(phone);
  load('app.js'); app.onLaunch(); navigate('/pages/today/index', true);
  window.previewStatus = () => ({ page: active, data: frames[active].data });
})();
