#!/usr/bin/env node
/* 面板交互冒烟（仅开发用）：用 CDP 点按钮、填表单，检查没有抛错、没有横向溢出。
 *
 *   node scripts/panel-smoke.mjs [--port 8123]
 *
 * 依赖 scripts/panel-shot.mjs 相同的 Chrome 环境。每个用例打印 PASS/FAIL。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const portArg = process.argv.indexOf('--port');
const PORT = portArg > 0 ? Number(process.argv[portArg + 1]) : 8123;
const BASE = 'http://127.0.0.1:' + PORT + '/admin/?autologin=1&page=';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForFile(file, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(file)) {
      try {
        const text = fs.readFileSync(file, 'utf8').trim();
        if (text) return text.split('\n')[0];
      } catch { /* 正在写 */ }
    }
    await sleep(100);
  }
  throw new Error('Chrome 没有写出 DevToolsActivePort');
}

async function runCase(caseDef) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-smoke-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });

  let ws;
  let nextId = 0;
  const pending = new Map();
  const events = [];

  function send(method, params) {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  function waitEvent(name, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('等待超时: ' + name)), timeoutMs || 20000);
      events.push({ method: name, __resolve: resolve, __timer: timer });
    });
  }

  try {
    const debugPort = await waitForFile(path.join(profile, 'DevToolsActivePort'), 15000);
    const list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
    const target = list.find((t) => t.type === 'page');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method) {
        const i = events.findIndex((e) => e.method === msg.method && e.__resolve);
        if (i >= 0) {
          const [e] = events.splice(i, 1);
          clearTimeout(e.__timer);
          e.__resolve(msg.params);
        }
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.__errs=[];window.addEventListener("error",function(e){window.__errs.push(String(e.message||e))});window.addEventListener("unhandledrejection",function(e){var r=e.reason;window.__errs.push("rejection: "+String(r&&r.message||r))});'
    });
    await send('Emulation.setDeviceMetricsOverride', {
      width: caseDef.width || 1280, height: caseDef.height || 900,
      deviceScaleFactor: 1, mobile: (caseDef.width || 1280) < 760
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: (caseDef.width || 1280) < 760 });

    const loaded = waitEvent('Page.loadEventFired');
    await send('Page.navigate', { url: BASE + caseDef.page });
    await loaded;
    await sleep(900);

    const out = await send('Runtime.evaluate', {
      expression: '(function(){\n' + caseDef.js + '\n})()', awaitPromise: true, returnByValue: true
    });
    if (out.exceptionDetails) {
      const d = out.exceptionDetails.exception?.description || out.exceptionDetails.text;
      return { ok: false, detail: d.split('\n')[0] };
    }
    await sleep(500);

    const check = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: 'JSON.stringify({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,errs:window.__errs})'
    });
    const { sw, cw, errs } = JSON.parse(check.result.value);
    if (errs && errs.length) return { ok: false, detail: 'JS 错误: ' + errs.join(' | ') };
    if (sw > cw) return { ok: false, detail: '横向溢出 ' + sw + ' > ' + cw };
    return { ok: true, detail: out.result.value || '' };
  } catch (err) {
    return { ok: false, detail: err.message };
  } finally {
    try { if (ws) ws.close(); } catch {}
    chrome.kill();
    await sleep(100);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

/* 用例里反复用到的按钮点击助手 */
const HELPERS = `
function q(sel){return Array.prototype.slice.call(document.querySelectorAll(sel));}
function btn(t){var b=q('button').filter(function(x){return x.textContent.trim()===t});if(!b.length)throw new Error('找不到按钮：'+t);return b[0];}
function need(cond,msg){if(!cond)throw new Error(msg);}
function fire(el,type){el.dispatchEvent(new Event(type,{bubbles:true}));}
`;

const CASES = [
  {
    name: '规则页 · 时段编辑器全周清空/开启',
    page: 'rules',
    js: HELPERS + `
      btn('全周清空').click();
      var tip=document.querySelector('.wk-tip');
      need(/没有|0 小时/.test(tip.textContent),'清空后提示没更新：'+tip.textContent);
      var on=q('.wk-row .wk-cell.on').length;
      need(on===0,'清空后仍有 '+on+' 个格子亮着');
      btn('全周开启').click();
      need(q('.wk-row .wk-cell.on').length===336,'全周开启后格子数不对');
      return tip.textContent;`
  },
  {
    name: '规则页 · 复制某天对话框',
    page: 'rules',
    js: HELPERS + `
      btn('复制某天…').click();
      var ov=document.querySelector('.overlay');
      need(ov,'对话框没打开');
      need(ov.querySelector('.dialog-title').textContent.indexOf('复制')>=0,'标题不对');
      q('.overlay .dialog-f button').pop().click();
      need(!document.querySelector('.overlay'),'对话框没关闭');
      return 'ok';`
  },
  {
    name: '题库页 · 新增题目切换题型',
    page: 'bank',
    js: HELPERS + `
      btn('新增').click();
      var ov=document.querySelector('.overlay');
      need(ov,'编辑对话框没打开');
      var sel=ov.querySelector('select');
      sel.value='multiple'; fire(sel,'change');
      var boxes=q('.overlay input[type=checkbox]').length;
      need(boxes>=2,'多选没有复选框：'+boxes);
      btn('加一个选项').click();
      need(q('.overlay input[type=text]').length>=5,'加选项失败');
      btn('取消').click();
      need(!document.querySelector('.overlay'),'取消没关闭');
      return 'ok';`
  },
  {
    name: '题库页 · 搜索过滤',
    page: 'bank',
    js: HELPERS + `
      var before=q('.qcard').length;
      var s=document.querySelector('input[type=search]');
      s.value='apple'; fire(s,'input');
      return new Promise(function(res){
        setTimeout(function(){
          var after=q('.qcard').length;
          need(after>0&&after<before,'过滤没生效 '+before+'->'+after);
          res(before+'->'+after);
        },450);
      });`
  },
  {
    name: '题库页 · 全选与批量条',
    page: 'bank',
    js: HELPERS + `
      var cb=q('.qcard input[type=checkbox]')[0];
      cb.click(); fire(cb,'change');
      var bulk=document.querySelector('.bulkbar');
      need(bulk&&bulk.style.display!=='none','批量条没出现');
      need(/已选 1 题/.test(bulk.textContent),'批量条文案不对：'+bulk.textContent);
      return 'ok';`
  },
  {
    name: '批改页 · 快捷打分',
    page: 'grading',
    js: HELPERS + `
      btn('80 分').click();
      var sc=document.querySelector('.review-acts input[type=number]');
      need(sc&&sc.value==='80','打分没写入：'+(sc&&sc.value));
      return 'ok';`
  },
  {
    name: '设备页 · 集成令牌弹窗',
    page: 'device',
    js: HELPERS + `
      btn('生成新令牌').click();
      return new Promise(function(res,rej){
        var t=0,last='';
        var timer=setInterval(function(){
          var ov=document.querySelector('.overlay');
          var box=ov?ov.querySelector('input'):null;
          if(box&&/botv_/.test(box.value)){
            clearInterval(timer);
            q('.overlay .dialog-f button').pop().click();
            return res(box.value.slice(0,8));
          }
          last=ov?(box?'对话框在但没有令牌':'对话框里没有输入框'):'对话框没打开';
          if(++t>40){ clearInterval(timer); rej(new Error(last)); }
        },100);
      });`
  },
  {
    name: '日志页 · 搜索过滤',
    page: 'logs',
    js: HELPERS + `
      var s=document.querySelector('input[type=search]');
      s.value='Update'; fire(s,'input');
      s.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      return new Promise(function(res){
        setTimeout(function(){
          var t=document.querySelector('.log-box').textContent;
          need(/Update/.test(t)&&!/LanServer/.test(t),'过滤没生效');
          res('ok');
        },700);
      });`
  },
  {
    name: '移动端 · 时段编辑器单日操作',
    page: 'rules', width: 390,
    js: HELPERS + `
      btn('本日清空').click();
      var on=q('.wk-mob .wk-cell.on').length;
      need(on===0,'单日清空失败，仍有 '+on);
      btn('本日开启').click();
      need(q('.wk-mob .wk-cell.on').length===48,'单日开启格子数不对');
      return 'ok';`
  }
];

let pass = 0;
for (const c of CASES) {
  const r = await runCase(c);
  if (r.ok) { pass++; console.log('PASS  ' + c.name + (r.detail ? '  (' + r.detail + ')' : '')); }
  else console.log('FAIL  ' + c.name + '  → ' + r.detail);
}
console.log('\n' + pass + '/' + CASES.length + ' 通过');
process.exitCode = pass === CASES.length ? 0 : 1;
