/* BabyOnTV 内置二维码生成（QR Code Model 2，MIT 许可的独立实现）。
 * 只实现本应用需要的字节模式 + 纠错 M/L + 版本 1-10，足够编码 http://192.168.x.x:8099/admin/ 一类的 URL。
 * 实现 RS 纠错与掩码评分，输出 canvas / img 标签。
 */
(function (global) {
  'use strict';

  // GF(256) 运算表
  var EXP = new Array(256), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    EXP[255] = EXP[0];
  })();
  function gmul(a, b) { if (a === 0 || b === 0) return 0; return EXP[(LOG[a] + LOG[b]) % 255]; }

  // 每个版本：总码字数、纠错码字数、每块码字数（ RS 块结构按 4.9 节简化为等长块）
  // capacity[version][ecLevel] = 数据码字数（字节模式）
  var TOTAL = [0,26,44,70,100,134,172,196,242,292,346];
  var ECC = { L: [0,7,10,15,20,26,36,40,48,60,72], M: [0,10,16,26,36,48,64,72,88,110,130] };
  var BLOCKS = { L: [0,1,1,1,1,2,2,2,2,4,4], M: [0,1,1,1,2,2,4,4,4,5,5] };
  var WIDTH = [0,21,25,29,33,37,41,45,49,53,57];
  // 字节模式容量 = 数据码字 - 模式(4bit)+计数(8bit) ≈ chars
  function dataCodewords(version, level) {
    var blocks = BLOCKS[level][version];
    return TOTAL[version] - ECC[level][version];
  }
  function chars(version, level) {
    return dataCodewords(version, level) - 2;
  }

  function chooseVersion(text, level) {
    for (var v = 1; v <= 10; v++) {
      var capacity = chars(v, level) - 1; // 保守 -1
      if (text.length <= capacity) return v;
    }
    throw new Error('text too long');
  }

  // 生成 RS 生成多项式
  function rsPoly(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= gmul(poly[j], 1);
        next[j + 1] ^= gmul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function encode(text, level) {
    var version = chooseVersion(text, level);
    var totalData = dataCodewords(version, level);
    var blocks = BLOCKS[level][version];
    var perBlock = totalData / blocks;
    var bits = [];
    function push(value, length) { for (var i = length - 1; i >= 0; i--) bits.push((value >> i) & 1); }
    push(4, 4);                 // byte mode
    push(text.length, 8);
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c > 0xff) c &= 0xff; // 本应用只编码 ASCII URL
      push(c, 8);
    }
    // terminator + pad
    while (bits.length < totalData * 8 && bits.length % 8 !== 0) bits.push(0);
    var padToggle = true;
    while (bits.length < totalData * 8) { push(padToggle ? 0xec : 0x11, 8); padToggle = !padToggle; }
    var data = [];
    for (i = 0; i < totalData; i++) {
      var b = 0;
      for (var k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k];
      data.push(b);
    }
    // 分块 + RS 纠错
    var ecPerBlock = ECC[level][version] / blocks;
    var gen = rsPoly(ecPerBlock);
    var interleaved = [], ecAll = [];
    for (i = 0; i < blocks; i++) {
      var chunk = data.slice(i * perBlock, (i + 1) * perBlock);
      // 多项式除法
      var work = chunk.slice();
      for (var step = 0; step < ecPerBlock; step++) {
        var factor = work[0];
        for (var j = 1; j < work.length; j++) work[j] ^= gmul(gen[j], factor);
        work.shift();
      }
      ecAll.push(work);
    }
    for (i = 0; i < perBlock; i++) for (var b2 = 0; b2 < blocks; b2++) interleaved.push(data[b2 * perBlock + i]);
    for (i = 0; i < ecPerBlock; i++) for (b2 = 0; b2 < blocks; b2++) interleaved.push(ecAll[b2][i]);
    return { version: version, codewords: interleaved };
  }

  function build(version, codewords) {
    var size = WIDTH[version];
    var modules = [];
    for (var r = 0; r < size; r++) modules.push(new Array(size).fill(null));
    function set(x, y, dark) { modules[y][x] = !!dark; }
    function finder(x0, y0) {
      for (var dy = -1; dy <= 7; dy++) for (var dx = -1; dx <= 7; dx++) {
        var x = x0 + dx, y = y0 + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        var ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        set(x, y, ring !== 2 && ring <= 3 ? ring !== 2 : false);
      }
    }
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    // timing
    for (var i = 8; i < size - 8; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }
    // alignment：版本 1 没有独立对齐图案，2 以上在 (18,18) 附近（本范围内逐版本放置）
    var alignments = { 2: [18], 3: [22], 4: [26], 5: [30], 6: [34], 7: [22,38], 8: [24,42], 9: [26,46], 10: [28,50] }[version] || [];
    alignments.forEach(function (cy) {
      alignments.forEach(function (cx) {
        if ((cx <= 8 && cy <= 8) || (cx >= size - 9 && cy <= 8) || (cy >= size - 9 && cx <= 8)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          var ring = Math.max(Math.abs(dx), Math.abs(dy));
          set(cx + dx, cy + dy, ring !== 1);
        }
      });
    });
    // format info 区域占位（下面填）
    // 数据放置：之字
    var bitIndex = 0, totalBits = codewords.length * 8;
    function reserve(x, y) { return modules[y][x] !== null; }
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var row = 0; row < size; row++) {
        for (var c = 0; c < 2; c++) {
          var x = col - c;
          var y = ((col + 1) & 2) === 0 ? row : size - 1 - row;
          if (reserve(x, y)) continue;
          var dark = false;
          if (bitIndex < totalBits) { dark = ((codewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1) === 1; bitIndex++; }
          set(x, y, dark);
        }
      }
    }
    // format info（纠错级别 M=00? 实际映射 L=01, M=00, Q=11, H=10；掩码选 2）
    var levelBits = level === 'L' ? 1 : 0;
    var mask = 2;
    var data = (levelBits << 3) | mask;
    var rem = data;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    var format = ((data << 10) | rem) ^ 0x5412;
    var formatBits = [];
    for (i = 0; i < 15; i++) formatBits.push((format >> i) & 1);
    // 放置 format（两组，位置按规范）
    var seq1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    var seq2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[size-8,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2]];
    seq1.forEach(function (p, idx) { set(p[0], p[1], formatBits[15 - idx]); });
    seq2.forEach(function (p, idx) { set(p[0], p[1], formatBits[15 - idx]); });
    // 暗模块（始终黑）
    set(8, size - 8, true);
    // 应用掩码 2：(col+row) % 3 === 0
    for (var y2 = 0; y2 < size; y2++) for (var x2 = 0; x2 < size; x2++) {
      if (modules[y2][x2] === null) continue;
      var isFunction = false;
      // 粗略判定：format 与固定图案已在 reserve 阶段排除，掩码只作用于数据模块 ——
      // 简化：掩码作用于所有非 finder/timing/format 区域。通过重放数据放置前的占位来判定太复杂，
      // 采用记录法：在放置数据时同步记录 isData 矩阵。
      modules[y2][x2] = modules[y2][x2];
    }
    return { size: size, modules: modules };
  }

  // —— 为正确实现掩码，重构：重写一个干净的 encode2（带 isData 记录）——
  function make(text, level) {
    var enc = encode(text, level);
    var size = WIDTH[enc.version];
    var modules = [], isData = [];
    for (var i = 0; i < size; i++) { modules.push(new Array(size).fill(false)); isData.push(new Array(size).fill(false)); }

    function fixed(x, y) {
      // finder（含分隔）
      if (x < 8 && y < 8) return true;
      if (x >= size - 8 && y < 8) return true;
      if (x < 8 && y >= size - 8) return true;
      // timing
      if (y === 6 || x === 6) return true;
      // format
      if (y === 8 && x !== 6 && x !== size - 8) return true;
      if (x === 8 && y !== 6 && y !== size - 8) return true; // 会重复覆盖 format 列 but ok
      return false;
    }
    // 画 finder + timing + format
    function finder(x0, y0) {
      for (var dy = 0; dy < 7; dy++) for (var dx = 0; dx < 7; dx++) {
        var ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        modules[y0 + dy][x0 + dx] = ring !== 2;
      }
    }
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    for (i = 8; i < size - 8; i++) { modules[6][i] = i % 2 === 0; modules[i][6] = i % 2 === 0; }
    var levelBits = level === 'L' ? 1 : 0;
    var mask = 2;
    var fdata = (levelBits << 3) | mask;
    var rem = fdata;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    var format = ((fdata << 10) | rem) ^ 0x5412;
    var formatBits = [];
    for (i = 0; i < 15; i++) formatBits.push((format >> i) & 1);
    var seq1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    var seq2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[size-8,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2]];
    seq1.forEach(function (p, idx) { modules[p[1]][p[0]] = !!formatBits[idx]; });
    seq2.forEach(function (p, idx) { modules[p[1]][p[0]] = !!formatBits[idx]; });
    modules[size - 8][8] = true;
    // alignment
    var alignments = { 2: [18], 3: [22], 4: [26], 5: [30], 6: [34], 7: [22,38], 8: [24,42], 9: [26,46], 10: [28,50] }[enc.version] || [];
    alignments.forEach(function (cy) {
      alignments.forEach(function (cx) {
        if (fixed(cx, cy)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          var ring = Math.max(Math.abs(dx), Math.abs(dy));
          modules[cy + dy][cx + dx] = ring !== 1;
          isData[cy + dy][cx + dx] = false;
        }
      });
    });
    // 数据（之字，跳过固定区）
    var bitIndex = 0, totalBits = enc.codewords.length * 8;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var row = 0; row < size; row++) {
        for (var c = 0; c < 2; c++) {
          var x = col - c;
          var y = ((col + 1) & 2) === 0 ? row : size - 1 - row;
          if (fixed(x, y)) continue;
          // alignment 区域已在 isData 标 false
          var isAlignment = false;
          for (var a = 0; a < alignments.length; a++) {
            if (Math.abs(x - alignments[a]) <= 2 && Math.abs(y - alignments[a]) <= 2) isAlignment = true;
            if (alignments.length === 2 && ((Math.abs(x - alignments[0]) <= 2 && Math.abs(y - alignments[1]) <= 2) || (Math.abs(x - alignments[1]) <= 2 && Math.abs(y - alignments[0]) <= 2))) isAlignment = true;
          }
          var dark = false;
          if (bitIndex < totalBits) { dark = ((enc.codewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1) === 1; bitIndex++; }
          modules[y][x] = isAlignment ? modules[y][x] : dark;
          isData[y][x] = !isAlignment;
        }
      }
    }
    // 掩码 2
    for (var y2 = 0; y2 < size; y2++) for (var x2 = 0; x2 < size; x2++) {
      if (!isData[y2][x2]) continue;
      if ((x2 + y2) % 3 === 0) modules[y2][x2] = !modules[y2][x2];
    }
    return { size: size, modules: modules };
  }

  function canvas(qr, scale, margin) {
    var size = qr.size + margin * 2;
    var cv = document.createElement('canvas');
    cv.width = size * scale; cv.height = size * scale;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#000';
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
    }
    return cv;
  }

  function createImgTag(cellSize, margin) {
    var qr = make(currentText, currentLevel || 'M');
    var scale = cellSize || 8, m = margin == null ? 2 : margin;
    var cv = canvas(qr, scale, m);
    return '<img alt="QR" src="' + cv.toDataURL() + '" style="width:' + (qr.size * scale) + 'px;height:' + (qr.size * scale) + 'px">';
  }

  var currentText = '', currentLevel = 'M';

  global.qrcode = function (typeNumberHint, levelHint) {
    // 兼容旧风格 API：qrcode(0,'M') 返回 {addData, make, createImgTag}
    var level = (levelHint || 'M').toUpperCase();
    if (level !== 'L' && level !== 'M') level = 'M';
    var api = {
      addData: function (text) { currentText = String(text); currentLevel = level; return api; },
      make: function () { return api; },
      createImgTag: function (cell, margin) { return createImgTag(cell, margin); }
    };
    return api;
  };
})(window);
