'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
require('./build-cloud');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.git'].includes(entry.name)) return [];
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}
for (const file of files(root)) {
  if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
}
const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
const allowed = new Set(['view', 'text', 'block', 'button', 'input', 'textarea', 'picker', 'switch', 'checkbox-group', 'checkbox', 'label', 'image']);
for (const page of app.pages) {
  const filename = path.join(root, 'miniprogram', page + '.js');
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require: createRequire(filename), Page: value => { definition = value; } }, { filename });
  const markup = fs.readFileSync(path.join(root, 'miniprogram', page + '.wxml'), 'utf8');
  const stack = [];
  for (const tag of markup.matchAll(/<(\/?)([\w-]+)([^>]*?)(\/?)>/g)) {
    const name = tag[2];
    if (!allowed.has(name)) throw new Error(page + ': 未识别的原生组件 ' + name);
    if (tag[1]) { if (stack.pop() !== name) throw new Error(page + ': 标签未配对 ' + name); }
    else if (!tag[4]) stack.push(name);
  }
  if (stack.length) throw new Error(page + ': 有未关闭标签');
  for (const binding of markup.matchAll(/(?:bind|catch)(?:tap|input|change|submit)="([A-Za-z_]\w*)"/g)) {
    if (!definition || typeof definition[binding[1]] !== 'function') throw new Error(page + ': 缺少事件处理 ' + binding[1]);
  }
  for (const directive of markup.matchAll(/wx:(?:if|elif|for)="([^"]*)"/g)) {
    if (!directive[1].startsWith('{{') || !directive[1].endsWith('}}')) throw new Error(page + ': 条件或循环必须使用WXML插值');
  }
  JSON.parse(fs.readFileSync(path.join(root, 'miniprogram', page + '.json'), 'utf8'));
}
for (const tab of app.tabBar.list) if (!app.pages.includes(tab.pagePath)) throw new Error('Tab路径不存在');
const compiler = require('miniprogram-compiler');
compiler.wxmlToJs(path.join(root, 'miniprogram'));
const styleSource = compiler.wxssToJs(path.join(root, 'miniprogram'));
new vm.Script('(function(global){' + styleSource + '})');
console.log('检查通过：JavaScript语法、JSON、6页组件/事件、wcc/wcsc模板样式编译及云函数打包。此检查不替代当前微信开发者工具和真机验收。');
