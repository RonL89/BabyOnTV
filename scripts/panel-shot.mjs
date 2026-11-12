#!/usr/bin/env node
/* 用 Chrome DevTools Protocol 截图（仅开发用）
 *
 * 为什么不用 chrome --screenshot：Windows 上 Chrome 有最小窗口宽度（约 500px），
 * 传 --window-size=390 只会裁掉右侧，布局仍按 ~500px 计算，看不出真实的手机排版。
 * 这里用 Emulation.setDeviceMetricsOverride 强制 CSS 视口宽度。
 *
 * 用法：
 *   node scripts/panel-shot.mjs <url> <width> <height> <out.png> [--full]
 *
 * 例：
 *   node scripts/panel-shot.mjs "http://127.0.0.1:8123/admin/?autologin=1" 390 844 shot.png --full
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , url, wArg, hArg, outArg, ...rest] = process.argv;
if (!url || !outArg) {
  console.error('usage: node scripts/panel-shot.mjs <url> <width> <height> <out.png> [--full]');
  process.exit(2);
}
const WIDTH = Number(wArg) || 1280;
const HEIGHT = Number(hArg) || 900;
const FULL = rest.includes('--full');
const jsIdx = rest.indexOf('--js');
const JS = jsIdx >= 0 ? rest[jsIdx + 1] : '';
const OUT = path.resolve(outArg);

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-shot-'));

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForFile(file, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(file)) {
      try {
        const text = fs.readFileSync(file, 'utf8').trim();
        if (text) return text.split('\n')[0];
      } catch {
        // Chrome 可能正在写这个文件，下一轮再读
      }
    }
    await sleep(100);
  }
  throw new Error('Chrome 没有写出 DevToolsActivePort');
}

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--remote-debugging-port=0',
  '--user-data-dir=' + profile,
  'about:blank'
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
  const existing = events.find((e) => e.method === name);
  if (existing) {
    events.splice(events.indexOf(existing), 1);
    return Promise.resolve(existing.params);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = events.findIndex((e) => e.method === name);
      if (i >= 0) { const [e] = events.splice(i, 1); resolve(e.params); }
      else reject(new Error('等待事件超时: ' + name));
    }, timeoutMs || 15000);
    events.push({ method: name, __resolve: resolve, __timer: timer });
  });
}

try {
  const port = await waitForFile(path.join(profile, 'DevToolsActivePort'), 15000);
  const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const target = list.find((t) => t.type === 'page');
  if (!target) throw new Error('找不到页面 target');

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
      const idx = events.findIndex((e) => e.method === msg.method && e.__resolve);
      if (idx >= 0) {
        const [e] = events.splice(idx, 1);
        clearTimeout(e.__timer);
        e.__resolve(msg.params);
      } else {
        events.push({ method: msg.method, params: msg.params });
      }
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__errs=[];window.addEventListener("error",function(e){window.__errs.push(String(e.message||e))});window.addEventListener("unhandledrejection",function(e){var r=e.reason;window.__errs.push("rejection: "+String(r&&r.message||r))});'
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: WIDTH < 760
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: WIDTH < 760 });

  const loaded = waitEvent('Page.loadEventFired', 20000);
  await send('Page.navigate', { url });
  await loaded;
  await sleep(1200); // 等接口返回与渲染

  if (JS) {
    const out = await send('Runtime.evaluate', { expression: JS, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) {
      console.error('JS 断言失败: ' + (out.exceptionDetails.exception?.description || out.exceptionDetails.text));
      process.exitCode = 1;
    }
    await sleep(600);
  }

  const metrics = await send('Page.getLayoutMetrics');
  const css = metrics.cssContentSize || metrics.contentSize;

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: FULL,
    ...(FULL ? { clip: { x: 0, y: 0, width: WIDTH, height: Math.ceil(css.height), scale: 1 } } : {})
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  const overflow = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: 'JSON.stringify({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,title:document.title,errs:window.__errs||[]})'
  });
  console.log(OUT + ' :: ' + overflow.result.value + ' :: ' + Math.ceil(css.height) + 'px tall');
} catch (err) {
  console.error('截图失败:', err.message);
  process.exitCode = 1;
} finally {
  try { if (ws) ws.close(); } catch {}
  chrome.kill();
  await sleep(120);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
