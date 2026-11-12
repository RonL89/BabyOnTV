#!/usr/bin/env node
/* 家长面板本地预览服务器（仅开发用，不参与打包）
 *
 * 用法：
 *   node scripts/panel-preview.mjs --port 8123
 *   http://127.0.0.1:8123/admin/?autologin=1&page=rules
 *
 * 参数：
 *   --port <n>     监听端口，默认 8123
 *   --host <ip>    监听地址，默认 127.0.0.1
 *
 * 查询参数（仅对 /admin/ 页面生效）：
 *   autologin=1    注入一个预览令牌，跳过登录页
 *   page=<id>      打开指定页面（overview/rules/bank/grading/records/device/logs）
 *   fail=1         所有 /api/* 返回 500，用于检查错误态
 *   empty=1        列表类接口返回空数组，用于检查空态
 *
 * 不依赖任何 npm 包；只读取 admin/ 目录下的真实文件。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = path.join(ROOT, 'admin');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg('port', '8123'));
const HOST = arg('host', '127.0.0.1');

/* ---------------- mock 数据 ---------------- */

const CONFIG = {
  dailyMinutes: 40,
  dailyFreeMinutes: 10,
  sessionMinutes: 10,
  questionsPerRound: 5,
  roundsPerDay: 3,
  passRatio: 0.6,
  allDay: false,
  playMode: 'round',
  extraEnabled: true,
  wrongThreshold: 3,
  extraQuestions: 2,
  difficultyRewardEnabled: true,
  difficultyRewards: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
  autoNextSeconds: 3,
  scheduleMode: 'allow',
  holidayMode: 'sunday',
  theme: 'dark',
  weekSlots: [
    '000000000000000000000000000000000000000000000000'.slice(0, 34) + '11111111111111',
    '000000000000000000000000000000000000000000000000'.slice(0, 34) + '11111111111111',
    '000000000000000000000000000000000000000000000000'.slice(0, 34) + '11111111111111',
    '000000000000000000000000000000000000000000000000'.slice(0, 34) + '11111111111111',
    '000000000000000000000000000000000000000000000000'.slice(0, 34) + '11111111111111',
    '000000000000000000001111111111111111111111111111',
    '000000000000000000001111111111111111111111111111'
  ]
};

const QUESTIONS = [
  { id: 'q001', q: '「日」字有几笔？', a: ['1 笔', '2 笔', '3 笔', '4 笔'], k: 3, difficulty: 1, subject: '识字', type: 'single', enabled: true, tip: '日字四笔，注意笔顺。' },
  { id: 'q002', q: '下面哪些字是左右结构？', a: ['明', '林', '国', '休'], correctIndices: [0, 1, 3], difficulty: 2, subject: '识字', type: 'multiple', enabled: true, tip: '' },
  { id: 'q003', q: '「春眠不觉晓」的下一句是「处处闻啼鸟」。', a: ['正确', '错误'], k: 0, difficulty: 1, subject: '古诗', type: 'boolean', enabled: true, tip: '' },
  { id: 'q004', q: '3 + 4 = ？', a: ['7'], answers: ['7', '七'], difficulty: 1, subject: '数学', type: 'text', enabled: true, tip: '' },
  { id: 'q005', q: '用「因为……所以……」说一句话。', modelAnswer: '因为今天下雨，所以出门要带伞。', rubric: '句子完整、因果关系正确即可', difficulty: 3, subject: '表达', type: 'subjective', enabled: false, tip: '' },
  { id: 'q006', q: '「apple」的中文是什么？', a: ['苹果', '香蕉', '橘子', '葡萄'], k: 0, difficulty: 2, subject: '英语', type: 'single', enabled: true, tip: '' },
  { id: 'q007', q: '一个星期有几天？', a: ['5 天', '6 天', '7 天'], k: 2, difficulty: 1, subject: '常识', type: 'single', enabled: true, tip: '' },
  { id: 'q008', q: '「床前明月光」的作者是谁？', a: ['杜甫', '李白', '白居易'], k: 1, difficulty: 2, subject: '古诗', type: 'single', enabled: true, tip: '' },
  { id: 'q009', q: '把下面的数字从大到小排序：3、9、1', answers: ['9,3,1', '9、3、1'], difficulty: 2, subject: '数学', type: 'text', enabled: true, tip: '' },
  { id: 'q010', q: '「休」字由哪两部分组成？', a: ['人和木', '日和月', '口和天', '山和石'], k: 0, difficulty: 2, subject: '识字', type: 'single', enabled: true, tip: '' }
];

const DRAWING = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="240" viewBox="0 0 420 240">' +
  '<rect width="420" height="240" fill="#fffdf9"/>' +
  '<g stroke="#2b2320" stroke-width="4" stroke-linecap="round" fill="none">' +
  '<path d="M40 70 L 60 46 L 80 70 L100 46 L120 70"/>' +
  '<path d="M40 120 Q 80 180 130 120"/>' +
  '<path d="M170 60 L 360 60"/><path d="M170 96 L 330 96"/><path d="M170 132 L 350 132"/>' +
  '<path d="M170 168 Q 250 210 380 168"/>' +
  '</g></svg>'
);

const REVIEWS = [
  { id: 'r1', state: 'pending', ts: Date.now() - 8 * 60000, question: { q: '用「因为……所以……」说一句话。', subject: '表达', type: 'subjective' }, input: { text: '因为下雨，所以我带伞。', drawing: '' }, source: 'ai', score: null, feedback: '' },
  { id: 'r2', state: 'pending', ts: Date.now() - 42 * 60000, question: { q: '抄写下面的词语：春天、花朵、小鸟', subject: '书写', type: 'subjective' }, input: { text: '看我的手写', drawing: DRAWING }, source: 'ai', score: null, feedback: '' },
  { id: 'r3', state: 'graded', ts: Date.now() - 26 * 3600000, question: { q: '3 + 4 = ？', subject: '数学', type: 'text' }, input: { text: '7', drawing: '' }, source: 'parent', score: 100, feedback: '很棒！' },
  { id: 'r4', state: 'graded', ts: Date.now() - 50 * 3600000, question: { q: '写一句描写秋天的句子', subject: '表达', type: 'subjective' }, input: { text: '秋天到了，树叶变黄了。', drawing: '' }, source: 'ai', score: 80, feedback: '完整，可以再加一个比喻。' }
];

const EVENTS = [
  { ts: Date.now() - 3 * 60000, type: 'answer', payload: { qid: 'q006', correct: true } },
  { ts: Date.now() - 6 * 60000, type: 'answer', payload: { qid: 'q002', correct: false } },
  { ts: Date.now() - 9 * 60000, type: 'quiz', payload: { total: 5, correct: 4 } },
  { ts: Date.now() - 22 * 60000, type: 'review_submitted', payload: { rid: 'r1' } },
  { ts: Date.now() - 40 * 60000, type: 'usage', payload: { milliseconds: 1800000 } },
  { ts: Date.now() - 75 * 60000, type: 'remote', payload: { action: 'unlock', minutes: 30, source: 'panel' } },
  { ts: Date.now() - 100 * 60000, type: 'quiz_pass', payload: { minutes: 5 } },
  { ts: Date.now() - 130 * 60000, type: 'extra_added', payload: { count: 2 } },
  { ts: Date.now() - 26 * 3600000, type: 'review_graded', payload: { rid: 'r3', score: 100, source: 'parent' } },
  { ts: Date.now() - 50 * 3600000, type: 'review_graded', payload: { rid: 'r4', score: 80, source: 'ai' } }
];

const LOGS = [
  '11-12 11:36:02.118 I/LanServer http: 家长面板已连接 192.168.1.23',
  '11-12 11:36:02.224 I/AdminApi auth: 登录成功 remember=true',
  '11-12 11:36:03.001 I/Engine  tick: remaining=620s reason= timeup=0',
  '11-12 11:37:11.540 W/Quiz    第 5 题答错，连续答错 2 次',
  '11-12 11:37:12.002 I/Engine  加练池 +1，当前 2 题',
  '11-12 11:38:40.771 I/Usage   前台使用 30 分钟，已记录',
  '11-12 11:39:01.220 E/Update  检查更新失败：连接超时 source=github',
  '11-12 11:39:01.221 W/Update  切换镜像 source=ghproxy',
  '11-12 11:39:02.010 I/Update  镜像可用，最新版本 1.0.8',
  '11-12 11:40:15.309 I/AdminApi config: 保存 dailyMinutes=45',
  '11-12 11:41:00.000 I/Monitor 无障碍服务正常，悬浮窗已显示',
  '11-12 11:42:30.512 I/Audio   播放 a003.mp3，时长 8.2s'
];

function history(days) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const label = (d.getMonth() + 1) + '/' + d.getDate();
    const base = [32, 28, 45, 12, 40, 26, 38, 30, 44, 18, 36, 0, 22, 34][i % 14];
    out.push({
      label,
      usedMinutes: base,
      watch: base,
      answered: base ? base + 8 : 0,
      correct: base ? Math.round((base + 8) * 0.78) : 0,
      rounds: base ? Math.max(1, Math.round(base / 12)) : 0,
      accuracy: base ? 0.78 : 0
    });
  }
  return out;
}

function state(withAuth) {
  return {
    config: CONFIG,
    today: { usedMinutes: 26, watch: 26, answered: 18, correct: 15, rounds: 2, accuracy: 0.83 },
    questions: QUESTIONS.length,
    roundsDoneToday: 2,
    repetition: { studied: 12, due: 3 },
    learning: {
      remainingSeconds: 840,
      usedMinutes: 26,
      extraPool: 2,
      wrongProgress: 2,
      nextAvailableAt: 0,
      free: false,
      freeQuotaSeconds: 600,
      roundsDoneToday: 2,
      reason: '',
      override: null,
      awaitingReview: 2
    }
  };
}

const GRADING = {
  mode: 'ai',
  provider: 'deepseek',
  endpoint: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  vision: false,
  passScore: 60,
  hasKey: true,
  providers: [
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', visionModel: '', note: '性价比高', keyUrl: 'https://platform.deepseek.com' },
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', visionModel: 'gpt-4o', note: '支持图像', keyUrl: 'https://platform.openai.com' },
    { id: 'custom', name: '自定义', baseUrl: '', model: '', visionModel: '', note: 'OpenAI 兼容', keyUrl: '' }
  ]
};

const DEVICE = {
  name: '客厅电视',
  version: '1.0.8',
  flavor: 'tv',
  ip: '192.168.1.42',
  port: 8099,
  uninstallProtected: true,
  autostart: { ok: true },
  monitor: {
    service: true, overlay: true, usage: true,
    accessibility: true, accessibilityEnabled: true,
    gate: true, lastTickSeconds: 3, lastError: ''
  }
};

const INTEGRATION = { enabled: true, read: true, control: true, hasToken: true, hint: 'botv_••••••8f2a', createdAt: Date.now() - 6 * 86400000 };

const UPDATE = {
  current: '1.0.8',
  latest: '1.0.9',
  hasUpdate: true,
  notes: '修复面板在部分手机上无法滚动的问题',
  source: 'github',
  checkedAt: Date.now() - 3200000,
  checking: false,
  api: '',
  mirrors: ['https://ghproxy.net/https://github.com/RonL89/BabyOnTV/releases/latest/download/update.json'],
  defaultMirrors: ['https://ghproxy.net/'],
  lastDownloadSource: 'mirror',
  log: [
    { source: 'github', ok: false, ms: 8000, message: 'timeout' },
    { source: 'ghproxy', ok: true, ms: 420, message: 'ok' }
  ]
};

const HOLIDAYS = {
  year: 2026,
  count: 11,
  fetchedAt: Date.now() - 12 * 86400000,
  source: '内置',
  dates: ['2026-01-01', '2026-02-17', '2026-04-05', '2026-05-01', '2026-06-19', '2026-09-25', '2026-10-01']
};

let configState = JSON.parse(JSON.stringify(CONFIG));
let questionsState = QUESTIONS.slice();

/* ---------------- HTTP ---------------- */

function json(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); }
    });
  });
}

async function api(req, res, url) {
  const flags = global.__flags;
  if (flags.fail) return json(res, 500, { error: 'request_failed', message: '预览模式：模拟服务端错误' });
  const keepAlive = url.pathname === '/api/state' || url.pathname === '/api/hello';
  if (flags.failPage && !keepAlive) return json(res, 500, { error: 'request_failed', message: '预览模式：模拟服务端错误' });

  const p = url.pathname;
  const m = req.method;
  const body = (m === 'POST' || m === 'PUT') ? await readBody(req) : {};

  if (p === '/api/hello') return json(res, 200, { app: 'BabyOnTV', version: '1.0.8', name: DEVICE.name, ip: '192.168.1.42', port: 8099, questions: questionsState.length, needsToken: true, passwordRequired: true });
  if (p === '/api/auth') {
    if (!body.passphrase) return json(res, 401, { error: 'request_failed', message: '密码错误' });
    return json(res, 200, { token: 'preview-token', expiresIn: 2592000 });
  }
  if (p === '/api/state') return json(res, 200, state(true));
  if (p === '/api/config' && m === 'PUT') {
    configState = Object.assign({}, configState, body);
    return json(res, 200, { config: configState });
  }
  if (p === '/api/remote') {
    const learning = state(true).learning;
    if (body.action === 'unlock') learning.override = { mode: 'unlock', minutes: body.minutes, remainingSeconds: body.minutes * 60 };
    if (body.action === 'lock') learning.override = { mode: 'lock', minutes: 0, remainingSeconds: 0 };
    if (body.action === 'cancel') learning.override = null;
    if (body.action === 'indefinite') learning.override = { mode: 'indefinite', minutes: 0, remainingSeconds: -1 };
    return json(res, 200, { learning });
  }

  if (p === '/api/questions' && m === 'GET') {
    return json(res, 200, { items: flags.empty ? [] : questionsState });
  }
  if (p === '/api/questions' && m === 'POST') {
    if (body.items) return json(res, 200, { ok: true, added: body.items.length });
    const id = 'q' + String(questionsState.length + 1).padStart(3, '0');
    questionsState.push(Object.assign({ enabled: true, tip: '' }, body, { id }));
    return json(res, 200, { ok: true, id });
  }
  if (p === '/api/questions/pause') {
    questionsState.forEach((q) => { if (body.ids.indexOf(q.id) >= 0) q.enabled = !!body.enabled; });
    return json(res, 200, { ok: true, updated: body.ids.length });
  }
  if (p === '/api/questions/delete') {
    questionsState = questionsState.filter((q) => body.ids.indexOf(q.id) < 0);
    return json(res, 200, { ok: true, deleted: body.ids.length });
  }
  if (p.startsWith('/api/questions/') && m === 'DELETE') {
    const id = decodeURIComponent(p.slice('/api/questions/'.length));
    questionsState = questionsState.filter((q) => q.id !== id);
    return json(res, 200, { ok: true });
  }

  if (p === '/api/history') return json(res, 200, { items: history(Number(url.searchParams.get('days') || 7)) });
  if (p === '/api/events') return json(res, 200, { items: flags.empty ? [] : EVENTS });

  if (p === '/api/grading' && m === 'GET') return json(res, 200, GRADING);
  if (p === '/api/grading' && m === 'PUT') return json(res, 200, Object.assign({}, GRADING, body));
  if (p === '/api/grading/test') return json(res, 200, { ok: true, ms: 612, message: '连接正常' });
  if (p === '/api/grading/models') return json(res, 200, { ok: true, items: ['deepseek-chat', 'deepseek-reasoner', 'gpt-4o-mini'], message: '' });

  if (p === '/api/reviews') {
    const s = url.searchParams.get('state');
    const items = s === 'pending' ? REVIEWS.filter((r) => r.state === 'pending') : REVIEWS;
    return json(res, 200, { items: flags.empty ? [] : items });
  }
  if (p.startsWith('/api/reviews/') && m === 'POST') {
    const rest = p.slice('/api/reviews/'.length);
    if (rest.endsWith('/retry')) return json(res, 200, { ok: true });
    const id = rest;
    const rv = REVIEWS.find((r) => r.id === id);
    if (rv) { rv.state = 'graded'; rv.score = body.score; rv.feedback = body.feedback; rv.source = 'parent'; }
    return json(res, 200, { ok: true });
  }

  if (p === '/api/device' && m === 'GET') return json(res, 200, DEVICE);
  if (p === '/api/device' && m === 'PUT') { DEVICE.name = body.name; return json(res, 200, { ok: true }); }
  if (p === '/api/device/uninstall-guard') { DEVICE.uninstallProtected = false; return json(res, 200, { ok: true }); }
  if (p === '/api/password') return json(res, 200, { ok: true });

  if (p === '/api/integration' && m === 'GET') return json(res, 200, INTEGRATION);
  if (p === '/api/integration' && m === 'POST') return json(res, 200, { token: 'botv_9f4c1e7d2b8a4c6e0f3a5b7d', integration: INTEGRATION });
  if (p === '/api/integration' && m === 'PUT') { Object.assign(INTEGRATION, body); return json(res, 200, { ok: true }); }
  if (p === '/api/integration' && m === 'DELETE') { INTEGRATION.hasToken = false; return json(res, 200, { ok: true }); }

  if (p === '/api/update' && m === 'GET') return json(res, 200, UPDATE);
  if (p === '/api/update' && m === 'PUT') { UPDATE.api = body.api; return json(res, 200, { ok: true }); }
  if (p === '/api/update/check') { UPDATE.checking = true; return json(res, 200, { ok: true }); }

  if (p === '/api/holidays') return json(res, 200, HOLIDAYS);
  if (p === '/api/holidays/sync') return json(res, 200, { ok: true, count: HOLIDAYS.count });

  if (p === '/api/logs' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const lines = flags.empty ? [] : LOGS.filter((l) => !q || l.toLowerCase().includes(q));
    return json(res, 200, { lines });
  }
  if (p === '/api/logs' && m === 'DELETE') return json(res, 200, { ok: true });
  if (p === '/api/logs/export') return json(res, 501, { error: 'request_failed', message: '预览模式不提供导出' });
  if (p === '/api/logout') return json(res, 200, { ok: true });

  return json(res, 404, { error: 'not_found', message: '预览服务器没有实现 ' + m + ' ' + p });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || HOST));

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    try { await api(req, res, url); }
    catch (e) { json(res, 500, { error: 'request_failed', message: String(e && e.message) }); }
    return;
  }

  if (url.pathname === '/' || url.pathname === '/admin') {
    res.writeHead(302, { Location: '/admin/' + url.search });
    return res.end();
  }

  if (url.pathname === '/admin/' || url.pathname === '/admin/index.html') {
    global.__flags = {
      fail: url.searchParams.get('fail') === '1',
      failPage: url.searchParams.get('failpage') === '1',
      empty: url.searchParams.get('empty') === '1'
    };
    let html = fs.readFileSync(path.join(ADMIN, 'index.html'), 'utf8');
    const autologin = url.searchParams.get('autologin') === '1';
    const page = url.searchParams.get('page');
    if (autologin) {
      const boot = ['<script>'];
      boot.push("try{localStorage.setItem('botv-panel-token','preview-token')}catch(e){}");
      if (page) boot.push("location.hash='#/" + page + "';");
      boot.push('</script>');
      html = html.replace('</head>', boot.join('') + '</head>');
    }
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    return res.end(html);
  }

  if (url.pathname.startsWith('/admin/')) {
    const rel = decodeURIComponent(url.pathname.slice('/admin/'.length));
    const file = path.resolve(ADMIN, rel);
    if (!file.startsWith(ADMIN + path.sep) && file !== ADMIN) { res.writeHead(403); return res.end('forbidden'); }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return fs.createReadStream(file).pipe(res);
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found: ' + url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log('panel preview → http://' + HOST + ':' + PORT + '/admin/');
  console.log('  登录页      http://' + HOST + ':' + PORT + '/admin/');
  console.log('  已登录概览  http://' + HOST + ':' + PORT + '/admin/?autologin=1');
  console.log('  指定页面    http://' + HOST + ':' + PORT + '/admin/?autologin=1&page=rules');
  console.log('  错误态      http://' + HOST + ':' + PORT + '/admin/?autologin=1&fail=1');
  console.log('  空态        http://' + HOST + ':' + PORT + '/admin/?autologin=1&page=bank&empty=1');
});
