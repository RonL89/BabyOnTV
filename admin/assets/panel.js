/* BabyOnTV 家长面板（零依赖单文件，手写）。
 * 功能：概览、规则（时段 / 题量 / 奖励 / 加练）、题库（增删改查·导入导出·AI出题）、
 *       批改（家长评分 / AI 配置）、记录、设备（含防卸载 / 集成令牌 / 更新）、日志。
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c != null) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  var toastTimer;

  var token = '', host = location.hostname, port = location.port || 8099, page = 'rules';
  var store = { config: null, state: null, device: null, questions: [], reviews: [] };

  function toast(value) {
    var box = $('toast') || document.body.appendChild(el('div', { id: 'toast', class: 'toast' }));
    box.textContent = value; box.className = 'toast show';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { box.className = 'toast'; }, 2600);
  }

  function api(path, options, done) {
    options = options || {};
    fetch('http://' + host + ':' + port + path, {
      method: options.method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'X-Admin-Token': token } : {}),
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.error && !options.settle) { toast(data.message || '请求失败'); if (data.error === 'unauthorized') { logout(true); } return; }
      (done || function () {})(data);
    }, function () { toast('连接设备失败，请确认在同一网络'); });
  }

  function login(pass, remember) {
    fetch('http://' + host + ':' + port + '/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase: pass, remember: !!remember })
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.token) { token = data.token; localStorage.setItem('botv-panel-token', token); boot(); }
      else toast(data.message || '密码错误');
    }, function () { toast('连接设备失败'); });
  }
  function logout(silent) {
    if (token && !silent) api('/api/logout', { method: 'POST' });
    token = ''; localStorage.removeItem('botv-panel-token'); renderLogin();
  }

  // —— 登录页 ——
  function renderLogin() {
    document.body.innerHTML = '';
    var pass = el('input', { type: 'password', placeholder: '管理密码', id: 'pass' });
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    var remember = el('input', { type: 'checkbox', id: 'remember' });
    var go = function () { login(pass.value, remember.checked); };
    document.body.appendChild(el('div', { class: 'login' }, [
      el('div', { class: 'brand' }, [el('span', { class: 'logo' }, [el('i')]), 'BabyOnTV']),
      el('p', { class: 'muted', style: 'text-align:center;margin-bottom:14px' }, ['家长管理']),
      pass, el('label', { class: 'row', style: 'margin:12px 0;font-size:13px;color:var(--text2)' },
        [remember, el('span', {}, ['在这台设备上记住我（30 天）'])]),
      el('button', { class: 'btn primary', style: 'width:100%', onclick: go }, ['登录'])
    ]));
  }

  // —— 主框架 ——
  var PAGES = [
    ['overview', '概览'], ['rules', '规则'], ['bank', '题库'], ['grading', '批改'],
    ['records', '记录'], ['device', '设备'], ['logs', '日志']
  ];
  function renderFrame() {
    document.body.innerHTML = '';
    var nav = el('nav', {}, PAGES.map(function (p) {
      return el('button', {
        class: p[0] === page ? 'active' : '',
        onclick: function () { page = p[0]; renderFrame(); renderPage(); }
      }, [p[1]]);
    }));
    var side = el('aside', { class: 'side' }, [
      el('div', { class: 'brand' }, [el('span', { class: 'logo' }, [el('i')]), 'BabyOnTV']),
      nav,
      el('div', { class: 'foot' }, [
        el('div', {}, [store.device ? store.device.name : '']),
        el('div', { class: 'small' }, [store.device ? ('v' + store.device.version + ' · ' + store.device.flavor) : '']),
        el('button', { class: 'btn small', style: 'margin-top:8px', onclick: function () { logout(); } }, ['退出'])
      ])
    ]);
    var main = el('div', { class: 'main' }, [el('div', { id: 'page' })]);
    document.body.appendChild(el('div', { class: 'layout' }, [side, main]));
    renderPage();
  }
  function pageRoot() { return $('page'); }

  function refreshCommon(done) {
    api('/api/state', null, function (data) { store.config = data.config; store.state = data.state || data; });
    api('/api/device', null, function (data) { store.device = data; });
    setTimeout(function () { (done || renderPage)(); }, 10);
  }

  function saveConfig(patch, done) {
    var body = Object.assign({}, store.config, patch);
    delete body.version;
    api('/api/config', { method: 'PUT', body: body }, function (data) {
      store.config = data.config; toast('已保存'); (done || function () {})();
    });
  }

  // —— 页面：概览 ——
  function renderOverview() {
    refreshCommon(function () {
      var s = store.state.today, l = store.state.learning;
      var root = pageRoot(); root.innerHTML = '';
      root.appendChild(el('h2', {}, ['概览']));
      var stats = el('div', { class: 'stat' }, [
        box(s.usedMinutes.toFixed(0) + ' 分', '今日已用'),
        box((l.remainingSeconds / 60).toFixed(0) + ' 分', '剩余可用'),
        box(s.answered + ' 题', '今日答题'),
        box((s.answered ? Math.round(s.correct * 100 / s.answered) : 0) + '%', '正确率'),
        box(l.roundsDoneToday + ' / ' + store.config.roundsPerDay, '今日组数')
      ]);
      function box(b, t) { return el('div', { class: 'box' }, [el('b', {}, [b]), el('span', {}, [t])]); }
      root.appendChild(stats);
      root.appendChild(el('div', { class: 'card' }, [
        el('h3', {}, ['状态']),
        el('p', { class: 'muted' }, [
          l.reason ? ({ locked: '家长已暂停使用', schedule: '不在可用时段', quota: '今日时长已用完', rounds: '今日任务已完成', timeup: '时间已用完，待答题' }[l.reason] || l.reason) : l.free ? '自由时段中' : '监控中'
        ])
      ]));
      requestHistory(root);
    });
  }
  function requestHistory(root) {
    api('/api/history?days=7', null, function (data) {
      var t = el('table', {}, [
        el('tr', {}, ['天', '使用(分)', '答题', '正确率', '组数'].map(function (h) { return el('th', {}, [h]); })),
      ]);
      data.items.slice().reverse().forEach(function (d) {
        t.appendChild(el('tr', {}, [
          d.label, (d.usedMinutes || 0).toFixed(0), String(d.answered || 0),
          (d.answered ? Math.round(d.correct * 100 / d.answered) : 0) + '%', String(d.rounds || 0)
        ].map(function (v) { return el('td', {}, [String(v)]); })));
      });
      var card = el('div', { class: 'card' }, [el('h3', {}, ['最近 7 天']), t]);
      root.appendChild(card);
    });
  }

  // —— 页面：规则 ——
  function renderRules() {
    refreshCommon(function () {
      var c = store.config, root = pageRoot(); root.innerHTML = '';
      root.appendChild(el('h2', {}, ['规则']));
      var card = el('div', { class: 'card' });
      function numField(label, key, min, max, hint) {
        return el('label', { class: 'field grow' }, [
          el('span', {}, [label + (hint ? '（' + hint + '）' : '')]),
          el('input', { type: 'number', min: min, max: max, value: c[key], id: 'f-' + key })
        ]);
      }
      card.appendChild(el('div', { class: 'row' }, [
        numField('每日可用上限（分钟）', 'dailyMinutes', 1, 480),
        numField('不答题免费用（分钟/天）', 'dailyFreeMinutes', 0, 120),
        numField('每次解锁（分钟）', 'sessionMinutes', 1, 120)
      ]));
      card.appendChild(el('div', { class: 'row' }, [
        numField('每组题量', 'questionsPerRound', 1, 100),
        numField('每日组数', 'roundsPerDay', 1, 100),
        (function () {
          var sel = el('select', { id: 'f-passRatio' }, [[0.5, '50%'], [0.6, '60%'], [0.7, '70%'], [0.8, '80%'], [0.9, '90%']].map(function (o) {
            var opt = el('option', { value: o[0] }, ['及格 ' + o[1]]); if (Math.abs(c.passRatio - o[0]) < .01) opt.selected = true; return opt;
          }));
          return el('label', { class: 'field grow' }, [el('span', {}, ['及格比例']), sel]);
        })()
      ]));
      card.appendChild(el('div', { class: 'row' }, [
        (function () {
          var sel = el('select', { id: 'f-playMode' }, [['round', '按组闯关'], ['streak', '连续答对'], ['practice', '自由练习（不计时）']].map(function (o) {
            var opt = el('option', { value: o[0] }, [o[1]]); if (c.playMode === o[0]) opt.selected = true; return opt;
          }));
          return el('label', { class: 'field grow' }, [el('span', {}, ['玩法']), sel]);
        })()
      ]));
      var saveBtn = el('button', { class: 'btn primary', onclick: function () {
        saveConfig({
          dailyMinutes: +$('f-dailyMinutes').value, dailyFreeMinutes: +$('f-dailyFreeMinutes').value,
          sessionMinutes: +$('f-sessionMinutes').value, questionsPerRound: +$('f-questionsPerRound').value,
          roundsPerDay: +$('f-roundsPerDay').value, passRatio: +$('f-passRatio').value,
          playMode: $('f-playMode').value
        });
      } }, ['保存']);
      card.appendChild(saveBtn);
      root.appendChild(card);

      // 时段
      var slotCard = el('div', { class: 'card' });
      var allDay = el('input', { type: 'checkbox' }); allDay.checked = c.allDay;
      slotCard.appendChild(el('div', { class: 'row' }, [
        el('label', { class: 'row' }, [allDay, el('span', {}, ['全天可用（不设时段）'])])
      ]));
      var week = weekEditor(c.weekSlots);
      slotCard.appendChild(week.root);
      var mode = el('select', { id: 'f-scheduleMode' }, [['allow', '仅时段内可使用（时段外锁定）'], ['control', '仅时段内需要答题（时段外不看管）']].map(function (o) {
        var opt = el('option', { value: o[0] }, [o[1]]); if (c.scheduleMode === o[0]) opt.selected = true; return opt;
      }));
      var holiday = el('select', { id: 'f-holidayMode' }, [['sunday', '节假日按周日安排'], ['normal', '节假日照常']].map(function (o) {
        var opt = el('option', { value: o[0] }, [o[1]]); if (c.holidayMode === o[0]) opt.selected = true; return opt;
      }));
      slotCard.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [
        el('label', { class: 'field grow' }, [el('span', {}, ['时段用途']), mode]),
        el('label', { class: 'field grow' }, [el('span', {}, ['法定节假日']), holiday])
      ]));
      slotCard.appendChild(el('button', { class: 'btn primary', onclick: function () {
        saveConfig({ allDay: allDay.checked, weekSlots: allDay.checked ? week.full() : week.value(), scheduleMode: mode.value, holidayMode: holiday.value }, function () {
          api('/api/holidays/sync', { method: 'POST' });
        });
      } }, ['保存时段']));
      root.appendChild(slotCard);

      // 奖励与加练
      var extraCard = el('div', { class: 'card' });
      var extraOn = el('input', { type: 'checkbox' }); extraOn.checked = !!c.extraEnabled;
      var diffOn = el('input', { type: 'checkbox' }); diffOn.checked = !!c.difficultyRewardEnabled;
      var rewards = el('div', { class: 'row' }, [1, 2, 3, 4, 5].map(function (star) {
        return el('label', { class: 'field grow' }, [el('span', {}, [star + ' 星奖励(分)']),
          el('input', { type: 'number', step: '0.1', min: '0.1', max: '120', value: c.difficultyRewards[star], id: 'f-rw-' + star })]);
      }));
      rewards.style.display = diffOn.checked ? 'flex' : 'none';
      diffOn.addEventListener('change', function () { rewards.style.display = diffOn.checked ? 'flex' : 'none'; });
      extraCard.appendChild(el('div', { class: 'row' }, [
        el('label', { class: 'row' }, [extraOn, el('span', {}, ['答错累计加练'])]),
        numField('连错 N 题进加练池', 'wrongThreshold', 1, 100),
        numField('每次加练数量', 'extraQuestions', 1, 100)
      ]));
      extraCard.appendChild(el('div', { class: 'row' }, [
        el('label', { class: 'row' }, [diffOn, el('span', {}, ['按难度给予答题奖励'])])
      ]));
      extraCard.appendChild(rewards);
      extraCard.appendChild(el('button', { class: 'btn primary', onclick: function () {
        saveConfig({
          extraEnabled: extraOn.checked, wrongThreshold: +$('f-wrongThreshold').value, extraQuestions: +$('f-extraQuestions').value,
          difficultyRewardEnabled: diffOn.checked,
          difficultyRewards: { 1: +$('f-rw-1').value, 2: +$('f-rw-2').value, 3: +$('f-rw-3').value, 4: +$('f-rw-4').value, 5: +$('f-rw-5').value }
        });
      } }, ['保存奖励与加练']));
      root.appendChild(extraCard);

      // 界面与反馈
      var uiCard = el('div', { class: 'card' });
      var autoNext = numField('自动继续（秒，0=手动）', 'autoNextSeconds', 0, 30);
      uiCard.appendChild(el('div', { class: 'row' }, [autoNext]));
      uiCard.appendChild(el('button', { class: 'btn primary', onclick: function () {
        saveConfig({ autoNextSeconds: +$('f-autoNextSeconds').value });
      } }, ['保存']));
      root.appendChild(uiCard);

      // 家长遥控
      var remoteCard = el('div', { class: 'card' });
      var mins = el('input', { type: 'number', value: 30, min: 1, max: 1440, style: 'width:90px' });
      remoteCard.appendChild(el('div', { class: 'row' }, [
        el('span', {}, ['临时解锁']), mins, ' 分钟 ',
        el('button', { class: 'btn primary', onclick: function () { api('/api/remote', { method: 'POST', body: { action: 'unlock', minutes: +mins.value } }, function () { toast('已解锁'); refreshCommon(); }); } }, ['解锁']),
        el('button', { class: 'btn danger', onclick: function () { api('/api/remote', { method: 'POST', body: { action: 'lock', minutes: 0 } }, function () { toast('已锁定'); refreshCommon(); }); } }, ['立即锁定']),
        el('button', { class: 'btn', onclick: function () { api('/api/remote', { method: 'POST', body: { action: 'cancel' } }, function () { toast('已恢复规则'); refreshCommon(); }); } }, ['恢复规则']),
        el('button', { class: 'btn', onclick: function () { api('/api/remote', { method: 'POST', body: { action: 'indefinite' } }, function () { toast('已关闭管控，直到手动恢复'); refreshCommon(); }); } }, ['关闭管控'])
      ]));
      root.appendChild(remoteCard);
    });
  }

  function weekEditor(initial) {
    var days = ['一', '二', '三', '四', '五', '六', '日'];
    var grid = initial ? initial.map(function (d) { return d.split('').map(function (ch) { return ch === '1'; }); })
      : [0, 1, 2, 3, 4, 5, 6].map(function () { return new Array(48).fill(false); });
    var wrap = el('div', { class: 'week' });
    grid.forEach(function (cells, index) {
      var g = el('div', { class: 'grid' });
      cells.forEach(function (on, j) {
        var cell = el('div', { class: 'cell' + (on ? ' on' : ''), title: slotLabel(j) });
        cell.addEventListener('click', function () {
          cells[j] = !cells[j]; cell.className = 'cell' + (cells[j] ? ' on' : '');
        });
        g.appendChild(cell);
      });
      wrap.appendChild(el('div', { class: 'day' }, [days[index], g]));
    });
    function toStrings() { return grid.map(function (d) { return d.map(function (b) { return b ? '1' : '0'; }).join(''); }); }
    return { root: wrap, value: toStrings, full: function () { return toStrings().map(function () { return '1'.repeat(48); }); } };
  }
  function slotLabel(index) {
    var h = Math.floor(index / 2), m = index % 2 * 30;
    return (h < 10 ? '0' : '') + h + ':' + (m === 0 ? '00' : '30');
  }

  // —— 页面：题库 ——
  var qPage = 0, qFilter = { subject: '', search: '' };
  function renderBank() {
    refreshCommon(function () {
      var root = pageRoot(); root.innerHTML = '';
      root.appendChild(el('h2', {}, ['题库']));
      api('/api/questions?all=1&limit=3000', null, function (data) {
        store.questions = data.items || [];
        renderBankList(root);
      });
    });
  }
  function renderBankList(root) {
    var list = store.questions.filter(function (q) {
      return (!qFilter.subject || q.subject === qFilter.subject) &&
        (!qFilter.search || (q.q + (q.a || []).join('')).indexOf(qFilter.search) >= 0);
    });
    var pageSize = 30;
    var pages = Math.max(1, Math.ceil(list.length / pageSize));
    if (qPage >= pages) qPage = pages - 1;
    var subjects = [];
    store.questions.forEach(function (q) { if (subjects.indexOf(q.subject) < 0) subjects.push(q.subject); });

    var toolbar = el('div', { class: 'row', style: 'margin-bottom:12px' }, [
      el('input', { type: 'text', class: 'grow', placeholder: '搜索题干', value: qFilter.search,
        oninput: function (e) { qFilter.search = e.target.value; qPage = 0; renderBankList(root); } }),
      (function () {
        var sel = el('select', { class: 'grow' }, [el('option', { value: '' }, ['全部科目'])].concat(subjects.map(function (s) {
          var o = el('option', { value: s }, [s]); if (qFilter.subject === s) o.selected = true; return o;
        })));
        sel.addEventListener('change', function () { qFilter.subject = sel.value; qPage = 0; renderBankList(root); });
        return sel;
      })(),
      el('button', { class: 'btn', onclick: function () { editQuestion(null, function () { renderBank(); }); } }, ['新增题目']),
      el('button', { class: 'btn', onclick: importQuestions }, ['导入']),
      el('button', { class: 'btn', onclick: exportQuestions }, ['导出'])
    ]);
    root.appendChild(toolbar);
    root.appendChild(el('p', { class: 'muted' }, ['共 ' + list.length + ' 题（已暂停题目灰显），音题对应以固定 ID q_数字 命名。']));

    var table = el('table');
    table.appendChild(el('tr', {}, ['ID', '科目', '题干', '难度', '状态', '操作'].map(function (h) { return el('th', {}, [h]); })));
    list.slice(qPage * pageSize, (qPage + 1) * pageSize).forEach(function (q) {
      var row = el('tr', {}, [
        el('td', { class: 'small' }, [q.id]),
        el('td', {}, [q.subject]),
        el('td', { style: q.enabled ? '' : 'opacity:.5' }, [q.q.slice(0, 40) + (q.q.length > 40 ? '…' : '')]),
        el('td', {}, ['★'.repeat(q.difficulty || 2)]),
        el('td', {}, [q.enabled ? '启用中' : '已暂停']),
        el('td', { class: 'row' }, [
          el('button', { class: 'btn small', onclick: function () { editQuestion(q, function () { renderBank(); }); } }, ['编辑']),
          el('button', { class: 'btn small', onclick: function () {
            api('/api/questions/pause', { method: 'POST', body: { ids: [q.id], enabled: !q.enabled } }, function () { renderBank(); });
          } }, [q.enabled ? '暂停' : '启用']),
          el('button', { class: 'btn small danger', onclick: function () {
            if (!confirm('删除这道题？')) return;
            api('/api/questions/' + q.id, { method: 'DELETE' }, function () { renderBank(); });
          } }, ['删除'])
        ])
      ]);
      table.appendChild(row);
    });
    root.appendChild(el('div', { class: 'card' }, [table]));
    var pager = el('div', { class: 'pager' }, [
      el('button', { class: 'btn small', disabled: qPage === 0, onclick: function () { qPage--; renderBankList(root); } }, ['上一页']),
      el('span', { class: 'small' }, [(qPage + 1) + ' / ' + pages]),
      el('button', { class: 'btn small', disabled: qPage >= pages - 1, onclick: function () { qPage++; renderBankList(root); } }, ['下一页'])
    ]);
    root.appendChild(pager);
  }
  function exportQuestions() {
    var blob = new Blob([JSON.stringify({ version: 1, items: store.questions }, null, 2)], { type: 'application/json' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'babyontv-bank.json' });
    a.click();
  }
  function importQuestions() {
    var input = el('input', { type: 'file', accept: '.json' });
    input.addEventListener('change', function () {
      var f = input.files[0]; if (!f) return;
      f.text().then(function (text) {
        var data = JSON.parse(text);
        var items = data.items || data;
        api('/api/questions', { method: 'POST', body: { items: items } }, function (d) {
          toast('导入 ' + d.added + ' 题'); renderBank();
        });
      });
    });
    input.click();
  }
  function editQuestion(existing, done) {
    var q = existing ? JSON.parse(JSON.stringify(existing)) :
      { id: '', type: 'single', subject: '识字', q: '', a: ['选项A', '选项B', '选项C', '选项D'], k: 0, correctIndices: [0], answers: [''], difficulty: 2, tip: '' };
    var root = pageRoot(); root.innerHTML = '';
    root.appendChild(el('h2', {}, [existing ? '编辑题目 ' + existing.id : '新增题目']));
    var card = el('div', { class: 'card' });
    var type = el('select', {}, ['single:单选', 'multiple:多选', 'boolean:判断', 'text:填空', 'subjective:主观题'].map(function (t) {
      var p = t.split(':'); var o = el('option', { value: p[0] }, [p[1]]); if (q.type === p[0]) o.selected = true; return o;
    }));
    var subject = el('input', { type: 'text', value: q.subject || '' });
    var difficulty = el('input', { type: 'number', min: 1, max: 5, value: q.difficulty || 2 });
    var stem = el('textarea', { rows: 3, placeholder: '题干（可用纯文本）' }); stem.value = q.q || '';
    var optionsBox = el('div');
    var tip = el('textarea', { rows: 2, placeholder: '解析（可选）' }); tip.value = q.tip || '';
    function renderType() {
      optionsBox.innerHTML = '';
      var t = type.value;
      if (t === 'single' || t === 'multiple') {
        (q.a || ['']).forEach(function (opt, i) {
          var row = el('div', { class: 'row', style: 'margin-bottom:6px' });
          if (t === 'multiple') {
            var cb = el('input', { type: 'checkbox' }); cb.checked = (q.correctIndices || []).indexOf(i) >= 0;
            row.appendChild(el('label', { class: 'row' }, [cb, el('span', { class: 'small' }, ['正确'])]));
          } else {
            var radio = el('input', { type: 'radio', name: 'correct' }); radio.checked = q.k === i;
            radio.addEventListener('change', function () { q.k = i; });
            row.appendChild(el('label', { class: 'row' }, [radio, el('span', { class: 'small' }, ['正确'])]));
          }
          var text = el('input', { type: 'text', class: 'grow', value: opt });
          text.addEventListener('input', function () { q.a[i] = text.value; });
          row.appendChild(text);
          optionsBox.appendChild(row);
        });
        var add = el('button', { class: 'btn small', onclick: function () { q.a.push(''); cbSaved(); renderType(); } }, ['加选项']);
        optionsBox.appendChild(add);
        function cbSaved() { if (type.value === 'multiple') q.correctIndices = (q.correctIndices || []).filter(function (i) { return i < q.a.length; }); }
      } else if (t === 'boolean') {
        optionsBox.appendChild(el('p', { class: 'muted' }, ['判断题固定为 正确 / 错误，选择正确答案：']));
        var sel = el('select', {}, [el('option', { value: '0' }, ['正确']), el('option', { value: '1' }, ['错误'])]);
        sel.value = String(q.k === 1 ? 1 : 0);
        sel.addEventListener('change', function () { q.k = +sel.value; });
        optionsBox.appendChild(sel);
      } else if (t === 'text') {
        var ta = el('textarea', { rows: 2, placeholder: '可接受答案，每行一个' });
        ta.value = (q.answers || []).join('\n');
        ta.dataset.for = 'answers';
        optionsBox.appendChild(ta);
      } else {
        var model = el('textarea', { rows: 3, placeholder: '参考答案' }); model.value = q.modelAnswer || '';
        var rubric = el('textarea', { rows: 2, placeholder: '评分标准（可选）' }); rubric.value = q.rubric || '';
        model.dataset.for = 'modelAnswer'; rubric.dataset.for = 'rubric';
        optionsBox.appendChild(model); optionsBox.appendChild(rubric);
      }
    }
    renderType();
    card.appendChild(el('label', { class: 'field' }, [el('span', {}, ['题型']), type]));
    card.appendChild(el('label', { class: 'field' }, [el('span', {}, ['科目']), subject]));
    card.appendChild(el('label', { class: 'field' }, [el('span', {}, ['难度（1-5）']), difficulty]));
    card.appendChild(el('label', { class: 'field' }, [el('span', {}, ['题干']), stem]));
    card.appendChild(el('div', { class: 'field' }, [el('span', {}, ['选项与答案']), optionsBox]));
    card.appendChild(el('label', { class: 'field' }, [el('span', {}, ['解析']), tip]));
    card.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn primary', onclick: function () {
        var payload = { subject: subject.value || '常识', difficulty: +difficulty.value || 2, q: stem.value.trim(), tip: tip.value.trim(), type: type.value };
        if (existing) payload.id = existing.id;
        var t = type.value;
        if (t === 'single') payload.a = q.a.slice(); payload.k = q.k;
        if (t === 'multiple') { payload.a = q.a.slice(); payload.correctIndices = collectChecks(); }
        if (t === 'boolean') payload.k = q.k;
        if (t === 'text') payload.answers = collectTextarea('answers');
        if (t === 'subjective') { payload.modelAnswer = collectTextarea('modelAnswer'); payload.rubric = collectTextarea('rubric'); }
        api('/api/questions', { method: 'POST', body: payload }, function (d) {
          if (d.error) { toast(d.message || '保存失败'); return; }
          toast('已保存'); done();
        });
        function collectChecks() {
          var list = [];
          [].forEach.call(optionsBox.querySelectorAll('input[type=checkbox]'), function (cb, i) { if (cb.checked) list.push(i); });
          return list.length ? list : [0];
        }
        function collectTextarea(key) {
          var node = optionsBox.querySelector('[data-for="' + key + '"]');
          return node ? node.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : [];
        }
      } }, ['保存']),
      el('button', { class: 'btn', onclick: function () { renderBank(); } }, ['取消'])
    ]));
    root.appendChild(card);
  }

  // —— 页面：批改 ——
  function renderGrading() {
    api('/api/grading', null, function (g) {
      api('/api/reviews?state=pending', null, function (r) {
        store.reviews = r.items || [];
        api('/api/reviews?state=all', null, function (ra) {
          renderGradingUI(g, ra.items || []);
        });
      });
    });
  }
  function renderGradingUI(g, allReviews) {
    var root = pageRoot(); root.innerHTML = '';
    root.appendChild(el('h2', {}, ['批改']));
    var pendingReviews = store.reviews;
    root.appendChild(el('p', { class: 'muted' }, ['主观题与手写题需要家长或 AI 批改。当前待批 ' + pendingReviews.length + ' 题。']));
    var listCard = el('div', { class: 'card' });
    pendingReviews.slice(0, 20).forEach(function (rv) {
      var q = rv.question || {};
      listCard.appendChild(el('div', { class: 'qcard' }, [
        el('div', { class: 'meta' }, [el('span', { class: 'tag' }, [q.subject || '']), el('span', {}, [new Date(rv.ts).toLocaleString()])]),
        el('div', { class: 'stem' }, [q.q || '']),
        el('div', { class: 'muted', style: 'margin-bottom:8px' }, ['学生答案：']),
        rv.input && rv.input.drawing ? el('img', { src: rv.input.drawing, style: 'max-height:200px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px' }) : null,
        el('p', {}, [rv.input ? rv.input.text : '']),
        (function () {
          var score = el('input', { type: 'number', min: 0, max: 100, placeholder: '0-100', style: 'width:90px' });
          var feedback = el('input', { type: 'text', class: 'grow', placeholder: '批改意见（可选）' });
          return el('div', { class: 'row' }, [
            score, feedback,
            el('button', { class: 'btn primary small', onclick: function () {
              if (score.value === '') { toast('请填分数'); return; }
              api('/api/reviews/' + rv.id, { method: 'POST', body: { score: +score.value, feedback: feedback.value } },
                function () { toast('已批改'); renderGrading(); });
            } }, ['提交']),
            el('button', { class: 'btn small', onclick: function () {
              api('/api/reviews/' + rv.id + '/retry', { method: 'POST', body: {} }, function () { toast('已重试 AI 批改'); renderGrading(); });
            } }, ['AI 重试'])
          ]);
        })()
      ]));
    });
    if (!pendingReviews.length) listCard.appendChild(el('p', { class: 'muted' }, ['暂无待批题目。 recent 已批 ' + allReviews.filter(function (x) { return x.state === 'graded'; }).length + ' 题。']));
    root.appendChild(listCard);

    // AI 配置
    var ai = el('div', { class: 'card' });
    var mode = el('select', {}, [['manual', '家长手动批改'], ['ai', 'AI 自动批改']].map(function (o) {
      var opt = el('option', { value: o[0] }, [o[1]]); if (g.mode === o[0]) opt.selected = true; return opt;
    }));
    var provider = el('select', {}, (g.providers || []).map(function (p) {
      var opt = el('option', { value: p.id }, [p.note ? p.name + '（' + p.note + '）' : p.name]); if (g.provider === p.id) opt.selected = true; return opt;
    }));
    var endpoint = el('input', { type: 'text', value: g.endpoint || '', placeholder: '基础地址，例如 https://api.deepseek.com/v1' });
    var model = el('input', { type: 'text', value: g.model || '', placeholder: '模型名' });
    var apiKey = el('input', { type: 'password', placeholder: g.hasKey ? '已保存（留空沿用，需更换时填写）' : 'API Key' });
    var passScore = el('input', { type: 'number', min: 1, max: 100, value: g.passScore || 60, style: 'width:90px' });
    var vision = el('input', { type: 'checkbox' }); vision.checked = !!g.vision;
    ai.appendChild(el('div', { class: 'row' }, [el('label', { class: 'field grow' }, [el('span', {}, ['批改方式']), mode])]));
    ai.appendChild(el('div', { class: 'row' }, [el('label', { class: 'field grow' }, [el('span', {}, ['服务商预设']), provider])]));
    ai.appendChild(el('label', { class: 'field' }, [el('span', {}, ['接口地址']), endpoint]));
    ai.appendChild(el('div', { class: 'row' }, [
      el('label', { class: 'field grow' }, [el('span', {}, ['模型']), model]),
      el('label', { class: 'field grow' }, [el('span', {}, ['API Key']), apiKey])
    ]));
    ai.appendChild(el('div', { class: 'row' }, [
      el('label', { class: 'row' }, [vision, el('span', {}, ['模型支持图像（手写题）'])]),
      el('label', { class: 'row' }, [el('span', {}, ['及格分']), passScore])
    ]));
    provider.addEventListener('change', function () {
      var p = (g.providers || []).find(function (x) { return x.id === provider.value; });
      if (p) { if (p.baseUrl) endpoint.value = p.baseUrl; if (p.model) model.value = p.model; }
    });
    ai.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn primary', onclick: function () {
        var body = { mode: mode.value, provider: provider.value, endpoint: endpoint.value.trim(), model: model.value.trim(), vision: vision.checked, passScore: +passScore.value };
        if (apiKey.value.trim()) body.apiKey = apiKey.value.trim();
        api('/api/grading', { method: 'PUT', body: body }, function () { toast('已保存批改配置'); renderGrading(); });
      } }, ['保存']),
      el('button', { class: 'btn', onclick: function () {
        api('/api/grading/test', { method: 'POST', body: { endpoint: endpoint.value.trim(), model: model.value.trim(), apiKey: apiKey.value.trim(), vision: vision.checked } },
          function (d) { toast(d.ok ? '测试成功 ' + d.ms + 'ms' : '测试失败：' + d.message); });
      } }, ['测试连接']),
      el('button', { class: 'btn', onclick: function () {
        api('/api/grading/models', { method: 'POST', body: { endpoint: endpoint.value.trim(), apiKey: apiKey.value.trim() } }, function (d) {
          if (!d.ok) { toast(d.message || '获取失败'); return; }
          var names = d.items; if (names.length > 12) names = names.slice(0, 12);
          toast('可用模型（前12）：' + names.join(', '));
        });
      } }, ['获取模型列表'])
    ]));
    root.appendChild(ai);
  }

  // —— 页面：记录 ——
  function renderRecords() {
    api('/api/history?days=14', null, function (h) {
      api('/api/events?limit=60', null, function (e) {
        var root = pageRoot(); root.innerHTML = '';
        root.appendChild(el('h2', {}, ['记录']));
        var table = el('table');
        table.appendChild(el('tr', {}, ['天', '使用(分)', '答题', '正确率', '组数'].map(function (x) { return el('th', {}, [x]); })));
        h.items.forEach(function (d) {
          table.appendChild(el('tr', {}, [
            d.label, (d.usedMinutes || 0).toFixed(0), String(d.answered || 0),
            (d.answered ? Math.round(d.correct * 100 / d.answered) : 0) + '%', String(d.rounds || 0)
          ].map(function (v) { return el('td', {}, [String(v)]); })));
        });
        root.appendChild(el('div', { class: 'card' }, [table]));
        var et = el('table');
        et.appendChild(el('tr', {}, ['时间', '事件'].map(function (x) { return el('th', {}, [x]); })));
        (e.items || []).forEach(function (ev) {
          et.appendChild(el('tr', {}, [el('td', { class: 'small' }, [new Date(ev.ts).toLocaleString()]),
            el('td', {}, [ev.type + ' ' + JSON.stringify(ev.payload).slice(0, 80)])]));
        });
        root.appendChild(el('div', { class: 'card' }, [el('h3', {}, ['最近事件']), et]));
      });
    });
  }

  // —— 页面：设备 ——
  function renderDevice() {
    api('/api/device', null, function (d) {
      api('/api/integration', null, function (ig) {
        api('/api/update', null, function (up) {
          api('/api/holidays', null, function (hol) {
            var root = pageRoot(); root.innerHTML = '';
            root.appendChild(el('h2', {}, ['设备']));
            var m = d.monitor || {};
            root.appendChild(el('div', { class: 'card' }, [
              el('h3', {}, [d.name + '（' + d.ip + ':' + d.port + '）']),
              kvList([
                ['应用版本', 'v' + d.version + ' · ' + (d.flavor === 'tv' ? '电视版' : '手机版')],
                ['拦截服务', m.service ? '✅ 运行中' : '⛔ 未运行'],
                ['悬浮窗', m.overlay ? '✅ 已授权' : '⛔ 缺失'],
                ['无障碍', m.accessibilityEnabled ? '✅ 已开启' : '⛔ 未开启'],
                ['使用情况', m.usage ? '✅ 已授权' : '⛔ 未授权'],
                ['开机自启', d.uninstallProtected !== undefined ? (d.autostart && d.autostart.ok ? '✅ 正常' : '⚠ 可能被拦截') : ''],
                ['防卸载', d.uninstallProtected ? '✅ 开启' : '未开启'],
                ['内置节假日', (hol.year || '—') + ' 年（' + (hol.count || 0) + ' 个假日）']
              ], root),
              el('div', { class: 'row', style: 'margin-top:10px' }, [
                el('button', { class: 'btn small', onclick: function () {
                  if (confirm('关闭防卸载？关闭后可以直接卸载本应用。')) {
                    api('/api/device/uninstall-guard', { method: 'DELETE' }, function () { toast('已关闭'); renderDevice(); });
                  }
                } }, ['关闭防卸载'])
              ])
            ]));

            // 集成令牌
            ig = ig || {};
            var igCard = el('div', { class: 'card' }, [el('h3', {}, ['集成令牌（Home Assistant 等）'])]);
            igCard.appendChild(kvList([
              ['状态', ig.enabled ? '启用' : '关闭'],
              ['令牌', ig.hasToken ? (ig.hint + ' · ' + new Date(ig.createdAt).toLocaleDateString()) : '未生成'],
              ['权限', (ig.read ? '只读 ' : '') + (ig.control ? '控制' : '')]
            ], igCard, 'small'));
            var ctl = el('div', { class: 'row' }, [
              el('button', { class: 'btn small primary', onclick: function () {
                api('/api/integration', { method: 'POST', body: { read: true, control: true } }, function (r) {
                  toast('新令牌（只显示一次）：<br>' + r.token); renderDevice();
                });
              } }, ['生成新令牌']),
              ig.enabled ? el('button', { class: 'btn small', onclick: function () {
                api('/api/integration', { method: 'PUT', body: { enabled: false } }, function () { toast('已停用'); renderDevice(); });
              } }, ['停用']) : el('button', { class: 'btn small', onclick: function () {
                api('/api/integration', { method: 'PUT', body: { enabled: true } }, function () { toast('已启用'); renderDevice(); });
              } }, ['启用']),
              el('button', { class: 'btn small danger', onclick: function () {
                api('/api/integration', { method: 'DELETE' }, function () { toast('已吊销'); renderDevice(); });
              } }, ['吊销'])
            ]);
            igCard.appendChild(ctl);
            root.appendChild(igCard);

            // 更新
            var upCard = el('div', { class: 'card' }, [el('h3', {}, ['应用更新'])]);
            upCard.appendChild(kvList([
              ['当前版本', 'v' + up.current],
              ['最新版本', up.latest ? 'v' + up.latest : '未获取'],
              ['状态', up.hasUpdate ? '有新版本' : '已是最新'],
              ['来源', up.source || '—']
            ], upCard, 'small'));
            upCard.appendChild(el('div', { class: 'row' }, [
              el('button', { class: 'btn small primary', onclick: function () {
                api('/api/update/check', { method: 'POST' }, function () { toast('检查中…'); setTimeout(renderDevice, 2500); });
              } }, ['检查更新'])
            ]));
            var apiInput = el('input', { type: 'text', class: 'grow', value: up.api, placeholder: '（可选）自定义 update.json 地址，https:// 开头' });
            upCard.appendChild(el('label', { class: 'field' }, [el('span', {}, ['自定义检查地址']), apiInput]));
            var mirrors = el('textarea', { rows: 2, placeholder: '（可选）镜像地址，每行一个，https:// 开头' });
            mirrors.value = (up.mirrors || []).join('\n');
            upCard.appendChild(el('label', { class: 'field' }, [el('span', {}, ['镜像']), mirrors]));
            upCard.appendChild(el('button', { class: 'btn small', onclick: function () {
              api('/api/update', { method: 'PUT', body: { api: apiInput.value, mirrors: mirrors.value } }, function () { toast('已保存'); renderDevice(); });
            } }, ['保存设置']));
            root.appendChild(upCard);

            function kvList(pairs, hostRoot, cls) {
              var t = el('table');
              pairs.forEach(function (p) {
                t.appendChild(el('tr', {}, [el('td', { class: cls || '' }, [p[0]]), el('td', { class: cls || '' }, [p[1]])]));
              });
              var node = el('div', {}, [t]);
              (hostRoot || node).appendChild ? (function () {
                if (hostRoot) hostRoot.appendChild(node);
                return node;
              })() : node;
              return node;
            }
          });
        });
      });
    });
  }

  // —— 页面：日志 ——
  function renderLogs() {
    api('/api/logs?limit=800', null, function (data) {
      var root = pageRoot(); root.innerHTML = '';
      root.appendChild(el('h2', {}, ['运行日志']));
      var filter = el('input', { type: 'text', class: 'grow', placeholder: '关键词过滤',
        onkeydown: function (e) { if (e.key === 'Enter') renderLogs(); } });
      root.appendChild(el('div', { class: 'row', style: 'margin-bottom:10px' }, [
        filter,
        el('button', { class: 'btn small', onclick: renderLogs }, ['刷新']),
        el('button', { class: 'btn small danger', onclick: function () {
          api('/api/logs', { method: 'DELETE' }, function () { toast('已清空'); renderLogs(); });
        } }, ['清空日志']),
        el('button', { class: 'btn small', onclick: function () {
          window.open('http://' + host + ':' + port + '/api/logs/export', '_blank');
        } }, ['导出 ZIP'])
      ]));
      var pre = el('pre', { style: 'background:#1a1b1e;color:#d6d8dc;padding:14px;border-radius:10px;max-height:56vh;overflow:auto;font-size:12px;font-family:Consolas,monospace' });
      pre.textContent = (data.lines || []).join('\n') || '（暂无日志）';
      root.appendChild(pre);
      if (window.__qFilter !== undefined && window.__qFilter) pre.textContent = pre.textContent.split('\n').filter(function (l) { return l.toLowerCase().indexOf(window.__qFilter) >= 0; }).join('\n');
    });
  }

  function renderPage() {
    var map = { overview: renderOverview, rules: renderRules, bank: renderBank, grading: renderGrading, records: renderRecords, device: renderDevice, logs: renderLogs };
    (map[page] || renderOverview)();
  }

  function boot() {
    api('/api/state', null, function (data) {
      if (!data.config) { logout(true); return; }
      store.config = data.config; store.state = data;
      api('/api/device', null, function (d) { store.device = d; renderFrame(); });
    });
  }

  document.body.appendChild(el('div', { id: 'root' }));
  token = localStorage.getItem('botv-panel-token') || '';
  if (token) {
    fetch('http://' + host + ':' + port + '/api/state', { headers: { 'X-Admin-Token': token } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.config) boot(); else { token = ''; renderLogin(); } })
      .catch(function () { renderLogin(); });
  } else renderLogin();
})();
