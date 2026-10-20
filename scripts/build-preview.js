'use strict';

// 单文件离线预览：复用真实小程序的业务、Page处理器及wcc编译后的页面。
const fs = require('node:fs');
const path = require('node:path');
const compiler = require('miniprogram-compiler');
const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'miniprogram');
const sources = {};
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(filename);
    else if (entry.name.endsWith('.js')) sources[path.relative(mini, filename).split(path.sep).join('/')] = fs.readFileSync(filename, 'utf8');
  }
}
visit(mini);
// 浏览器单文件永远只连接本机模拟服务，不读取或发起任何真实支付配置。
sources['config.js'] = "module.exports = { mode: 'demo' };";
const safeJSON = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const bundle = 'window.PREVIEW_SOURCES=' + safeJSON(sources) + ';\nwindow.PREVIEW_WXML=' + safeJSON(compiler.wxmlToJs(mini)) + ';\n';
const styles = fs.readFileSync(path.join(mini, 'app.wxss'), 'utf8')
  .replace(/(^|[}\n])\s*page\s*\{/g, '$1#screen{').replace(/(-?\d*\.?\d+)rpx/g, 'calc(var(--rpx) * $1)');
const runtime = fs.readFileSync(path.join(__dirname, 'preview-runtime.js'), 'utf8');
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>双击即可体验 · 晨光90天</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eaf0e6;color:#20392e;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif}.workspace{max-width:1050px;margin:auto;display:grid;grid-template-columns:320px 414px;gap:72px;align-items:start;padding:32px 24px}.intro{padding-top:54px}.intro h1{font-size:34px;line-height:1.4;margin:16px 0}.intro p{color:#647767}.intro .overline{font-size:13px;letter-spacing:4px;color:#568164}.intro button{display:block;width:100%;margin-top:12px;border:1px solid #c9d9c4;background:white;color:#315d45;border-radius:12px;padding:14px;cursor:pointer;font-size:16px}.intro .hint{font-size:13px;padding:16px;background:#f6f8f0;border-radius:12px;margin-top:24px}.phone{--rpx:.552px;width:414px;max-width:100%;height:calc(100vh - 64px);min-height:580px;max-height:920px;border:1px solid #cbd8c6;background:#f6f7f2;border-radius:28px;box-shadow:0 20px 70px #29452c1c;display:flex;flex-direction:column;overflow:hidden}.phone header{height:55px;min-height:55px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #e4e9df;position:relative;background:#f6f7f2}.phone header button{position:absolute;left:12px;border:0;background:transparent;font-size:24px;color:#176b50;padding:0 10px;min-height:35px}.phone header strong{font-size:15px;font-weight:600}#screen{flex:1;overflow:auto;scroll-behavior:smooth}.tabs{height:62px;min-height:62px;display:flex;background:#fff;border-top:1px solid #e5ebe0}.tabs button{flex:1;border:0;background:white;font-size:16px;color:#81917c;cursor:pointer;padding:0;min-height:0;border-radius:0}.tabs button.active{color:#176b50;background:#f4f8ef;font-weight:bold}.toast{position:fixed;left:50%;bottom:95px;transform:translateX(-50%);background:#20392ef0;color:white;border-radius:12px;padding:14px 22px;max-width:90vw;z-index:20;box-shadow:0 5px 30px #0002}.toast[hidden]{display:none}dialog{border:1px solid #d8e3d1;border-radius:18px;padding:26px;max-width:430px;width:90vw;color:#20392e;box-shadow:0 25px 100px #0003}dialog::backdrop{background:#152c2570}dialog h2{font-size:20px;margin-top:0}dialog p{font-size:16px;white-space:pre-wrap}dialog textarea{width:100%;height:100px;padding:12px;border:1px solid #d6e0cf;border-radius:10px;font:inherit}.dialog-actions{display:flex;gap:12px;justify-content:flex-end;margin-top:24px}.dialog-actions button,.sheet button{border:0;border-radius:10px;background:#eaf1e4;color:#31583e;padding:12px 20px;font-size:16px;cursor:pointer}.dialog-actions .confirm{background:#176b50;color:white}.sheet{display:grid;gap:10px}#screen input,#screen select,#screen textarea,#screen button{font-family:inherit}#screen input[type=checkbox]{accent-color:#176b50;width:21px;height:21px;flex-shrink:0}#screen input[role=switch]{width:42px;height:25px}#screen img.post-image{object-fit:cover}#screen .legal{white-space:pre-wrap}#screen select{max-width:100%;cursor:pointer}#screen button{cursor:pointer}#screen .preview-checkbox{display:inline-flex;align-items:center;padding-top:3px}#screen .preview-text{white-space:pre-wrap}#screen input.input{display:block;height:auto}#screen .preview-picker{display:block}#screen textarea{display:block;resize:vertical}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #8fba57;outline-offset:3px}@media(max-width:820px){.workspace{display:block;padding:0}.intro{max-width:450px;margin:auto;padding:20px}.intro h1{font-size:24px;margin:8px 0}.intro p,.intro .hint{display:none}.intro .shortcuts{display:flex;gap:8px}.intro button{font-size:13px;margin:0;padding:9px}.phone{margin:auto;width:100%;max-width:450px;border-radius:0;height:calc(100dvh - 150px);min-height:500px;max-height:none}.intro .overline{font-size:11px}}
${styles}
</style></head><body>
<main class="workspace"><aside class="intro"><div class="overline">MORNING TOGETHER</div><h1>先看效果，<br>再慢慢打磨。</h1><p>这是微信小程序的浏览器演示。<br>无需注册、无需扫码、无需安装。</p><div class="shortcuts"><button data-role="demo-member">① 体验成员打卡</button><button data-role="demo-visitor">② 从报名开始体验</button><button data-role="demo-admin">③ 查看管理员工作台</button></div><div class="hint">所有资料保存在当前浏览器，均为虚构演示。支付、退款不涉及真实资金。正式微信版的授权、设备接口和实际排版仍需单独验收。<br><br>本页可以断网打开。在“我的”可切换身份和重置演示。900元为累计返款上限，没有额外结营奖金。</div></aside>
<section class="phone" aria-label="小程序演示"><header><button id="back" aria-label="返回" hidden>‹</button><strong id="page-title">今日 · 晨光同行</strong></header><div id="screen"></div><nav class="tabs" aria-label="主导航"><button data-page="today" class="active">今日</button><button data-page="community">营友</button><button data-page="profile">我的</button></nav></section></main>
<div id="toast" class="toast" hidden role="status"></div><dialog id="dialog"><h2 id="dialog-title"></h2><p id="dialog-body"></p><textarea id="dialog-input" hidden></textarea><div id="dialog-options" class="sheet"></div><div class="dialog-actions"><button id="dialog-cancel">取消</button><button id="dialog-confirm" class="confirm">确定</button></div></dialog>
<script>${bundle}</script><script>${runtime.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
const destination = path.join(root, '双击打开演示.html');
fs.writeFileSync(destination, html);
console.log('已生成：双击打开演示.html（离线单文件，不需要微信账号或服务器）');
