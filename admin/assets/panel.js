/* 宝宝请听题 · 家长管理面板（零依赖、手写、单文件）
 * 页面：概览 / 规则 / 题库 / 批改 / 记录 / 设备 / 日志
 * 数据：同源访问电视端 LAN 服务 http://<设备IP>:<端口>/api/*
 * 代码风格沿用 ES5 语法（var / function），只用 Promise 链，兼容旧手机浏览器。
 */
(function () {
  'use strict';

  /* ==================== 常量 ==================== */

  var PAGES = [
    { id: 'overview', name: '概览' },
    { id: 'rules', name: '规则' },
    { id: 'bank', name: '题库' },
    { id: 'grading', name: '批改' },
    { id: 'records', name: '记录' },
    { id: 'device', name: '设备' },
    { id: 'logs', name: '日志' },
    { id: 'about', name: '关于/版本' }
  ];

  var DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  var REASONS = {
    locked: '家长已暂停使用',
    schedule: '不在可用时段',
    quota: '今日时长已用完',
    rounds: '今日任务已完成',
    timeup: '时间已用完',
    '': ''
  };

  var EVENT_TEXT = {
    answer: '答题',
    quiz: '完成一组',
    quiz_pass: '闯关通过',
    usage: '使用时长',
    remote: '家长遥控',
    review_submitted: '提交待批',
    review_graded: '批改完成',
    review_skipped: '跳过批改',
    extra_added: '加入加练',
    question_added: '新增题目',
    study: '学习'
  };

  var TYPE_TEXT = {
    single: '单选', multiple: '多选', boolean: '判断', text: '填空', subjective: '主观'
  };

  /* ==================== 运行时状态 ==================== */

  var app = {
    token: '',
    page: 'overview',
    config: null,
    device: null,
    questions: [],
    gradingTab: 'pending',
    logQuery: '',
    logTimer: null,
    bank: { page: 0, size: 30, search: '', subject: '', selected: {} },
    // 遥控导航状态
    nav: { focusable: [], index: -1 }
  };

  var TOKEN_KEY = 'botv-panel-token';

  /* ==================== 基础工具 ==================== */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'value') node.value = v;
      else if (k === 'checked') node.checked = !!v;
      else if (k === 'disabled') node.disabled = !!v;
      else if (k === 'selected') node.selected = !!v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    appendAll(node, children);
    return node;
  }

  function appendAll(node, children) {
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return node;
  }

  function txt(value) { return document.createTextNode(value == null ? '' : String(value)); }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function fmtLeft(sec) {
    if (sec === null || sec === undefined || sec < 0) return '不限时';
    var m = Math.round(sec / 60);
    if (m >= 60) return Math.floor(m / 60) + ' 小时' + (m % 60 ? ' ' + (m % 60) + ' 分' : '');
    return m + ' 分钟';
  }

  function num(v) { return (v === null || v === undefined || v === '') ? 0 : Number(v); }

  function debounce(fn, ms) {
    var timer;
    return function () {
      var self = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function closestEl(node, cls) {
    while (node && node.nodeType === 1) {
      if (node.classList && node.classList.contains(cls)) return node;
      node = node.parentNode;
    }
    return null;
  }

  /* ==================== 遥控导航引擎（电视端） ==================== */

  // 可聚焦元素选择器：所有带 .focusable 类、按钮、输入框、选择框、链接、开关行
  var FOCUSABLE_SELECTOR = '.focusable, button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), a[href]';

  // 扫描当前页面的可聚焦元素，按视觉顺序排序（上→下，左→右）
  function scanFocusable() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(FOCUSABLE_SELECTOR));
    // 过滤掉不可见、在对话框外层等
    nodes = nodes.filter(function (n) {
      var r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden' && getComputedStyle(n).display !== 'none';
    });
    // 按视觉位置排序：先 top，再 left
    nodes.sort(function (a, b) {
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > 8) return ra.top - rb.top;
      return ra.left - rb.left;
    });
    app.nav.focusable = nodes;
    app.nav.index = -1;
    return nodes;
  }

  // 设置焦点到指定索引
  function setFocusIndex(idx, opts) {
    opts = opts || {};
    var nodes = app.nav.focusable;
    if (!nodes.length) return false;
    if (idx < 0) idx = 0;
    if (idx >= nodes.length) idx = nodes.length - 1;
    var el = nodes[idx];
    if (!el) return false;
    app.nav.index = idx;
    try { el.focus({ preventScroll: opts.preventScroll !== false }); } catch (e) { el.focus(); }
    // 可视区居中（避免被导航栏遮挡）
    if (!opts.preventScroll) {
      var r = el.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (r.top < 60 || r.bottom > vh - 60) {
        el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      }
    }
    return true;
  }

  // 向四个方向移动焦点
  function moveFocus(dir) {
    var nodes = app.nav.focusable;
    var cur = app.nav.index >= 0 ? nodes[app.nav.index] : null;
    // 页面是异步渲染的：缓存的节点可能已经不在 DOM 里，重扫一次并尽量保住当前焦点
    if (!nodes.length || (cur && !document.body.contains(cur))) {
      var active = document.activeElement;
      scanFocusable();
      nodes = app.nav.focusable;
      var keep = nodes.indexOf(active);
      if (keep >= 0) app.nav.index = keep;
      cur = app.nav.index >= 0 ? nodes[app.nav.index] : null;
    }
    if (!nodes.length) return false;
    var curRect = cur ? cur.getBoundingClientRect() : null;

    var best = -1, bestDist = Infinity;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var vw = window.innerWidth || document.documentElement.clientWidth;

    nodes.forEach(function (el, i) {
      if (el === cur) return;
      var r = el.getBoundingClientRect();
      var dx = 0, dy = 0;
      if (dir === 'up') { dy = curRect ? curRect.top - r.bottom : -r.top; }
      else if (dir === 'down') { dy = curRect ? r.top - curRect.bottom : r.top; }
      else if (dir === 'left') { dx = curRect ? curRect.left - r.right : -r.left; }
      else if (dir === 'right') { dx = curRect ? r.left - curRect.right : r.left; }

      // 必须在正确方向
      if (dir === 'up' && dy <= 8) return;
      if (dir === 'down' && dy <= 8) return;
      if (dir === 'left' && dx <= 8) return;
      if (dir === 'right' && dx <= 8) return;

      // 正交方向对齐容差（中心点在对方 40% 范围内）
      var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      var ccx = curRect ? (curRect.left + curRect.right) / 2 : vw / 2;
      var ccy = curRect ? (curRect.top + curRect.bottom) / 2 : vh / 2;
      var ortho = dir === 'up' || dir === 'down' ? Math.abs(cx - ccx) : Math.abs(cy - ccy);
      var size = dir === 'up' || dir === 'down' ? Math.max(r.width, curRect ? curRect.width : 1) : Math.max(r.height, curRect ? curRect.height : 1);
      if (ortho > size * 0.6) return;

      // 距离：主方向距离 + 正交惩罚
      var dist = (dir === 'up' || dir === 'down' ? dy : dx) + ortho * 0.3;
      if (dist < bestDist) { bestDist = dist; best = i; }
    });

    if (best >= 0) return setFocusIndex(best);
    // 边界兜底：上/左 → 最后一个，下/右 → 第一个
    if (dir === 'up' || dir === 'left') return setFocusIndex(nodes.length - 1);
    if (dir === 'down' || dir === 'right') return setFocusIndex(0);
    return false;
  }

  // 初始化页面焦点（优先首个 .focusable.primary，否则首个）
  function initPageFocus() {
    scanFocusable();
    var primary = document.querySelector('.focusable.primary');
    if (primary) {
      var idx = app.nav.focusable.indexOf(primary);
      if (idx >= 0) return setFocusIndex(idx);
    }
    return setFocusIndex(0);
  }

  // 全局键盘/遥控器事件处理
  function onGlobalKey(e) {
    var tag = (e.target && e.target.tagName) || '';
    var isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
    // 输入框内：方向键让光标移动，Enter/空格走浏览器原生提交，都不拦截
    if (isInput) return;

    var handled = false;
    switch (e.key) {
      case 'ArrowUp': handled = moveFocus('up'); break;
      case 'ArrowDown': handled = moveFocus('down'); break;
      case 'ArrowLeft': handled = moveFocus('left'); break;
      case 'ArrowRight': handled = moveFocus('right'); break;
      case 'Enter':
      case ' ': // 空格也作为确认
        if (document.activeElement && typeof document.activeElement.click === 'function') {
          document.activeElement.click();
          handled = true;
        }
        break;
      case 'Escape':
        // 关闭最上层对话框（mountDialog 自己的 Escape 是幂等的，双保险）
        var overlay = document.querySelector('.overlay');
        if (overlay) { overlay.click(); handled = true; }
        break;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  // 注册全局键盘监听（启动时一次性注册）
  document.addEventListener('keydown', onGlobalKey);

  // 页面切换时重新扫描并初始化焦点
  var originalRenderPage = renderPage;
  renderPage = function () {
    originalRenderPage.apply(this, arguments);
    // 延迟到下一帧，确保 DOM 已挂载
    setTimeout(function () { initPageFocus(); }, 0);
  };

  function copyText(value) {
    var ta = el('textarea', { style: 'position:fixed;left:-9999px;top:0' });
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) { toast('已复制', 'ok'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { toast('已复制', 'ok'); }, function () {
        toast('复制失败，请手动选择文字', 'bad');
      });
    } else {
      toast('复制失败，请手动选择文字', 'bad');
    }
  }

  /* ==================== 网络层 ==================== */

  function base() { return location.origin; }

  function apiError(status, message) {
    var err = new Error(message);
    err.status = status;
    return err;
  }

  function request(method, path, body, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (app.token) headers['X-Admin-Token'] = app.token;
    return fetch(base() + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (res) {
      var ct = (res.headers && res.headers.get('content-type')) || '';
      if (ct.indexOf('json') < 0) {
        return res.text().then(function () { throw apiError(res.status, '设备返回了非预期内容'); });
      }
      return res.json().then(function (data) {
        if (res.status === 401) {
          if (!opts.noAuthRedirect) { clearToken(); renderLogin('登录已过期，请重新输入管理密码'); }
          throw apiError(401, '登录已过期，请重新输入管理密码');
        }
        if (!res.ok || (data && data.error)) {
          throw apiError(res.status, (data && data.message) || '请求失败（' + res.status + '）');
        }
        return data;
      });
    }, function () {
      throw apiError(0, '连接设备失败，请确认手机与电视在同一网络');
    });
  }

  function get(path) { return request('GET', path); }
  function put(path, body) { return request('PUT', path, body); }
  function post(path, body) { return request('POST', path, body === undefined ? {} : body); }
  function del(path) { return request('DELETE', path); }

  function saveConfig(patch) {
    return put('/api/config', patch).then(function (data) {
      app.config = data.config;
      return data.config;
    });
  }

  /* ==================== 令牌 ==================== */

  function storedToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(value) {
    app.token = value;
    try { localStorage.setItem(TOKEN_KEY, value); } catch (e) {}
  }
  function clearToken() {
    app.token = '';
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function logout() {
    var p = app.token ? post('/api/logout', {}).then(function () {}, function () {}) : Promise.resolve();
    p.then(function () { clearToken(); renderLogin(''); });
  }

  /* ==================== 提示 / 骨架 / 对话框 ==================== */

  function toast(message, kind) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var node = el('div', { class: 'toast ' + (kind || '') }, [message]);
    host.appendChild(node);
    setTimeout(function () {
      node.className = 'toast out ' + (kind || '');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
    }, 2500);
  }

  function skeleton() {
    return el('div', { class: 'skeleton', 'aria-hidden': 'true' }, [
      el('div', { class: 'sk-card' }),
      el('div', { class: 'sk-card' }),
      el('div', { class: 'sk-card' })
    ]);
  }

  function errorCard(err, retry) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-b' }, [
        el('div', { class: 'empty' }, [
          el('div', { class: 'empty-icon' }, ['!']),
          el('div', { class: 'empty-text' }, [(err && err.message) || '加载失败']),
          el('div', { class: 'empty-sub' }, ['请确认手机与电视在同一 Wi-Fi，且电视端应用正在运行。']),
          el('div', { class: 'row', style: 'margin-top:6px' }, [
            el('button', { class: 'btn primary sm', type: 'button', onclick: retry }, ['重试'])
          ])
        ])
      ])
    ]);
  }

  function emptyState(icon, text, sub) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty-icon' }, [icon]),
      el('div', { class: 'empty-text' }, [text]),
      sub ? el('div', { class: 'empty-sub' }, [sub]) : null
    ]);
  }

  function mountDialog(title, bodyNodes, actions, opts) {
    opts = opts || {};
    var last = document.activeElement;
    var overlay = el('div', { class: 'overlay' });
    var box = el('div', { class: 'dialog' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' });
    if (title) box.appendChild(el('div', { class: 'dialog-h' }, [el('div', { class: 'dialog-title' }, [title])]));
    var body = el('div', { class: 'dialog-b' });
    appendAll(body, bodyNodes);
    box.appendChild(body);
    var foot = el('div', { class: 'dialog-f' });
    var closed = false;

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (opts.onClose) opts.onClose();
      if (last && last.focus) { try { last.focus(); } catch (e) {} }
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

    (actions || []).forEach(function (a) {
      foot.appendChild(el('button', {
        type: 'button',
        class: 'btn ' + (a.kind || '') + ' focusable',
        onclick: function () { a.onClick(close); }
      }, [a.label]));
    });
    box.appendChild(foot);
    overlay.appendChild(box);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);
    setTimeout(function () {
      var f = box.querySelector('input, textarea, select, .btn.primary') || box.querySelector('.btn');
      if (f) { try { f.focus(); } catch (e) {} }
    }, 20);
    return { close: close, box: box, body: body, foot: foot };
  }

  function confirmDialog(title, message, okText, danger) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(v) { if (!settled) { settled = true; resolve(v); } }
      mountDialog(title, [el('p', {}, [message])], [
        { label: '取消', kind: 'ghost', onClick: function (close) { finish(false); close(); } },
        { label: okText || '确定', kind: danger ? 'danger' : 'primary', onClick: function (close) { finish(true); close(); } }
      ], { onClose: function () { finish(false); } });
    });
  }

  /* ==================== 通用组件 ==================== */

  function pageHead(title, sub) {
    return el('div', { class: 'page-head' }, [
      el('h1', { class: 'page-title' }, [title]),
      sub ? el('p', { class: 'page-sub' }, [sub]) : null
    ]);
  }

  function pageShell(root, title, sub) {
    root.innerHTML = '';
    root.appendChild(pageHead(title, sub));
    var body = el('div');
    root.appendChild(body);
    return body;
  }

  function load(host, task, build) {
    host.innerHTML = '';
    host.appendChild(skeleton());
    function fail(err) {
      host.innerHTML = '';
      host.appendChild(errorCard(err, function () { renderPage(); }));
    }
    Promise.resolve().then(task).then(function (data) {
      host.innerHTML = '';
      try { build(data); } catch (e) {
        if (window.console) console.error(e);
        fail(e);
      }
      // 异步渲染完成：遥控器焦点列表要重新扫描
      setTimeout(function () { if (typeof initPageFocus === 'function') initPageFocus(); }, 0);
    }, fail);
  }

  function card(title, sub) {
    var node = el('div', { class: 'card' });
    node.appendChild(el('div', { class: 'card-h' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'card-title' }, [title]),
        sub ? el('div', { class: 'card-sub' }, [sub]) : null
      ])
    ]));
    return node;
  }

  function trackDirty(cardNode) {
    function mark() { cardNode.classList.add('dirty'); }
    cardNode.addEventListener('input', mark);
    cardNode.addEventListener('change', mark);
    return function clean() { cardNode.classList.remove('dirty'); };
  }

  function field(label, control, hint) {
    return el('label', { class: 'field' }, [
      el('span', { class: 'field-label' }, [label]),
      control,
      hint ? el('span', { class: 'field-hint' }, [hint]) : null
    ]);
  }

  function numInput(value, min, max, step) {
    return el('input', {
      type: 'number', class: 'input', value: value,
      min: min === undefined ? 0 : min, max: max === undefined ? 9999 : max,
      step: step || 1, inputmode: 'numeric'
    });
  }

  function textInput(value, placeholder) {
    return el('input', { type: 'text', class: 'input', value: value || '', placeholder: placeholder || '' });
  }

  function selectBox(options, value) {
    return el('select', { class: 'select' }, options.map(function (o) {
      return el('option', { value: o[0], selected: String(o[0]) === String(value) }, [o[1]]);
    }));
  }

  function switchRow(title, desc, checked) {
    var input = el('input', { type: 'checkbox', checked: !!checked, tabindex: '0', class: 'focusable' });
    return {
      root: el('label', { class: 'switch-row' }, [
        el('span', { class: 'switch' }, [input, el('span', { class: 'switch-track' })]),
        el('span', { class: 'switch-text' }, [
          el('span', { class: 'switch-title' }, [title]),
          desc ? el('span', { class: 'switch-desc' }, [desc]) : null
        ])
      ]),
      input: input
    };
  }

  function summary(text) {
    return el('p', { class: 'muted small', style: 'margin-bottom:12px' }, [text]);
  }

  function dataTable(headers, rows, opts) {
    return el('div', { class: 'table-wrap' }, [
      el('table', { class: 'table' + (opts && opts.compact ? ' compact' : '') }, [
        el('thead', {}, [el('tr', {}, headers.map(function (h) {
          return el('th', { class: h.num ? 'num' : '' }, [h.label || h]);
        }))]),
        el('tbody', {}, rows.map(function (cells) {
          return el('tr', {}, cells.map(function (cell, i) {
            var h = headers[i] || {};
            return el('td', { 'data-label': h.label || h, class: h.num ? 'num' : '' }, [
              typeof cell === 'object' && cell !== null ? cell : String(cell)
            ]);
          }));
        }))
      ])
    ]);
  }

  /* ==================== 登录 ==================== */

  function renderLogin(message) {
    if (app.logTimer) { clearInterval(app.logTimer); app.logTimer = null; }
    document.body.innerHTML = '';

    var pass = el('input', {
      type: 'password', class: 'input', placeholder: '管理密码',
      autocomplete: 'current-password', 'aria-label': '管理密码'
    });
    var showBtn = el('button', { class: 'btn-icon', type: 'button', 'aria-label': '显示密码' }, ['显示']);
    showBtn.style.width = '44px';
    showBtn.style.fontSize = '12px';
    showBtn.addEventListener('click', function () {
      var hidden = pass.type === 'password';
      pass.type = hidden ? 'text' : 'password';
      showBtn.textContent = hidden ? '隐藏' : '显示';
    });

    var remember = el('input', { type: 'checkbox', checked: true });
    var errBox = el('div', { class: 'login-err' }, [message || '']);
    var submit = el('button', { class: 'btn primary block', type: 'submit' }, ['登录']);

    var form = el('form', { class: 'login-card' }, [
      el('div', { class: 'login-brand' }, [
        el('div', { class: 'login-logo' }, [el('img', { src: './assets/logo.png', alt: '' })]),
        el('div', { class: 'login-name' }, ['宝宝请听题']),
        el('div', { class: 'login-sub' }, ['家长管理 · 输入管理密码'])
      ]),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label' }, ['管理密码']),
        el('div', { class: 'row', style: 'flex-wrap:nowrap' }, [pass, showBtn])
      ]),
      el('label', { class: 'switch-row' }, [
        el('span', { class: 'switch' }, [remember, el('span', { class: 'switch-track' })]),
        el('span', { class: 'switch-text' }, [
          el('span', { class: 'switch-title' }, ['在这台设备上记住我']),
          el('span', { class: 'switch-desc' }, ['30 天内免密码，修改密码后失效'])
        ])
      ]),
      errBox,
      submit
    ]);

    pass.style.flex = '1 1 auto';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = pass.value;
      if (!value) { errBox.textContent = '请输入管理密码'; return; }
      submit.disabled = true;
      submit.textContent = '登录中…';
      request('POST', '/api/auth', { passphrase: value, remember: remember.checked }, { noAuthRedirect: true })
        .then(function (data) {
          if (!data.token) throw apiError(0, '登录失败');
          setToken(data.token);
          boot();
        })
        .catch(function (err) {
          submit.disabled = false;
          submit.textContent = '登录';
          errBox.textContent = err.message || '登录失败';
          pass.focus();
          pass.select();
        });
    });

    document.body.appendChild(el('div', { class: 'login-wrap' }, [form]));
    setTimeout(function () { pass.focus(); }, 60);
    showDeviceHint();
  }

  function showDeviceHint() {
    get('/api/hello').then(function (info) {
      var sub = document.querySelector('.login-sub');
      if (sub && info && info.name) sub.textContent = '家长管理 · ' + info.name + ' · v' + info.version;
    }, function () {});
  }

  /* ==================== 外壳 ==================== */

  function buildShell() {
    document.body.innerHTML = '';

    var nav = el('nav', { class: 'side-nav', 'aria-label': '主菜单' }, PAGES.map(function (p) {
      var badge = p.id === 'grading'
        ? el('span', { class: 'nav-count', id: 'gradingCount', style: 'display:none' }, [''])
        : null;
      return el('button', {
        type: 'button',
        class: 'focusable',
        'data-page': p.id,
        onclick: function () { navigate(p.id); }
      }, [el('span', { class: 'nav-dot', 'aria-hidden': 'true' }), p.name, badge]);
    }));

    var side = el('aside', { class: 'side' }, [
      el('div', { class: 'side-brand' }, [
        el('span', { class: 'side-logo' }, [el('img', { src: './assets/logo.png', alt: '' })]),
        el('span', { class: 'side-name' }, ['宝宝请听题'])
      ]),
      nav,
      el('div', { class: 'side-foot' }, [
        el('div', { class: 'side-device', id: 'sideDevice' }, ['']),
        el('div', { class: 'side-ver', id: 'sideVer' }, ['']),
        el('div', { class: 'row', style: 'margin-top:8px' }, [
          el('button', { class: 'btn ghost sm focusable', type: 'button', onclick: function () { logout(); } }, ['退出登录'])
        ])
      ])
    ]);

    var content = el('div', { class: 'content' }, [
      el('main', { class: 'page', id: 'page' })
    ]);

    document.body.appendChild(el('div', { class: 'app' }, [side, content]));
    document.body.appendChild(el('div', { class: 'toasts', id: 'toasts', role: 'status', 'aria-live': 'polite' }));
  }

  function updateNav() {
    Array.prototype.forEach.call(document.querySelectorAll('.side-nav button'), function (btn) {
      var on = btn.getAttribute('data-page') === app.page;
      btn.classList.toggle('active', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  }

  function refreshDeviceInfo() {
    get('/api/device').then(function (d) {
      app.device = d;
      var name = document.getElementById('sideDevice');
      var ver = document.getElementById('sideVer');
      if (name) name.textContent = d.name || '这台设备';
      if (ver) ver.textContent = 'v' + d.version + ' · ' + (d.flavor === 'tv' ? '电视版' : '手机版');
    }, function () {});
  }

  function refreshBadge() {
    get('/api/reviews?state=pending').then(function (d) {
      var n = (d.items || []).length;
      var badge = document.getElementById('gradingCount');
      if (!badge) return;
      badge.textContent = n ? String(n) : '';
      badge.style.display = n ? '' : 'none';
    }, function () {});
  }

  /* ==================== 路由 ==================== */

  function parseHash() {
    var raw = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    var found = null;
    PAGES.forEach(function (p) { if (p.id === raw) found = p.id; });
    return found || 'overview';
  }

  function navigate(page) {
    if (location.hash === '#/' + page) { renderPage(); return; }
    location.hash = '#/' + page;
  }

  function renderPage() {
    if (app.logTimer) { clearInterval(app.logTimer); app.logTimer = null; }
    var root = document.getElementById('page');
    if (!root) return;
    app.page = parseHash();
    updateNav();
    if (window.scrollTo) window.scrollTo(0, 0);
    var fn = PAGES_MAP[app.page] || pageOverview;
    try { fn(root); } catch (e) {
      root.innerHTML = '';
      root.appendChild(errorCard(e, function () { renderPage(); }));
    }
  }

  function boot() {
    get('/api/state').then(function (st) {
      app.config = st.config;
      buildShell();
      refreshDeviceInfo();
      refreshBadge();
      renderPage();
    }, function (err) {
      if (err.status === 401) { clearToken(); renderLogin('登录已过期，请重新输入管理密码'); return; }
      renderConnectError(err);
    });
  }

  function renderConnectError(err) {
    document.body.innerHTML = '';
    document.body.appendChild(el('div', { class: 'boot' }, [
      el('div', { class: 'boot-card' }, [
        el('div', { class: 'boot-logo' }, [el('img', { src: './assets/logo.png', alt: '' })]),
        el('h1', { class: 'boot-title' }, ['连不上设备']),
        el('p', { class: 'boot-text' }, [(err && err.message) || '无法连接设备']),
        el('p', { class: 'boot-hint' }, [
          '请确认电视和这台设备在同一个 Wi-Fi 下，电视上的「宝宝请听题」仍在运行。'
        ]),
        el('div', { class: 'boot-actions' }, [
          el('button', { class: 'btn primary', type: 'button', onclick: function () { boot(); } }, ['重试']),
          el('button', { class: 'btn ghost', type: 'button', onclick: function () { clearToken(); renderLogin(''); } }, ['重新登录'])
        ])
      ])
    ]));
  }

  /* ==================== 概览 ==================== */

  function statusInfo(learning, config) {
    var o = learning.override;
    if (o && o.mode === 'indefinite') {
      return { tone: 'warn', title: '管控已关闭', desc: '孩子可以自由使用，直到你点「恢复规则」。' };
    }
    if (o && o.mode === 'unlock') {
      return { tone: 'ok', title: '临时解锁中', desc: '还剩 ' + fmtLeft(o.remainingSeconds == null ? -1 : o.remainingSeconds) + '，到点自动恢复规则。' };
    }
    if (o && o.mode === 'lock') {
      return { tone: 'bad', title: '已暂停使用', desc: o.remainingSeconds > 0 ? ('锁定还剩 ' + fmtLeft(o.remainingSeconds) + '。') : '等你解除锁定。' };
    }
    if (learning.free) {
      return { tone: 'ok', title: '自由时段', desc: '当前时段不扣时长，也不需要答题。' };
    }
    var reason = learning.reason || '';
    if (reason === 'quota') return { tone: 'bad', title: '今日时长已用完', desc: '明天自动重置，或现在临时解锁。' };
    if (reason === 'schedule') return { tone: 'bad', title: '不在可用时段', desc: '按设定的时段，现在不能看。' };
    if (reason === 'rounds') return { tone: 'bad', title: '今日任务已完成', desc: '组数已答满，明天再来。' };
    if (reason === 'timeup') return { tone: 'warn', title: '时间已用完', desc: '答对题目可以换更多观看时间。' };
    if (reason === 'locked') return { tone: 'bad', title: '家长已暂停', desc: '等你解除锁定。' };
    return { tone: 'ok', title: '正常使用中', desc: '按规则管控，一切正常。' };
  }

  function pageOverview(root) {
    var body = pageShell(root, '概览', '设备当前状态与今天的学习情况');
    load(body, function () {
      return Promise.all([get('/api/state'), get('/api/history?days=7')]);
    }, function (res) {
      var st = res[0], hist = res[1].items || [];
      var l = st.learning || {}, cfg = app.config || st.config || {}, today = st.today || {};
      var info = statusInfo(l, cfg);

      body.appendChild(heroCard(st, info, cfg));
      body.appendChild(statGrid(st, cfg));
      body.appendChild(remoteCard());
      body.appendChild(chartCard(hist));
      body.appendChild(historyTable(hist));
    });
  }

  function heroCard(st, info, cfg) {
    var l = st.learning || {}, today = st.today || {};
    var used = today.usedMinutes || 0;
    var total = cfg.dailyMinutes || 0;
    var pct = total ? Math.min(100, Math.round(used / total * 100)) : 0;
    var remaining = l.remainingSeconds;
    if (l.free) remaining = -1;

    return el('section', { class: 'hero hero-' + info.tone }, [
      el('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'hero-label' }, ['当前状态']),
          el('h2', { class: 'hero-title' }, [info.title]),
          el('p', { class: 'hero-desc' }, [info.desc])
        ]),
        el('div', { style: 'text-align:right' }, [
          el('div', { class: 'hero-label' }, ['剩余可用']),
          el('div', { class: 'hero-time' }, [fmtLeft(remaining)])
        ])
      ]),
      el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, [
        el('div', { class: 'bar-fill' + (pct >= 100 ? ' bad' : pct >= 80 ? ' warn' : ''), style: 'width:' + pct + '%' })
      ]),
      el('p', { class: 'muted small', style: 'margin-top:6px' }, ['今天已用 ' + used.toFixed(0) + ' / ' + total + ' 分钟']),
      el('div', { class: 'hero-actions' }, [
        el('button', { class: 'btn primary sm focusable', type: 'button', onclick: function () { remoteAction('unlock', 30); } }, ['解锁 30 分']),
        el('button', { class: 'btn sm focusable', type: 'button', onclick: function () { remoteAction('unlock', 60); } }, ['解锁 60 分']),
        el('button', { class: 'btn sm focusable', type: 'button', onclick: function () { remoteAction('lock', 0); } }, ['立即锁定']),
        el('button', { class: 'btn ghost sm focusable', type: 'button', onclick: function () { remoteAction('cancel', 0); } }, ['恢复规则'])
      ])
    ]);
  }

  function statGrid(st, cfg) {
    var l = st.learning || {}, today = st.today || {}, rep = st.repetition || {};
    function box(value, unit, label) {
      return el('div', { class: 'stat' }, [
        el('div', { class: 'stat-val' }, [String(value), unit ? el('small', {}, [unit]) : null]),
        el('div', { class: 'stat-label' }, [label])
      ]);
    }
    var acc = today.answered ? Math.round(today.correct * 100 / today.answered) : 0;
    return el('div', { class: 'stat-grid' }, [
      box(today.usedMinutes ? today.usedMinutes.toFixed(0) : 0, '分', '今日已用'),
      box(today.answered || 0, '题', '今日答题'),
      box(acc, '%', '正确率'),
      box((l.roundsDoneToday || 0) + ' / ' + (cfg.roundsPerDay || 0), '', '今日组数'),
      box(rep.due || 0, '题', '待复习')
    ]);
  }

  function remoteCard() {
    var c = card('家长遥控', '立即生效，不需要等下一次同步');
    var mins = numInput(30, 1, 1440);
    mins.style.maxWidth = '110px';
    var body = el('div', { class: 'card-b' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'small muted' }, ['临时解锁']),
        mins,
        el('button', { class: 'btn primary sm focusable', type: 'button', onclick: function () { remoteAction('unlock', num(mins.value)); } }, ['解锁']),
        el('button', { class: 'btn danger sm focusable', type: 'button', onclick: function () { remoteAction('lock', 0); } }, ['立即锁定']),
        el('button', { class: 'btn sm focusable', type: 'button', onclick: function () { remoteAction('cancel', 0); } }, ['恢复规则']),
        el('button', { class: 'btn ghost sm focusable', type: 'button', onclick: function () { remoteAction('indefinite', 0); } }, ['关闭管控'])
      ])
    ]);
    c.appendChild(body);
    return c;
  }

  function remoteAction(action, minutes) {
    var run = function () {
      post('/api/remote', { action: action, minutes: minutes || 0 }).then(function () {
        var label = action === 'unlock' ? '已解锁 ' + minutes + ' 分钟'
          : action === 'lock' ? '已锁定'
          : action === 'indefinite' ? '已关闭管控'
          : '已恢复规则';
        toast(label, 'ok');
        renderPage();
      }, function (err) { toast(err.message || '操作失败', 'bad'); });
    };
    if (action === 'indefinite') {
      confirmDialog('关闭管控？', '关闭后孩子可以自由使用，直到你在面板里点「恢复规则」。', '关闭管控', true)
        .then(function (ok) { if (ok) run(); });
      return;
    }
    run();
  }

  function chartCard(hist) {
    var items = hist.slice().reverse();
    var max = 1;
    items.forEach(function (d) { if ((d.usedMinutes || 0) > max) max = d.usedMinutes; });
    var chart = el('div', { class: 'chart', role: 'img', 'aria-label': '最近 7 天使用时长' }, items.map(function (d) {
      var used = d.usedMinutes || 0;
      var h = Math.max(used > 0 ? 6 : 3, Math.round(used / max * 100));
      return el('div', {
        class: 'chart-col',
        title: d.label + ' · 已用 ' + used.toFixed(0) + ' 分钟 · 答 ' + (d.answered || 0) + ' 题'
      }, [
        el('div', { class: 'chart-track' }, [
          el('div', { class: 'chart-bar' + (used ? '' : ' zero'), style: 'height:' + h + '%' })
        ]),
        el('div', { class: 'chart-val' }, [used ? used.toFixed(0) : '0']),
        el('div', { class: 'chart-x' }, [d.label])
      ]);
    }));
    var c = card('最近 7 天', '柱高为使用分钟数');
    c.appendChild(el('div', { class: 'card-b' }, [chart]));
    return c;
  }

  function historyTable(hist) {
    var rows = hist.map(function (d) {
      var acc = d.answered ? Math.round(d.correct * 100 / d.answered) : 0;
      return [d.label, el('span', { class: 'num' }, [(d.usedMinutes || 0).toFixed(0)]), String(d.answered || 0), acc + '%', String(d.rounds || 0)];
    });
    var c = card('每日明细', '');
    c.appendChild(dataTable(
      ['日期', { label: '使用(分)', num: true }, '答题', '正确率', '组数'],
      rows.length ? rows : [['—', '—', '—', '—', '—']],
      { compact: true }
    ));
    return c;
  }

  /* ==================== 规则 ==================== */

  function pageRules(root) {
    var body = pageShell(root, '规则', '修改后立即生效，电视端无需重启');
    load(body, function () { return get('/api/state'); }, function (st) {
      app.config = st.config;
      body.appendChild(durationCard());
      body.appendChild(scheduleCard());
      body.appendChild(rewardCard());
      body.appendChild(uiCard());
      body.appendChild(remoteCard());
    });
  }

  function durationCard() {
    var c = app.config;
    var cNode = card('时长与题量', '决定每天能用多久、答多少题');
    var summaryEl = summary(durationText(c));
    var daily = numInput(c.dailyMinutes, 1, 480);
    var free = numInput(c.dailyFreeMinutes, 0, 120);
    var session = numInput(c.sessionMinutes, 1, 120);
    var perRound = numInput(c.questionsPerRound, 1, 100);
    var rounds = numInput(c.roundsPerDay, 1, 100);
    var ratio = selectBox([[0.5, '50%'], [0.6, '60%'], [0.7, '70%'], [0.8, '80%'], [0.9, '90%']], c.passRatio);
    var mode = selectBox([['round', '按组闯关'], ['streak', '连续答对'], ['practice', '自由练习（不计时）']], c.playMode);

    cNode.appendChild(el('div', { class: 'card-b' }, [
      summaryEl,
      el('div', { class: 'grid grid-3' }, [
        field('每日可用上限', daily, '分钟'),
        field('不答题免费用', free, '分钟/天'),
        field('每次解锁', session, '分钟')
      ]),
      el('div', { class: 'grid grid-3', style: 'margin-top:12px' }, [
        field('每组题量', perRound, '题'),
        field('每日组数', rounds, '组'),
        field('及格比例', ratio)
      ]),
      el('div', { class: 'grid grid-2', style: 'margin-top:12px' }, [
        field('玩法', mode)
      ])
    ]));
    cNode.appendChild(el('div', { class: 'card-f' }, [
      el('button', { class: 'btn primary', type: 'button', onclick: function () {
        saveConfig({
          dailyMinutes: num(daily.value), dailyFreeMinutes: num(free.value), sessionMinutes: num(session.value),
          questionsPerRound: num(perRound.value), roundsPerDay: num(rounds.value),
          passRatio: num(ratio.value), playMode: mode.value
        }).then(function (cfg) {
          clean(); summaryEl.textContent = durationText(cfg); toast('已保存', 'ok');
        }, function (err) { toast(err.message, 'bad'); });
      } }, ['保存'])
    ]));
    var clean = trackDirty(cNode);
    return cNode;
  }

  function durationText(c) {
    var modeText = { round: '按组闯关', streak: '连续答对', practice: '自由练习' }[c.playMode] || c.playMode;
    return '每天最多 ' + c.dailyMinutes + ' 分钟 · 每次解锁 ' + c.sessionMinutes + ' 分钟 · 每组 ' +
      c.questionsPerRound + ' 题 · 每天 ' + c.roundsPerDay + ' 组 · 及格 ' + Math.round(c.passRatio * 100) + '% · ' + modeText;
  }

  function scheduleCard() {
    var c = app.config;
    var cNode = card('可用时段', '按半小时一格设置，也可以直接设为全天');
    var allDay = switchRow('全天可用', '关闭后按下面的时段表管控', c.allDay);
    var editor = weekEditor(c.weekSlots);
    editor.setDisabled(c.allDay);
    allDay.input.addEventListener('change', function () { editor.setDisabled(allDay.input.checked); });

    var schedMode = selectBox([['allow', '仅时段内可使用（时段外锁定）'], ['control', '仅时段内需要答题（时段外不看管）']], c.scheduleMode);
    var holiday = selectBox([['sunday', '节假日按周日安排'], ['normal', '节假日照常']], c.holidayMode);

    cNode.appendChild(el('div', { class: 'card-b' }, [
      allDay.root,
      editor.root,
      el('div', { class: 'grid grid-2', style: 'margin-top:14px' }, [
        field('时段用途', schedMode),
        field('法定节假日', holiday)
      ])
    ]));
    cNode.appendChild(el('div', { class: 'card-f' }, [
      el('button', { class: 'btn primary', type: 'button', onclick: function () {
        var patch = { allDay: allDay.input.checked, scheduleMode: schedMode.value, holidayMode: holiday.value };
        if (!allDay.input.checked) patch.weekSlots = editor.value();
        saveConfig(patch).then(function () {
          clean(); toast('已保存时段', 'ok');
          post('/api/holidays/sync', {}).then(function () {}, function () {});
        }, function (err) { toast(err.message, 'bad'); });
      } }, ['保存时段'])
    ]));
    var clean = trackDirty(cNode);
    return cNode;
  }

  function rewardCard() {
    var c = app.config;
    var cNode = card('奖励与加练', '答对奖励观看时间，答错进加练池');
    var extra = switchRow('答错累计加练', '连续答错达到阈值后追加题目', c.extraEnabled);
    var diff = switchRow('按难度给予答题奖励', '不同星级的题目奖励不同时长', c.difficultyRewardEnabled);

    var threshold = numInput(c.wrongThreshold, 1, 100);
    var extraCount = numInput(c.extraQuestions, 1, 100);

    var rewardInputs = {};
    var rewardsGrid = el('div', { class: 'grid grid-3' }, [1, 2, 3, 4, 5].map(function (star) {
      var input = numInput(c.difficultyRewards ? c.difficultyRewards[star] : 1, 0.1, 120, 0.1);
      rewardInputs[star] = input;
      return field(star + ' 星奖励', input, '分钟');
    }));
    rewardsGrid.style.display = c.difficultyRewardEnabled ? '' : 'none';
    diff.input.addEventListener('change', function () { rewardsGrid.style.display = diff.input.checked ? '' : 'none'; });

    cNode.appendChild(el('div', { class: 'card-b' }, [
      extra.root,
      el('div', { class: 'grid grid-2' }, [
        field('连错 N 题进加练池', threshold, '题'),
        field('每次加练数量', extraCount, '题')
      ]),
      el('div', { style: 'margin-top:12px' }, [diff.root, rewardsGrid])
    ]));
    cNode.appendChild(el('div', { class: 'card-f' }, [
      el('button', { class: 'btn primary focusable', type: 'button', onclick: function () {
        saveConfig({
          extraEnabled: extra.input.checked,
          wrongThreshold: num(threshold.value),
          extraQuestions: num(extraCount.value),
          difficultyRewardEnabled: diff.input.checked,
          difficultyRewards: {
            '1': num(rewardInputs[1].value), '2': num(rewardInputs[2].value), '3': num(rewardInputs[3].value),
            '4': num(rewardInputs[4].value), '5': num(rewardInputs[5].value)
          }
        }).then(function () { clean(); toast('已保存', 'ok'); }, function (err) { toast(err.message, 'bad'); });
      } }, ['保存奖励与加练'])
    ]));
    var clean = trackDirty(cNode);
    return cNode;
  }

  function uiCard() {
    var c = app.config;
    var cNode = card('界面与反馈', '孩子端答题后的节奏');
    var autoNext = numInput(c.autoNextSeconds, 0, 30);
    var ttsSwitch = switchRow('题目自动朗读', '没有预置语音时使用系统 TTS 朗读', c.ttsEnabled);
    cNode.appendChild(el('div', { class: 'card-b' }, [
      el('div', { class: 'grid grid-2' }, [
        field('自动继续', autoNext, '秒；0 表示手动点「继续」')
      ]),
      ttsSwitch.root
    ]));
    cNode.appendChild(el('div', { class: 'card-f' }, [
      el('button', { class: 'btn primary focusable', type: 'button', onclick: function () {
        saveConfig({ autoNextSeconds: num(autoNext.value), ttsEnabled: ttsSwitch.input.checked })
          .then(function () { clean(); toast('已保存', 'ok'); }, function (err) { toast(err.message, 'bad'); });
      } }, ['保存'])
    ]));
    var clean = trackDirty(cNode);
    return cNode;
  }

  /* ==================== 时段编辑器 ==================== */

  function slotLabel(index) {
    var h = Math.floor(index / 2);
    var m = (index % 2) * 30;
    return pad2(h) + ':' + (m === 0 ? '00' : '30');
  }

  function weekEditor(initial) {
    var grid = [];
    for (var d = 0; d < 7; d++) {
      var src = (initial && initial[d]) || '';
      var row = [];
      for (var i = 0; i < 48; i++) row.push(src.charAt(i) === '1');
      grid.push(row);
    }
    var disabled = false;
    var desktopCells = [];
    var mobileCells = [];
    var mobileDay = 0;

    var root = el('div', { class: 'wk' });
    var desk = el('div', { class: 'wk-desk' });
    var mob = el('div', { class: 'wk-mob' });

    function makeCell(day, slot, bucket) {
      var node = el('button', {
        type: 'button',
        class: 'wk-cell' + (grid[day][slot] ? ' on' : ''),
        'data-day': day,
        'data-slot': slot,
        tabindex: '-1',
        'aria-pressed': grid[day][slot] ? 'true' : 'false',
        'aria-label': DAYS[day] + ' ' + slotLabel(slot)
      });
      bucket.push({ node: node, day: day, slot: slot });
      return node;
    }

    function syncCells(bucket) {
      bucket.forEach(function (c) {
        var on = grid[c.day][c.slot];
        c.node.classList.toggle('on', on);
        c.node.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function syncAll() { syncCells(desktopCells); syncCells(mobileCells); }

    /* 桌面：7 行 × 48 格 */
    var hourRow = el('div', { class: 'wk-hours' }, ['00', '03', '06', '09', '12', '15', '18', '21'].map(function (h) {
      return el('span', { style: 'grid-column:span 6' }, [h]);
    }));
    desk.appendChild(el('div', { class: 'wk-head' }, [el('span'), hourRow]));

    DAYS.forEach(function (name, day) {
      var track = el('div', { class: 'wk-track', 'data-day': day });
      for (var s = 0; s < 48; s++) track.appendChild(makeCell(day, s, desktopCells));
      var tools = el('div', { class: 'wk-row-tools' }, [
        el('button', { type: 'button', class: 'wk-mini', title: '这一天全部开启', onclick: function () { fillDay(day, true); } }, ['全']),
        el('button', { type: 'button', class: 'wk-mini', title: '这一天全部关闭', onclick: function () { fillDay(day, false); } }, ['清'])
      ]);
      desk.appendChild(el('div', { class: 'wk-row' }, [
        el('div', { class: 'wk-day' }, [el('span', {}, [name]), tools]),
        track
      ]));
    });

    /* 手机：单日视图 */
    var chips = el('div', { class: 'wk-chips' });
    var mobileBody = el('div');
    function renderMobile() {
      clear(chips);
      DAYS.forEach(function (name, i) {
        chips.appendChild(el('button', {
          type: 'button',
          class: 'chip' + (i === mobileDay ? ' active' : ''),
          onclick: function () { mobileDay = i; renderMobile(); }
        }, [name]));
      });
      clear(mobileBody);
      mobileCells = [];
      var starts = [0, 12, 24, 36];
      starts.forEach(function (start) {
        var track = el('div', { class: 'wk-mtrack' });
        for (var i = 0; i < 12; i++) track.appendChild(makeCell(mobileDay, start + i, mobileCells));
        mobileBody.appendChild(el('div', { class: 'wk-mrow' }, [
          el('span', { class: 'wk-hlabel' }, [pad2(start / 2) + ':00']),
          track
        ]));
      });
    }
    renderMobile();

    function makeTools(withDay) {
      var nodes = [];
      if (withDay) {
        nodes.push(el('button', { class: 'btn sm', type: 'button', onclick: function () { fillDay(mobileDay, true); } }, ['本日开启']));
        nodes.push(el('button', { class: 'btn sm', type: 'button', onclick: function () { fillDay(mobileDay, false); } }, ['本日清空']));
      }
      nodes.push(el('button', { class: 'btn sm', type: 'button', onclick: function () { fillAll(true); } }, ['全周开启']));
      nodes.push(el('button', { class: 'btn sm', type: 'button', onclick: function () { fillAll(false); } }, ['全周清空']));
      nodes.push(el('button', { class: 'btn sm', type: 'button', onclick: function () { copyDialog(); } }, ['复制某天…']));
      nodes.push(el('span', { class: 'wk-tip' }, ['']));
      return el('div', { class: 'wk-tools' }, nodes);
    }

    mob.appendChild(chips);
    mob.appendChild(mobileBody);
    mob.appendChild(makeTools(true));
    desk.appendChild(makeTools(false));

    root.appendChild(desk);
    root.appendChild(mob);

    function fillDay(day, value) {
      if (disabled) return;
      for (var i = 0; i < 48; i++) grid[day][i] = value;
      syncAll(); report();
    }
    function fillAll(value) {
      if (disabled) return;
      for (var d = 0; d < 7; d++) for (var i = 0; i < 48; i++) grid[d][i] = value;
      syncAll(); report();
    }
    function copyDialog() {
      if (disabled) return;
      var from = selectBox(DAYS.map(function (n, i) { return [String(i), n]; }), String(mobileDay));
      var targetHost = el('div', { style: 'margin-top:8px' });
      var targets = [];

      function renderTargets() {
        var src = Number(from.value);
        clear(targetHost);
        targets = [];
        DAYS.forEach(function (n, i) {
          if (i === src) return;
          var cb = el('input', { type: 'checkbox' });
          targets.push({ i: i, cb: cb });
          targetHost.appendChild(el('label', { class: 'switch-row' }, [
            el('span', { class: 'switch' }, [cb, el('span', { class: 'switch-track' })]),
            el('span', { class: 'switch-text' }, [el('span', { class: 'switch-title' }, [n])])
          ]));
        });
        if (!targets.length) targetHost.appendChild(el('p', { class: 'muted small' }, ['没有其他日期可复制。']));
      }
      from.addEventListener('change', renderTargets);
      renderTargets();

      mountDialog('复制时段', [
        el('p', { class: 'muted small' }, ['把某一天的时段覆盖到其他天。']),
        field('来源', from),
        targetHost
      ], [
        { label: '取消', kind: 'ghost', onClick: function (close) { close(); } },
        { label: '复制', kind: 'primary', onClick: function (close) {
          var src = Number(from.value);
          var picked = 0;
          targets.forEach(function (t) {
            if (!t.cb.checked) return;
            for (var i = 0; i < 48; i++) grid[t.i][i] = grid[src][i];
            picked++;
          });
          syncAll(); report(); close();
          toast(picked ? ('已复制到 ' + picked + ' 天') : '没有选择目标日', picked ? 'ok' : 'bad');
        } }
      ]);
    }

    function report() {
      var count = 0;
      for (var d = 0; d < 7; d++) for (var i = 0; i < 48; i++) if (grid[d][i]) count++;
      var text = count ? ('本周共开启 ' + (count / 2) + ' 小时') : '本周完全没有可用时段';
      Array.prototype.forEach.call(root.querySelectorAll('.wk-tip'), function (node) {
        node.textContent = text;
      });
    }

    /* 拖拽涂抹 */
    function bindPaint(host) {
      var painting = false;
      var value = false;
      function cellAt(x, y) {
        var node = document.elementFromPoint(x, y);
        while (node) {
          if (node.classList && node.classList.contains('wk-cell') && host.contains(node)) return node;
          node = node.parentNode;
        }
        return null;
      }
      function apply(node) {
        if (!node) return;
        var day = Number(node.getAttribute('data-day'));
        var slot = Number(node.getAttribute('data-slot'));
        if (isNaN(day) || isNaN(slot)) return;
        if (grid[day][slot] === value) return;
        grid[day][slot] = value;
        node.classList.toggle('on', value);
        node.setAttribute('aria-pressed', value ? 'true' : 'false');
        report();
      }
      host.addEventListener('pointerdown', function (e) {
        if (disabled) return;
        var cell = cellAt(e.clientX, e.clientY);
        if (!cell) return;
        e.preventDefault();
        value = !grid[Number(cell.getAttribute('data-day'))][Number(cell.getAttribute('data-slot'))];
        painting = true;
        apply(cell);
        if (host.setPointerCapture) { try { host.setPointerCapture(e.pointerId); } catch (err) {} }
      });
      host.addEventListener('pointermove', function (e) {
        if (!painting) return;
        e.preventDefault();
        apply(cellAt(e.clientX, e.clientY));
      });
      function end() { painting = false; }
      host.addEventListener('pointerup', end);
      host.addEventListener('pointercancel', end);
      window.addEventListener('blur', end);
    }

    bindPaint(desk);
    bindPaint(mob);

    report();

    return {
      root: root,
      value: function () {
        return grid.map(function (row) {
          return row.map(function (on) { return on ? '1' : '0'; }).join('');
        });
      },
      setDisabled: function (off) {
        disabled = !!off;
        root.classList.toggle('off', disabled);
      }
    };
  }

  /* ==================== 题库 ==================== */

  function pageBank(root) {
    var body = pageShell(root, '题库', '启用、暂停、编辑，或批量导入导出');
    load(body, function () {
      return get('/api/questions?all=1&limit=3000');
    }, function (data) {
      app.questions = data.items || [];
      app.bank.page = 0;
      app.bank.selected = {};
      buildBankUI(body);
    });
  }

  function buildBankUI(host) {
    var cNode = card('题目', '共 ' + app.questions.length + ' 题 · 已暂停的题会灰显');
    var subjects = [];
    app.questions.forEach(function (q) { if (q.subject && subjects.indexOf(q.subject) < 0) subjects.push(q.subject); });

    var search = el('input', {
      type: 'search', class: 'input search', placeholder: '搜索题干或答案',
      value: app.bank.search
    });
    var subjectSel = selectBox([['', '全部科目']].concat(subjects.map(function (s) { return [s, s]; })), app.bank.subject);
    var sizeSel = selectBox([['30', '每页 30'], ['60', '每页 60'], ['100', '每页 100']], String(app.bank.size));

    var toolbar = el('div', { class: 'toolbar' }, [
      search,
      subjectSel,
      sizeSel,
      el('button', { class: 'btn primary sm', type: 'button', onclick: function () { openQuestionEditor(null); } }, ['新增']),
      el('button', { class: 'btn sm', type: 'button', onclick: importQuestions }, ['导入']),
      el('button', { class: 'btn sm', type: 'button', onclick: exportQuestions }, ['导出'])
    ]);
    subjectSel.style.maxWidth = '150px';
    sizeSel.style.maxWidth = '120px';

    var bulk = el('div', { class: 'bulkbar', style: 'display:none' });
    var list = el('div', { class: 'qlist' });
    var pager = el('div', { class: 'pager' });

    cNode.appendChild(toolbar);
    cNode.appendChild(bulk);
    cNode.appendChild(list);
    cNode.appendChild(pager);
    host.appendChild(cNode);

    var view = { bulk: bulk, list: list, pager: pager };

    function selectedIds() {
      var out = [];
      Object.keys(app.bank.selected).forEach(function (id) { if (app.bank.selected[id]) out.push(id); });
      return out;
    }

    function refreshBulk() {
      var ids = selectedIds();
      clear(bulk);
      if (!ids.length) { bulk.style.display = 'none'; return; }
      bulk.style.display = '';
      appendAll(bulk, [
        el('span', {}, ['已选 ' + ids.length + ' 题']),
        el('button', { class: 'btn sm', type: 'button', onclick: function () {
          var ids = pageIds();
          ids.forEach(function (id) { app.bank.selected[id] = true; });
          refresh();
        } }, ['全选本页']),
        el('button', { class: 'btn sm', type: 'button', onclick: function () {
          app.bank.selected = {};
          refresh();
        } }, ['清空选择']),
        el('button', { class: 'btn sm primary', type: 'button', onclick: function () { bulkSetEnabled(true); } }, ['启用']),
        el('button', { class: 'btn sm', type: 'button', onclick: function () { bulkSetEnabled(false); } }, ['暂停']),
        el('button', { class: 'btn sm danger', type: 'button', onclick: bulkDelete }, ['删除'])
      ]);
    }

    function pageIds() {
      return filtered().slice(app.bank.page * app.bank.size, (app.bank.page + 1) * app.bank.size).map(function (q) { return q.id; });
    }

    function filtered() {
      var key = app.bank.search.trim().toLowerCase();
      return app.questions.filter(function (q) {
        if (app.bank.subject && q.subject !== app.bank.subject) return false;
        if (!key) return true;
        var hay = (q.q || '') + ' ' + ((q.a || []).join(' ')) + ' ' + (q.id || '');
        return hay.toLowerCase().indexOf(key) >= 0;
      });
    }

    function refresh() {
      var list0 = filtered();
      var pages = Math.max(1, Math.ceil(list0.length / app.bank.size));
      if (app.bank.page >= pages) app.bank.page = pages - 1;
      if (app.bank.page < 0) app.bank.page = 0;
      var slice = list0.slice(app.bank.page * app.bank.size, (app.bank.page + 1) * app.bank.size);

      clear(view.list);
      if (!slice.length) {
        view.list.appendChild(emptyState('空', '没有匹配的题目', '换个关键词，或新增一道题'));
      } else {
        slice.forEach(function (q) { view.list.appendChild(bankRow(q, refresh, refreshBulk)); });
      }

      clear(view.pager);
      if (list0.length) {
        appendAll(view.pager, [
          el('button', { class: 'btn sm', type: 'button', disabled: app.bank.page === 0, onclick: function () { app.bank.page--; refresh(); } }, ['上一页']),
          el('span', {}, [(app.bank.page + 1) + ' / ' + pages + '（共 ' + list0.length + ' 题）']),
          el('button', { class: 'btn sm', type: 'button', disabled: app.bank.page >= pages - 1, onclick: function () { app.bank.page++; refresh(); } }, ['下一页'])
        ]);
      }
      refreshBulk();
    }

    function bulkSetEnabled(enabled) {
      var ids = selectedIds();
      if (!ids.length) return;
      post('/api/questions/pause', { ids: ids, enabled: enabled }).then(function (d) {
        ids.forEach(function (id) {
          app.questions.forEach(function (q) { if (q.id === id) q.enabled = enabled; });
        });
        app.bank.selected = {};
        toast(enabled ? '已启用 ' + ids.length + ' 题' : '已暂停 ' + ids.length + ' 题', 'ok');
        refresh(); refreshBadge();
      }, function (err) { toast(err.message, 'bad'); });
    }

    function bulkDelete() {
      var ids = selectedIds();
      if (!ids.length) return;
      confirmDialog('删除 ' + ids.length + ' 道题？', '删除后无法恢复，音题对应的音频文件不会被自动删除。', '删除', true)
        .then(function (ok) {
          if (!ok) return;
          post('/api/questions/delete', { ids: ids }).then(function () {
            app.questions = app.questions.filter(function (q) { return ids.indexOf(q.id) < 0; });
            app.bank.selected = {};
            toast('已删除 ' + ids.length + ' 题', 'ok');
            refresh(); refreshBadge();
          }, function (err) { toast(err.message, 'bad'); });
        });
    }

    search.addEventListener('input', debounce(function () {
      app.bank.search = search.value;
      app.bank.page = 0;
      refresh();
    }, 250));
    subjectSel.addEventListener('change', function () {
      app.bank.subject = subjectSel.value;
      app.bank.page = 0;
      refresh();
    });
    sizeSel.addEventListener('change', function () {
      app.bank.size = num(sizeSel.value) || 30;
      app.bank.page = 0;
      refresh();
    });

    refresh();
  }

  function bankRow(q, refresh, syncBulk) {
    var checked = !!app.bank.selected[q.id];
    var box = el('input', { type: 'checkbox', class: 'check', checked: checked, 'aria-label': '选择 ' + q.id });
    box.addEventListener('change', function () {
      app.bank.selected[q.id] = box.checked;
      if (syncBulk) syncBulk();
    });

    var meta = [el('span', { class: 'badge' }, [q.id]), el('span', {}, [q.subject || '未分类']),
      el('span', {}, ['难度 ' + '★'.repeat(q.difficulty || 2)]),
      el('span', {}, [TYPE_TEXT[q.type] || q.type || '单选'])];
    if (!q.enabled) meta.push(el('span', { class: 'badge bad' }, ['已暂停']));

    var cNode = el('div', { class: 'qcard' }, [
      el('div', { class: 'qcard-check' }, [box]),
      el('div', { class: 'qcard-body' }, [
        el('div', { class: 'qcard-stem' + (q.enabled ? '' : ' off') }, [q.q || '']),
        el('div', { class: 'qcard-meta' }, meta)
      ]),
      el('div', { class: 'qcard-actions' }, [
        el('button', { class: 'btn sm', type: 'button', onclick: function () { openQuestionEditor(q); } }, ['编辑']),
        el('button', { class: 'btn sm', type: 'button', onclick: function () {
          post('/api/questions/pause', { ids: [q.id], enabled: !q.enabled }).then(function () {
            q.enabled = !q.enabled;
            if (refresh) refresh();
          }, function (err) { toast(err.message, 'bad'); });
        } }, [q.enabled ? '暂停' : '启用']),
        el('button', { class: 'btn sm ghost', type: 'button', onclick: function () {
          confirmDialog('删除这道题？', (q.q || '').slice(0, 60), '删除', true).then(function (ok) {
            if (!ok) return;
            del('/api/questions/' + encodeURIComponent(q.id)).then(function () {
              app.questions = app.questions.filter(function (x) { return x.id !== q.id; });
              delete app.bank.selected[q.id];
              toast('已删除', 'ok');
              if (refresh) refresh();
            }, function (err) { toast(err.message, 'bad'); });
          });
        } }, ['删除'])
      ])
    ]);
    return cNode;
  }

  function openQuestionEditor(existing) {
    var q = existing ? JSON.parse(JSON.stringify(existing)) : {
      type: 'single', subject: '识字', difficulty: 2,
      q: '', a: ['选项 A', '选项 B', '选项 C', '选项 D'], k: 0, correctIndices: [0], answers: [''], tip: ''
    };
    if (!q.a || !q.a.length) q.a = ['选项 A', '选项 B'];

    var typeSel = selectBox([['single', '单选'], ['multiple', '多选'], ['boolean', '判断'], ['text', '填空'], ['subjective', '主观题']], q.type);
    var subject = textInput(q.subject, '科目，例如 识字 / 英语 / 书写');
    var difficulty = numInput(q.difficulty || 2, 1, 5);
    var stem = el('textarea', { class: 'textarea', rows: 3, placeholder: '题干（纯文本即可）' });
    stem.value = q.q || '';
    var tip = el('textarea', { class: 'textarea', rows: 2, placeholder: '解析（可选）' });
    tip.value = q.tip || '';
    var optionsBox = el('div');

    function renderType() {
      clear(optionsBox);
      var t = typeSel.value;
      if (t === 'single' || t === 'multiple') {
        q.a.forEach(function (opt, i) {
          var mark = t === 'multiple'
            ? el('input', { type: 'checkbox', checked: (q.correctIndices || []).indexOf(i) >= 0 })
            : el('input', { type: 'radio', name: 'q-correct', checked: (q.k || 0) === i });
          var input = textInput(opt);
          input.setAttribute('data-opt', String(i));
          optionsBox.appendChild(el('div', { class: 'opt-row' }, [
            el('label', { class: 'opt-mark' }, [mark, '正确']),
            input
          ]));
        });
        optionsBox.appendChild(el('button', { class: 'btn sm', type: 'button', onclick: function () {
          collectOptions();
          q.a.push('选项 ' + String.fromCharCode(65 + q.a.length));
          renderType();
        } }, ['加一个选项']));
      } else if (t === 'boolean') {
        var sel = selectBox([['0', '正确'], ['1', '错误']], String(q.k === 1 ? 1 : 0));
        sel.setAttribute('data-role', 'bool');
        optionsBox.appendChild(field('正确答案', sel));
      } else if (t === 'text') {
        var ta = el('textarea', { class: 'textarea', rows: 3, placeholder: '可接受的答案，每行一个' });
        ta.value = (q.answers || []).join('\n');
        ta.setAttribute('data-role', 'answers');
        optionsBox.appendChild(field('可接受答案', ta));
      } else {
        var model = el('textarea', { class: 'textarea', rows: 3, placeholder: '参考答案' });
        model.value = q.modelAnswer || '';
        model.setAttribute('data-role', 'model');
        var rubric = el('textarea', { class: 'textarea', rows: 2, placeholder: '评分标准（可选）' });
        rubric.value = q.rubric || '';
        rubric.setAttribute('data-role', 'rubric');
        optionsBox.appendChild(field('参考答案', model));
        optionsBox.appendChild(field('评分标准', rubric));
      }
    }

    function collectOptions() {
      var inputs = optionsBox.querySelectorAll('input[data-opt]');
      if (inputs.length) q.a = Array.prototype.map.call(inputs, function (n) { return n.value; });
    }

    typeSel.addEventListener('change', function () {
      collectOptions();
      if (typeSel.value === 'multiple') q.correctIndices = q.correctIndices || [0];
      renderType();
    });
    renderType();

    var body = [
      el('div', { class: 'grid grid-2' }, [field('题型', typeSel), field('科目', subject)]),
      el('div', { class: 'grid grid-2', style: 'margin-top:12px' }, [field('难度（1–5 星）', difficulty)]),
      el('div', { style: 'margin-top:12px' }, [field('题干', stem)]),
      el('div', { style: 'margin-top:12px' }, [el('span', { class: 'field-label' }, ['选项与答案']), optionsBox]),
      el('div', { style: 'margin-top:12px' }, [field('解析', tip)])
    ];

    mountDialog(existing ? '编辑题目 ' + existing.id : '新增题目', body, [
      { label: '取消', kind: 'ghost', onClick: function (close) { close(); } },
      { label: '保存', kind: 'primary', onClick: function (close) {
        collectOptions();
        var t = typeSel.value;
        var payload = {
          type: t,
          subject: subject.value.trim() || '常识',
          difficulty: num(difficulty.value) || 2,
          q: stem.value.trim(),
          tip: tip.value.trim()
        };
        if (existing) payload.id = existing.id;

        if (t === 'single' || t === 'multiple') {
          var texts = [];
          var correct = [];
          Array.prototype.forEach.call(optionsBox.querySelectorAll('.opt-row'), function (row, i) {
            texts.push(row.querySelector('input[data-opt]').value);
            var mark = row.querySelector('input[type=radio], input[type=checkbox]');
            if (mark && mark.checked) correct.push(i);
          });
          if (texts.length < 2) { toast('至少需要两个选项', 'bad'); return; }
          payload.a = texts;
          if (t === 'single') payload.k = correct.length ? correct[0] : 0;
          else payload.correctIndices = correct.length ? correct : [0];
        } else if (t === 'boolean') {
          var sel = optionsBox.querySelector('[data-role=bool]');
          payload.k = num(sel.value);
        } else if (t === 'text') {
          var ta = optionsBox.querySelector('[data-role=answers]');
          payload.answers = ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
          if (!payload.answers.length) { toast('至少填一个可接受答案', 'bad'); return; }
        } else {
          var model = optionsBox.querySelector('[data-role=model]');
          var rubric = optionsBox.querySelector('[data-role=rubric]');
          payload.modelAnswer = model.value.trim();
          payload.rubric = rubric.value.trim();
          if (!payload.modelAnswer) { toast('请填写参考答案', 'bad'); return; }
        }

        post('/api/questions', payload).then(function () {
          toast(existing ? '已保存' : '已新增', 'ok');
          close();
          reloadBank();
        }, function (err) { toast(err.message, 'bad'); });
      } }
    ], { wide: true });
  }

  function reloadBank() {
    get('/api/questions?all=1&limit=3000').then(function (data) {
      app.questions = data.items || [];
      app.bank.selected = {};
      renderPage();
    }, function (err) { toast(err.message, 'bad'); });
  }

  function importQuestions() {
    var input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed;
        try { parsed = JSON.parse(String(reader.result)); } catch (e) {
          toast('文件不是合法的 JSON', 'bad'); return;
        }
        var items = parsed && parsed.items ? parsed.items : parsed;
        if (!Array.isArray(items) || !items.length) { toast('文件里没有题目', 'bad'); return; }
        post('/api/questions', { items: items }).then(function (d) {
          toast('已导入 ' + (d.added || 0) + ' 题', 'ok');
          reloadBank();
        }, function (err) { toast(err.message, 'bad'); });
      };
      reader.onerror = function () { toast('读取文件失败', 'bad'); };
      reader.readAsText(file);
    });
    input.click();
  }

  function exportQuestions() {
    var blob = new Blob([JSON.stringify({ version: 1, items: app.questions }, null, 2)], { type: 'application/json' });
    var a = el('a', {
      href: URL.createObjectURL(blob),
      download: 'babyontv-bank-' + new Date().toISOString().slice(0, 10) + '.json'
    });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 1000);
  }

  /* ==================== 批改 ==================== */

  function pageGrading(root) {
    var body = pageShell(root, '批改', '主观题与手写题需要家长或 AI 批改');
    load(body, function () {
      return Promise.all([
        get('/api/grading'),
        get('/api/reviews?state=pending'),
        get('/api/reviews?state=all')
      ]);
    }, function (res) {
      var settings = res[0];
      var pending = res[1].items || [];
      var all = res[2].items || [];
      drawGrading(body, settings, pending, all);
    });
  }

  function drawGrading(host, settings, pending, all) {
    var graded = all.filter(function (r) { return r.state === 'graded'; });
    var seg = el('div', { class: 'seg', role: 'tablist' }, [
      el('button', { type: 'button', class: app.gradingTab === 'pending' ? 'active' : '', onclick: function () { app.gradingTab = 'pending'; renderPage(); } }, ['待批 ' + pending.length]),
      el('button', { type: 'button', class: app.gradingTab === 'graded' ? 'active' : '', onclick: function () { app.gradingTab = 'graded'; renderPage(); } }, ['已批 ' + graded.length])
    ]);
    host.appendChild(el('div', { class: 'row', style: 'margin-bottom:12px' }, [seg]));

    var listCard = card(app.gradingTab === 'pending' ? '待批题目' : '已批记录', app.gradingTab === 'pending' ? '支持手写图片，点开可放大' : '');
    var listBody = el('div', { class: 'card-b' });
    var items = app.gradingTab === 'pending' ? pending : graded;
    if (!items.length) {
      listBody.appendChild(emptyState('✓', app.gradingTab === 'pending' ? '没有待批的题目' : '还没有批改记录', ''));
    } else {
      items.slice(0, 60).forEach(function (rv) {
        listBody.appendChild(reviewCard(rv, app.gradingTab === 'pending'));
      });
    }
    listCard.appendChild(listBody);
    host.appendChild(listCard);

    host.appendChild(aiCard(settings));
  }

  function reviewCard(rv, pendingMode) {
    var q = rv.question || {};
    var input = rv.input || {};
    var meta = [
      el('span', { class: 'badge accent' }, [q.subject || '未分类']),
      el('span', {}, [TYPE_TEXT[q.type] || q.type || '主观']),
      el('span', {}, [fmtTime(rv.ts)]),
      rv.score !== undefined && rv.score !== null ? el('span', { class: 'badge ok' }, [Math.round(rv.score) + ' 分']) : null
    ];

    var kids = [
      el('div', { class: 'review-meta' }, meta),
      el('div', { class: 'review-stem' }, [q.q || '']),
      el('div', { class: 'review-answer' }, [input.text || '（未填写文字）'])
    ];

    if (input.drawing) {
      var img = el('img', { class: 'review-drawing', src: input.drawing, alt: '手写答案' });
      img.addEventListener('click', function () {
        mountDialog('手写答案', [el('img', { src: input.drawing, style: 'width:100%;border-radius:12px', alt: '' })],
          [{ label: '关闭', kind: 'ghost', onClick: function (close) { close(); } }], { wide: true });
      });
      kids.push(img);
    }

    if (pendingMode) {
      var score = el('input', { type: 'number', class: 'input', min: 0, max: 100, placeholder: '0–100', style: 'max-width:110px' });
      var feedback = el('input', { type: 'text', class: 'input', placeholder: '批改意见（可选）' });
      feedback.style.flex = '1 1 200px';
      var quick = el('div', { class: 'row tight' }, [60, 80, 100].map(function (v) {
        return el('button', { class: 'chip', type: 'button', onclick: function () { score.value = String(v); } }, [v + ' 分']);
      }));
      kids.push(el('div', { class: 'row' }, [quick]));
      kids.push(el('div', { class: 'review-acts' }, [score, feedback,
        el('button', { class: 'btn primary sm', type: 'button', onclick: function () {
          if (score.value === '') { toast('请先打分', 'bad'); return; }
          post('/api/reviews/' + encodeURIComponent(rv.id), { score: num(score.value), feedback: feedback.value })
            .then(function () { toast('已批改', 'ok'); renderPage(); refreshBadge(); }, function (e) { toast(e.message, 'bad'); });
        } }, ['提交']),
        el('button', { class: 'btn sm', type: 'button', onclick: function () {
          post('/api/reviews/' + encodeURIComponent(rv.id) + '/retry', {})
            .then(function () { toast('已重新交给 AI', 'ok'); }, function (e) { toast(e.message, 'bad'); });
        } }, ['AI 重试'])
      ]));
    } else {
      if (rv.feedback) kids.push(el('div', { class: 'muted small' }, ['批改意见：' + rv.feedback]));
      kids.push(el('div', { class: 'muted small' }, ['来源：' + (rv.source === 'ai' ? 'AI 批改' : '家长批改')]));
    }

    return el('div', { class: 'review-card' }, kids);
  }

  function aiCard(settings) {
    var cNode = card('AI 批改设置', '可以完全手动批改，也可以接入 OpenAI 兼容接口');
    var toggled = false;

    var mode = selectBox([['manual', '家长手动批改'], ['ai', 'AI 自动批改']], settings.mode || 'manual');
    var provider = selectBox((settings.providers || []).map(function (p) {
      return [p.id, p.note ? p.name + '（' + p.note + '）' : p.name];
    }), settings.provider || 'deepseek');
    var endpoint = textInput(settings.endpoint, '例如 https://api.deepseek.com/v1');
    var model = textInput(settings.model, '模型名');
    var apiKey = el('input', {
      type: 'password', class: 'input',
      placeholder: settings.hasKey ? '已保存（留空沿用，需要更换时填写）' : 'API Key'
    });
    var vision = el('input', { type: 'checkbox', checked: !!settings.vision });
    var passScore = numInput(settings.passScore || 60, 1, 100);
    passScore.style.maxWidth = '110px';

    provider.addEventListener('change', function () {
      var p = (settings.providers || []).filter(function (x) { return x.id === provider.value; })[0];
      if (!p) return;
      if (p.baseUrl) endpoint.value = p.baseUrl;
      if (p.model) model.value = p.model;
      if (p.visionModel && !vision.checked) { /* 留给家长自己开 */ }
    });

    var body = el('div', { class: 'collapse-b', hidden: true }, [
      el('div', { class: 'grid grid-2' }, [field('批改方式', mode), field('服务商预设', provider)]),
      el('div', { style: 'margin-top:12px' }, [field('接口地址', endpoint)]),
      el('div', { class: 'grid grid-2', style: 'margin-top:12px' }, [field('模型', model), field('API Key', apiKey)]),
      el('div', { class: 'row', style: 'margin-top:12px' }, [
        el('label', { class: 'switch-row' }, [
          el('span', { class: 'switch' }, [vision, el('span', { class: 'switch-track' })]),
          el('span', { class: 'switch-text' }, [el('span', { class: 'switch-title' }, ['模型支持图像']), el('span', { class: 'switch-desc' }, ['用于批改手写题'])])
        ]),
        field('及格分', passScore)
      ]),
      el('div', { class: 'row', style: 'margin-top:14px' }, [
        el('button', { class: 'btn primary sm', type: 'button', onclick: function () {
          var payload = {
            mode: mode.value, provider: provider.value,
            endpoint: endpoint.value.trim(), model: model.value.trim(),
            vision: vision.checked, passScore: num(passScore.value)
          };
          if (apiKey.value.trim()) payload.apiKey = apiKey.value.trim();
          put('/api/grading', payload).then(function () { toast('已保存批改设置', 'ok'); renderPage(); }, function (e) { toast(e.message, 'bad'); });
        } }, ['保存']),
        el('button', { class: 'btn sm', type: 'button', onclick: function () {
          post('/api/grading/test', {
            endpoint: endpoint.value.trim(), model: model.value.trim(),
            apiKey: apiKey.value.trim(), vision: vision.checked
          }).then(function (d) { toast(d.ok ? '连接正常 ' + d.ms + 'ms' : '测试失败：' + (d.message || ''), d.ok ? 'ok' : 'bad'); },
            function (e) { toast(e.message, 'bad'); });
        } }, ['测试连接']),
        el('button', { class: 'btn sm', type: 'button', onclick: function () {
          post('/api/grading/models', { endpoint: endpoint.value.trim(), apiKey: apiKey.value.trim() }).then(function (d) {
            if (!d.ok) { toast(d.message || '获取失败', 'bad'); return; }
            var names = d.items || [];
            mountDialog('可用模型', [el('div', { class: 'stack' }, names.slice(0, 40).map(function (n) {
              return el('button', { class: 'btn sm', type: 'button', onclick: function (close) { model.value = n; close(); } }, [n]);
            }))], [{ label: '关闭', kind: 'ghost', onClick: function (close) { close(); } }]);
          }, function (e) { toast(e.message, 'bad'); });
        } }, ['获取模型列表'])
      ])
    ]);

    var stateText = (settings.mode === 'ai')
      ? ('当前：AI 自动批改 · ' + (settings.model || '未选模型'))
      : '当前：家长手动批改';

    var head = el('button', { class: 'collapse-h', type: 'button', 'aria-expanded': 'false' }, [
      el('span', { class: 'collapse-label' }, [stateText]),
      el('span', { class: 'collapse-hint' }, ['展开设置']),
      el('span', { class: 'caret' }, ['⌄'])
    ]);
    head.addEventListener('click', function () {
      toggled = !toggled;
      body.hidden = !toggled;
      head.setAttribute('aria-expanded', toggled ? 'true' : 'false');
    });

    cNode.appendChild(head);
    cNode.appendChild(body);
    return cNode;
  }

  /* ==================== 记录 ==================== */

  function pageRecords(root) {
    var body = pageShell(root, '记录', '最近两周的用量与事件');
    load(body, function () {
      return Promise.all([get('/api/history?days=14'), get('/api/events?limit=60')]);
    }, function (res) {
      var hist = res[0].items || [], events = res[1].items || [];
      body.appendChild(chartCard2(hist));
      body.appendChild(historyTable(hist));
      body.appendChild(eventsCard(events));
    });
  }

  function chartCard2(hist) {
    var items = hist.slice().reverse();
    var max = 1;
    items.forEach(function (d) { if ((d.usedMinutes || 0) > max) max = d.usedMinutes; });
    if (items.length > 10) items = items.slice(-10);
    var chart = el('div', { class: 'chart' }, items.map(function (d) {
      var used = d.usedMinutes || 0;
      var h = Math.max(used > 0 ? 6 : 3, Math.round(used / max * 100));
      return el('div', { class: 'chart-col', title: d.label + ' · ' + used.toFixed(0) + ' 分钟' }, [
        el('div', { class: 'chart-track' }, [el('div', { class: 'chart-bar' + (used ? '' : ' zero'), style: 'height:' + h + '%' })]),
        el('div', { class: 'chart-val' }, [used ? used.toFixed(0) : '0']),
        el('div', { class: 'chart-x' }, [d.label])
      ]);
    }));
    var cNode = card('近 14 天使用时长', '柱高为分钟数');
    cNode.appendChild(el('div', { class: 'card-b' }, [chart]));
    return cNode;
  }

  function eventsCard(events) {
    var cNode = card('最近事件', '用于排查「为什么没弹题 / 为什么时间没扣」');
    if (!events.length) {
      cNode.appendChild(el('div', { class: 'card-b' }, [emptyState('空', '还没有事件', '')]));
      return cNode;
    }
    var rows = events.map(function (ev) {
      return [
        el('span', { class: 'mono small' }, [fmtTime(ev.ts)]),
        el('span', { class: 'badge' }, [EVENT_TEXT[ev.type] || ev.type]),
        eventDetail(ev)
      ];
    });
    cNode.appendChild(dataTable(['时间', '类型', '详情'], rows));
    return cNode;
  }

  function eventDetail(ev) {
    var p = ev.payload || {};
    switch (ev.type) {
      case 'answer': return p.correct ? '答对 ' + (p.qid || '') : '答错 ' + (p.qid || '');
      case 'usage': return Math.round((p.milliseconds || 0) / 60000) + ' 分钟';
      case 'quiz_pass': return '奖励 ' + (p.minutes || 0) + ' 分钟';
      case 'quiz': return (p.total || 0) + ' 题 / 对 ' + (p.correct || 0);
      case 'remote': return (p.action || '') + (p.minutes ? ' ' + p.minutes + ' 分钟' : '') + (p.source ? ' · ' + p.source : '');
      case 'review_graded': return (p.score || 0) + ' 分 · ' + (p.source || '');
      case 'review_submitted': return p.qid ? ('题目 ' + p.qid) : (p.id ? ('编号 ' + p.id) : '等待家长批改');
      case 'review_skipped': return p.qid ? ('题目 ' + p.qid) : '已跳过';
      case 'extra_added': return '加练 ' + (p.count || 0) + ' 题';
      case 'study': return p.minutes ? (p.minutes + ' 分钟') : '';
      case 'question_added': return p.count ? (p.count + ' 题') : (p.id || '');
      default: return JSON.stringify(p).slice(0, 70);
    }
  }

  /* ==================== 设备 ==================== */

  // 打开系统权限设置页
  // 权限项 → 原生桥的键。只有「在电视上打开的面板」才有 BOTVNative 桥；
  // 手机浏览器里没有这座桥，只能提示去电视端「权限与设置」页操作。
  var PERMISSION_KEYS = {
    action_service: 'accessibility',
    action_overlay: 'overlay',
    action_accessibility: 'accessibility',
    action_usage: 'usage',
    action_autostart: 'battery',
    action_uninstall: 'uninstall'
  };

  function openPermissionSetting(action) {
    var key = PERMISSION_KEYS[action];
    if (!key) { toast('未知权限操作', 'bad'); return; }
    var bridge = window.BOTVNative;
    if (bridge && typeof bridge.openSettings === 'function') {
      try { bridge.openSettings(key); return; }
      catch (e) { toast('打开设置失败：' + e.message, 'bad'); return; }
    }
    toast('请在电视上打开「权限与设置」页面调整这一项', 'warn');
  }

  function pageDevice(root) {
    var body = pageShell(root, '设备', '运行状态、集成令牌与安全设置');
    load(body, function () {
      return Promise.all([
        get('/api/device'), get('/api/integration'), get('/api/holidays')
      ]);
    }, function (res) {
      var d = res[0], ig = res[1] || {}, hol = res[2] || {};
      body.appendChild(deviceCard(d, hol));
      body.appendChild(integrationCard(ig));
      body.appendChild(passwordCard());
      body.appendChild(holidayCard(hol));
    });
  }

  function deviceCard(d, hol) {
    var m = d.monitor || {};
    var auto = d.autostart || {};
    var items = [
      ['拦截服务', m.service, m.service ? '运行中' : '未运行', 'action_service'],
      ['悬浮窗', m.overlay, m.overlay ? '已授权' : '缺失', 'action_overlay'],
      ['无障碍', m.accessibilityEnabled, m.accessibilityEnabled ? '已开启' : '未开启', 'action_accessibility'],
      ['使用情况', m.usage, m.usage ? '已授权' : '未授权', 'action_usage'],
      ['开机自启', auto.ok, auto.ok ? '正常' : '可能被拦截', 'action_autostart'],
      ['防卸载', d.uninstallProtected, d.uninstallProtected ? '开启' : '未开启', 'action_uninstall']
    ];
    var matrix = el('div', { class: 'matrix' }, items.map(function (it) {
      var action = it[3];
      return el('button', { 
        class: 'matrix-item focusable', 
        'data-action': action,
        tabindex: '0'
      }, [
        el('span', { class: 'dot ' + (it[1] ? 'ok' : 'bad') }),
        el('span', {}, [it[0]]),
        el('span', {}, [it[2]])
      ]);
    }));
    
    // 绑定权限项点击事件：跳转系统设置页
    matrix.querySelectorAll('.matrix-item').forEach(function (btn) {
      btn.addEventListener('click', function () { openPermissionSetting(btn.getAttribute('data-action')); });
    });

    var nameInput = textInput(d.name || '', '设备名称');
    nameInput.style.maxWidth = '240px';

    return el('div', { class: 'card' }, [
      el('div', { class: 'card-h' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'card-title' }, [d.name || '这台设备']),
          el('div', { class: 'card-sub' }, ['v' + d.version + ' · ' + (d.flavor === 'tv' ? '电视版' : '手机版') + ' · ' + (d.ip || '') + ':' + (d.port || '')])
        ])
      ]),
      el('div', { class: 'card-b' }, [
        matrix,
        el('div', { class: 'grid grid-2', style: 'margin-top:16px' }, [
          field('设备名称', nameInput, '显示在家长面板与配对页')
        ]),
        el('div', { class: 'row', style: 'margin-top:12px' }, [
          el('button', { class: 'btn primary sm', type: 'button', onclick: function () {
            var name = nameInput.value.trim();
            if (!name) { toast('名称不能为空', 'bad'); return; }
            put('/api/device', { name: name }).then(function () {
              toast('已重命名', 'ok'); refreshDeviceInfo(); renderPage();
            }, function (e) { toast(e.message, 'bad'); });
          } }, ['保存名称']),
          el('button', { class: 'btn sm danger', type: 'button', onclick: function () {
            confirmDialog('关闭防卸载？', '关闭后会失去防卸载保护，应用可能被直接卸载。', '关闭防卸载', true).then(function (ok) {
              if (!ok) return;
              del('/api/device/uninstall-guard').then(function () { toast('已关闭防卸载', 'ok'); renderPage(); }, function (e) { toast(e.message, 'bad'); });
            });
          } }, ['关闭防卸载'])
        ])
      ])
    ]);
  }

  function integrationCard(ig) {
    var cNode = card('集成令牌', '给 Home Assistant 等外部系统调用，权限可限定为只读');
    cNode.appendChild(el('div', { class: 'card-b' }, [
      el('div', { class: 'kv' }, [
        el('div', { class: 'kv-k' }, ['状态']),
        el('div', { class: 'kv-v' }, [ig.enabled ? '已启用' : '已关闭']),
        el('div', { class: 'kv-k' }, ['令牌']),
        el('div', { class: 'kv-v' }, [ig.hasToken ? (ig.hint || '已生成') + (ig.createdAt ? ' · ' + fmtTime(ig.createdAt) : '') : '未生成']),
        el('div', { class: 'kv-k' }, ['权限']),
        el('div', { class: 'kv-v' }, [(ig.read ? '只读' : '') + (ig.control ? ' 控制' : '') || '—'])
      ]),
      el('div', { class: 'row', style: 'margin-top:12px' }, [
        el('button', { class: 'btn primary sm', type: 'button', onclick: function () {
          post('/api/integration', { read: true, control: true }).then(function (r) {
            showToken(r.token);
            renderPage();
          }, function (e) { toast(e.message, 'bad'); });
        } }, ['生成新令牌']),
        el('button', { class: 'btn sm', type: 'button', onclick: function () {
          put('/api/integration', { enabled: !ig.enabled }).then(function () { toast(ig.enabled ? '已停用' : '已启用', 'ok'); renderPage(); }, function (e) { toast(e.message, 'bad'); });
        } }, [ig.enabled ? '停用' : '启用']),
        el('button', { class: 'btn sm danger', type: 'button', onclick: function () {
          confirmDialog('吊销令牌？', '所有使用该令牌的外部系统会立即失效。', '吊销', true).then(function (ok) {
            if (!ok) return;
            del('/api/integration').then(function () { toast('已吊销', 'ok'); renderPage(); }, function (e) { toast(e.message, 'bad'); });
          });
        } }, ['吊销'])
      ])
    ]));
    return cNode;
  }

  function showToken(token) {
    var box = el('input', { type: 'text', class: 'input mono', value: token || '', readonly: true });
    mountDialog('新令牌（只显示一次）', [
      el('p', { class: 'muted small' }, ['复制后妥善保存；关闭这个窗口就再也看不到了。']),
      box
    ], [
      { label: '复制', kind: 'primary', onClick: function () { copyText(token || ''); } },
      { label: '关闭', kind: 'ghost', onClick: function (close) { close(); } }
    ]);
  }

  function updateCard(up) {
    var cNode = card('应用更新', '读取本仓库 Release 或自定义清单');
    var apiInput = textInput(up.api || '', '（可选）自定义 update.json 地址，https:// 开头');
    var mirrors = el('textarea', { class: 'textarea', rows: 2, placeholder: '（可选）镜像地址，每行一个，https:// 开头' });
    mirrors.value = (up.mirrors || []).join('\n');

    var logRows = (up.log || []).map(function (l) {
      return [(l.source || ''), (l.ok ? '成功' : '失败') + ' · ' + (l.message || ''), (l.ms || 0) + ' ms'];
    });

    cNode.appendChild(el('div', { class: 'card-b' }, [
      el('div', { class: 'kv' }, [
        el('div', { class: 'kv-k' }, ['当前版本']), el('div', { class: 'kv-v' }, ['v' + (up.current || '')]),
        el('div', { class: 'kv-k' }, ['最新版本']), el('div', { class: 'kv-v' }, [up.latest ? 'v' + up.latest : '未获取']),
        el('div', { class: 'kv-k' }, ['状态']), el('div', { class: 'kv-v' }, [up.checking ? '正在检查…' : (up.hasUpdate ? '有新版本' : '已是最新')])
      ]),
      el('div', { class: 'row', style: 'margin-top:12px' }, [
        el('button', { class: 'btn primary sm', type: 'button', onclick: function () { checkUpdate(); } }, ['检查更新'])
      ]),
      el('div', { style: 'margin-top:14px' }, [field('自定义检查地址', apiInput)]),
      el('div', { style: 'margin-top:10px' }, [field('镜像地址', mirrors)]),
      el('div', { class: 'row', style: 'margin-top:12px' }, [
        el('button', { class: 'btn sm', type: 'button', onclick: function () {
          put('/api/update', { api: apiInput.value.trim(), mirrors: mirrors.value }).then(function () {
            toast('已保存', 'ok'); renderPage();
          }, function (e) { toast(e.message, 'bad'); });
        } }, ['保存设置'])
      ]),
      logRows.length ? el('div', { style: 'margin-top:14px' }, [
        el('div', { class: 'card-sub', style: 'margin-bottom:6px' }, ['最近检查记录']),
        dataTable(['来源', '结果', '耗时'], logRows)
      ]) : null
    ]));
    return cNode;
  }

  function checkUpdate() {
    post('/api/update/check', {}).then(function () {
      toast('正在检查…', 'ok');
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        get('/api/update').then(function (up) {
          if (!up.checking || tries > 30) {
            clearInterval(timer);
            toast(up.hasUpdate ? ('发现新版本 v' + up.latest) : '已是最新版本', up.hasUpdate ? 'ok' : '');
            renderPage();
          }
        }, function () { clearInterval(timer); });
      }, 2000);
    }, function (e) { toast(e.message, 'bad'); });
  }

  function passwordCard() {
    var cNode = card('修改管理密码', '6–64 位；修改后所有已登录设备都需要重新登录');
    var current = el('input', { type: 'password', class: 'input', placeholder: '当前密码', autocomplete: 'current-password' });
    var next = el('input', { type: 'password', class: 'input', placeholder: '新密码（至少 6 位）', autocomplete: 'new-password' });
    var again = el('input', { type: 'password', class: 'input', placeholder: '再输入一次', autocomplete: 'new-password' });

    cNode.appendChild(el('div', { class: 'card-b' }, [
      el('div', { class: 'grid grid-3' }, [
        field('当前密码', current), field('新密码', next), field('确认新密码', again)
      ])
    ]));
    cNode.appendChild(el('div', { class: 'card-f' }, [
      el('button', { class: 'btn primary', type: 'button', onclick: function () {
        if (next.value.length < 6) { toast('新密码至少 6 位', 'bad'); return; }
        if (next.value !== again.value) { toast('两次输入不一致', 'bad'); return; }
        post('/api/password', { current: current.value, password: next.value }).then(function () {
          mountDialog('密码已修改', [el('p', {}, ['所有已登录的设备都需要用新密码重新登录。'])],
            [{ label: '去登录', kind: 'primary', onClick: function (close) { close(); clearToken(); renderLogin('密码已修改，请重新登录'); } }]);
        }, function (e) { toast(e.message, 'bad'); });
      } }, ['修改密码'])
    ]));
    return cNode;
  }

  function holidayCard(hol) {
    var cNode = card('法定节假日', '节假日可以按周日安排，或照常管控');
    cNode.appendChild(el('div', { class: 'card-b' }, [
      el('p', { class: 'muted small' }, [
        '当前内置 ' + (hol.year || '—') + ' 年，共 ' + (hol.count || 0) + ' 天' +
        (hol.source ? '（来源：' + hol.source + '）' : '') +
        (hol.fetchedAt ? ' · 更新于 ' + fmtTime(hol.fetchedAt) : '')
      ])
    ]));
    cNode.appendChild(el('div', { class: 'card-f' }, [
      el('button', { class: 'btn sm', type: 'button', onclick: function () {
        post('/api/holidays/sync', {}).then(function (d) {
          toast(d && d.count ? '已同步 ' + d.count + ' 天' : '同步完成', 'ok');
          renderPage();
        }, function (e) { toast(e.message, 'bad'); });
      } }, ['立即同步'])
    ]));
    return cNode;
  }

  /* ==================== 日志 ==================== */

  function pageLogs(root) {
    clear(root);
    root.appendChild(pageHead('运行日志', '设备本机日志，不会上传'));

    var search = el('input', {
      type: 'search', class: 'input search', placeholder: '关键词过滤，回车搜索', value: app.logQuery
    });
    var pre = el('pre', { class: 'log-box', tabindex: '0' }, ['加载中…']);
    var countLabel = el('span', { class: 'muted small' }, ['']);

    var cardNode = el('div', { class: 'card' }, [
      el('div', { class: 'toolbar' }, [
        search,
        el('button', { class: 'btn sm', type: 'button', onclick: function () { fetchLogs(); } }, ['刷新']),
        el('button', { class: 'btn sm', type: 'button', onclick: function () { copyText(allLines.join('\n')); } }, ['复制']),
        el('button', { class: 'btn sm', type: 'button', onclick: exportLogs }, ['导出 ZIP']),
        el('button', { class: 'btn sm danger-ghost', type: 'button', onclick: function () {
          confirmDialog('清空日志？', '设备上的日志文件会被删除，无法恢复。', '清空', true).then(function (ok) {
            if (!ok) return;
            del('/api/logs').then(function () { toast('已清空', 'ok'); fetchLogs(); }, function (e) { toast(e.message, 'bad'); });
          });
        } }, ['清空'])
      ]),
      el('div', { style: 'padding:0 16px 16px' }, [countLabel, pre])
    ]);
    root.appendChild(cardNode);

    var allLines = [];

    function renderLines(lines) {
      allLines = lines;
      clear(pre);
      if (!lines.length) {
        pre.appendChild(el('span', { class: 'log-empty' }, ['（暂无日志）']));
        return;
      }
      lines.forEach(function (line) {
        var m = /^\S+\s+\S+\s+([EWID])[\/\s]/.exec(line);
        var level = m ? m[1] : '';
        var cls = level === 'E' ? 'lv-e' : level === 'W' ? 'lv-w' : level === 'D' ? 'lv-d' : 'lv-i';
        pre.appendChild(el('span', { class: cls }, [line]));
        pre.appendChild(txt('\n'));
      });
    }

    function fetchLogs() {
      var q = search.value.trim();
      app.logQuery = q;
      get('/api/logs?limit=800&q=' + encodeURIComponent(q)).then(function (data) {
        var lines = data.lines || [];
        countLabel.textContent = q ? ('匹配 ' + lines.length + ' 行') : ('最近 ' + lines.length + ' 行');
        renderLines(lines);
      }, function (err) {
        countLabel.textContent = '';
        clear(pre);
        pre.appendChild(el('span', { class: 'log-empty' }, [err.message || '加载失败']));
      });
    }

    search.addEventListener('keydown', function (e) { if (e.key === 'Enter') fetchLogs(); });
    search.addEventListener('input', debounce(function () { fetchLogs(); }, 400));

    fetchLogs();
  }

  function exportLogs() {
    // 浏览器原生下载拿不到自定义请求头，令牌只能放进查询串（服务端对导出这一个接口认它）。
    var url = base() + '/api/logs/export' + (app.token ? '?token=' + encodeURIComponent(app.token) : '');
    var bridge = window.BOTVNative;
    // 电视内置 WebView 会拦掉脚本发起的下载（点了没反应），交给原生下载落盘。
    if (bridge && typeof bridge.downloadFile === 'function') {
      try {
        toast('正在保存日志包…', 'ok');
        var path = bridge.downloadFile(url);
        if (path) { toast('已保存到 ' + path, 'ok'); return; }
        toast('保存失败，请在手机浏览器里打开面板再导出', 'bad');
        return;
      } catch (e) { toast('保存失败：' + e.message, 'bad'); return; }
    }
    var a = el('a', { href: url, download: 'babyontv-logs.zip' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
    toast('开始下载日志包', 'ok');
  }

  function pageAbout(root) {
    var body = pageShell(root, '关于/版本', '应用版本、更新与开源信息');
    load(body, function () {
      return Promise.all([
        get('/api/device'), get('/api/update')
      ]);
    }, function (res) {
      var d = res[0], up = res[1] || {};
      body.appendChild(versionCard(d, up));
      body.appendChild(updateCard(up));
      body.appendChild(openSourceCard());
    });
  }

  function versionCard(d, up) {
    var cNode = card('版本信息', '当前运行版本与构建详情');
    cNode.appendChild(el('div', { class: 'card-b' }, [
      el('div', { class: 'kv' }, [
        el('div', { class: 'kv-k' }, ['应用名称']), el('div', { class: 'kv-v' }, ['宝宝请听题']),
        el('div', { class: 'kv-k' }, ['当前版本']), el('div', { class: 'kv-v' }, ['v' + (d.version || up.current || '—')]),
        el('div', { class: 'kv-k' }, ['最新版本']), el('div', { class: 'kv-v' }, [up.latest ? 'v' + up.latest : '未获取']),
        el('div', { class: 'kv-k' }, ['版本代号']), el('div', { class: 'kv-v' }, [(d.flavor === 'tv' ? '电视版' : '手机版')]),
        el('div', { class: 'kv-k' }, ['设备名称']), el('div', { class: 'kv-v' }, [d.name || '—']),
        el('div', { class: 'kv-k' }, ['架构']), el('div', { class: 'kv-v' }, [d.arch || '—'])
      ])
    ]));
    return cNode;
  }

  function openSourceCard() {
    var cNode = card('开源协议与致谢', '本项目基于开源协议发布，感谢所有贡献者');
    cNode.appendChild(el('div', { class: 'card-b' }, [
      el('div', { class: 'kv' }, [
        el('div', { class: 'kv-k' }, ['项目地址']), el('div', { class: 'kv-v' }, [el('a', { href: 'https://github.com/RonL89/BabyOnTV', target: '_blank' }, ['https://github.com/RonL89/BabyOnTV'])]),
        el('div', { class: 'kv-k' }, ['协议']), el('div', { class: 'kv-v' }, ['Apache-2.0']),
        el('div', { class: 'kv-k' }, ['第三方许可']), el('div', { class: 'kv-v' }, [el('a', { href: 'https://github.com/RonL89/BabyOnTV/blob/main/THIRD_PARTY_NOTICES.md', target: '_blank', rel: 'noreferrer' }, ['查看完整列表'])])
      ])
    ]));
    return cNode;
  }

  /* ==================== 页面表 ==================== */

  var PAGES_MAP = {
    overview: pageOverview,
    rules: pageRules,
    bank: pageBank,
    grading: pageGrading,
    records: pageRecords,
    device: pageDevice,
    logs: pageLogs,
    about: pageAbout
  };

  /* ==================== 启动 ==================== */

  window.addEventListener('hashchange', function () {
    if (!app.token) return;
    renderPage();
  });

  app.token = storedToken();
  if (!app.token) {
    renderLogin('');
  } else {
    boot();
  }
})();
