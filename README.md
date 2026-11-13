# BabyOnTV

面向 **3~6 岁** 的电视 / 平板 / 手机启蒙应用：**识字 + 英语 + 书写练习**。
题库与语音全部离线，孩子用遥控器 `← → ▲ ▼` 选、`OK` 确认即可。

> 本项目从第一行代码起就是独立版权作品：Kotlin 原生工程、孩子端网页、家长面板全部自行编写，
> 不包含任何第三方应用源码。仅引用了保持原许可证的公开数据与工具库（见
> [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)），所有引用均为 MIT / CC0 等宽松许可。

---

## 功能

- **多种玩法**：按组闯关、连续答对、自由练习；每组题量、及格比例、每日组数、每日时长可调。
- **时段管控**：按周设置可用时段（30 分钟粒度），可区分「仅时段内可用」与「仅时段内需要答题」，法定节假日可按周日安排。
- **奖励与加练**：每次解锁时长、按难度奖励、答错累计加练、间隔重复复习（SuperMemo-2 式调度）。
- **家长面板**：设备局域网 `http://<设备IP>:8099/admin/`，规则、题库、批改、记录、设备诊断都在这里。
- **主观题**：家长批改 / Agent 批改 / 兼容 DeepSeek 等 OpenAI 风格 API。
- **守护**：开机、覆盖升级、屏幕点亮、网络变化时恢复管理服务；可选悬浮窗/无障碍/使用情况权限。
- **离线语音**：题干出现即播报；`←/→` 切换选项时播报该选项；答对/答错播放反馈音。
- **防走失**：答题解锁后自动回到解题前的画面；家长可远程临时解锁 / 锁定 / 关闭管控。

## 目录结构

```
app/web/         孩子端界面（HTML/CSS/JS，手写、零依赖）
app/native/      Android 工程（tv / mobile 两个 flavor，Kotlin，无第三方依赖）
admin/           家长管理面板（HTML/CSS/JS，手写、零依赖）
data/seed.json   题库（每题带固定 id q_0…，语音即按 id 命名）
data/audio/      离线语音 mp3
data/holidays/   法定节假日内置数据（holiday-cn，CC0）
scripts/         语音生成、截图、更新清单脚本
```

## 题库与语音

- 题库唯一入口：`data/seed.json`。
- 音频目录：`data/audio/`，命名与题库一一对应：
  - 题干：`q_<id>.mp3`
  - 选项：`q_<id>_opt_<序号>.mp3`
  - 反馈：`sfx_correct.mp3` / `sfx_wrong.mp3`
- 重新生成语音（需要 Python 3.8+ 与 `edge-tts`，或替换成你自己的 TTS 管线）：

  ```powershell
  pip install edge-tts
  python scripts/generate_audio.py     # 会清空并全量重建 data/audio
  ```

- 构建前会自动校验「题库 ↔ 音频」一一对应（CI 同样校验，缺一个文件就失败）。

## 安装

- 从 [Releases](https://github.com/RonL89/BabyOnTV/releases/latest) 下载：
  - 电视：`BabyOnTV-TV-v*.apk`（U 盘或 ADB 安装）
  - 手机 / 平板：`BabyOnTV-Mobile-v*.apk`
- 首次打开：设置管理密码 → 按需开启权限 → 开始使用。
- 升级：应用内「检查更新」会读取本仓库的 Release（`-TV-` / `-Mobile-` 资产）。

## 家长面板与权限

- 电视上：品牌位连点 5 次，或在最上方连按 `↑` 5 次 → 家长验证；长按屏幕顶部区域或按 `MENU` → 家长快捷面板。
- 手机 / 平板：点右上角「家长」进入验证。
- 手机扫码/浏览器打开 `http://<设备IP>:8099/admin/`，输入管理密码。
- 权限（可选，但管控生效需要）：悬浮窗、使用情况访问、无障碍、后台运行/自启动。
  ADB 一条龙脚本见 [LLM.md](LLM.md)。

## 构建与发版

- 本仓库通过 GitHub Actions 构建（`.github/workflows/build.yml`）：
  - 版本：tag > 仓库根 `version.txt` > `1.0.<run>`；`versionCode = 10000 + run`（单调递增，保证覆盖安装生效）
  - 签名：GitHub Secrets `KEYSTORE_BASE64 / KEYSTORE_PASS / KEY_ALIAS / KEY_PASS`
  - 产物：`BabyOnTV-TV-v*.apk`、`BabyOnTV-Mobile-v*.apk`、`SHA256SUMS.txt`，自动发布 Release
- 本地构建需要 JDK 17 + Android SDK 36 + Gradle 8.14.x：

  ```powershell
  cd app/native
  gradle :app:assembleTvRelease :app:assembleMobileRelease
  ```

## 版本历史

### v1.1.0 (2026-11-13) — 电视实测 7 项问题修复（全屏 / 读题 / 遥控器 / 刷新 / 导出 / 权限入口）

> 上一版申报的修复只留在工作区、从未进过设备；本版重新实现并全部打包验证。

- **修复「题目只显示左上角」**：`.screen` 不再用 `inset` 简写（老电视 WebView 不认，整屏塌成左上角一小块），改 `top/right/bottom/left:0`；`.screen` 成为唯一滚动容器并自带顶栏留白，`body{padding-top}` 对 fixed 子元素无效的问题一并消除；答题/锁定/配对页统一 flex 纵向居中
- **修复「出题不读题」**：`AudioPlayer` 改为串行播放队列——题干音与反馈音优先并清空积压，选项音排队等题干播完，不再出现「后一条请求把题干音当场掐掉」；首次落焦不抢读，遥控器移动焦点才播报选项
- **修复「答题页不停刷新」**：轮询比对键从 `mode+at`（毫秒时间戳）改为 `mode+until`，并加首轮基线；同一道题（id+nonce 未变）不再重画、不再重播语音；`onNewIntent` 同页不再二次 loadUrl
- **修复「日志无法导出」**：`Diag.export()` 全程容错（单个文件失败不再产出半截 zip）并新增人可读 `report.txt`；电视 WebView 里下载走原生 `downloadFile` 桥落盘；`/api/logs/export` 支持 `?token=`
- **修复「Broken pipe 刷屏」**：客户端断开不再记 ERROR；同类日志 10 秒折叠；`handle()` 空 catch 改为真实异常留痕；线程池改可伸缩
- **修复「权限开关遥控器不能操作」**：新增电视端原生「权限与设置」页（`SettingsActivity`），遥控器上下选中、确定直达系统设置页；跳转逻辑统一收敛到 `PermissionIntents`（多厂商 Intent 回退链）；家长连接页与配对页均补原生入口；面板权限矩阵改走原生桥，手机浏览器打开时给出明确指引
- **新增「题目自动朗读」真实开关**：`ttsEnabled` 此前不在 `saveConfig` 白名单里，保存即丢弃；现已入默认值与白名单，学习语音频按开关生效
- **面板遥控器可用**：新增焦点导航引擎（方向键移动、OK/空格确认、Esc 关闭对话框），异步渲染后自动重扫；`switchRow`、导航、按钮、对话框均加 `focusable`
- **收窄误触**：长按唤出家长快捷面板仅限屏幕顶部 12% 区域，孩子在选项上按住不再弹出
- **工程**：`/api/device` 补 `arch`/WebView 版本（关于页不再显示「—」）；`version.txt` 钉版本号（tag > version.txt > 1.0.<run>）；`node --check` + `panel-smoke` 9/9 + `testTvDebugUnitTest` 全绿

> 只改 `admin/` 前端与本地调试脚本，未动 Kotlin、接口与数据格式；已发布签名包的 `assets/admin/` 与仓库文件逐字节一致。

- **重设计**：家长面板换成「暖橙米白 · 亲子手账」视觉 — 米白底 + 暖橙主色，桌面 232px 侧栏、手机顶部 chip 导航，卡片化排版，浅色单主题
- **重排七页**：概览（状态卡 + 5 项统计 + 7 日柱状图 + 明细）、规则（按卡独立保存，改动后卡头显示「未保存」）、题库（卡片式列表 + 多选批量启用/暂停/删除 + 分题型编辑器）、批改（手写图点击放大 + 60/80/100 快捷打分 + AI 重试）、记录（14 日图 + 事件时间线，payload 已翻译成中文）、设备（状态矩阵 + 集成令牌 + 更新镜像 + 修改密码 + 节假日）、日志（I/W/E 分级着色 + 自动刷新 + 导出 ZIP）
- **时段编辑器重做**：桌面 7×48 网格支持拖拽涂抹，手机按单日 4×12 大格可点；支持全周开启/清空、把某天复制到其他天
- **修复**：规则页随机报错（`setTimeout` 猜时序时 `config` 仍为 null）、接口失败后页面永久空白、日志过滤永远不生效、令牌弹窗把 `<br>` 显示成字面量且不可复制、删题/关防卸载用原生 `confirm`、每次导航整页重建导致闪烁、刷新回首页且手机返回键直接退出面板、题库只能单条操作、导入非法 JSON 直接抛异常
- **补全**：设备重命名、管理密码修改、集成令牌权限开关、更新镜像设置等接口早已存在但面板没有入口的功能
- **工程**：新增 `scripts/panel-preview.mjs`（零依赖 mock 服务端）、`panel-shot.mjs`（CDP 截图）、`panel-smoke.mjs`（9 个交互冒烟用例）；`admin/assets/` 仍只有 `logo.png` / `panel.css` / `panel.js`

### v1.0.8 (2026-11-11) — 修复「网页无法打开」致命回归

> v1.0.5 / v1.0.6 / v1.0.7 三个版本全部无法启动，装好后只显示 `net::ERR_CONNECTION_REFUSED`，本版修复。

- **修复**：本地 HTTP 服务从未真正监听 — `LanServer.start()` 在 v1.0.5 被改成"探测端口后立即关闭"，`socket` 始终为 `null`，`accept()` 抛出异常被吞掉。WebView 去连 `127.0.0.1:8099` 必然被拒绝。现在逐个端口真正 `bind` 并复用同一个 socket
- **修复**：端口兜底 — 历史版本会把 `boundPort = -1` 写进 SharedPreferences，导致地址变成 `http://127.0.0.1:-1/`；读取时拒绝非法端口
- **修复**：应用图标不生效 — `AndroidManifest.xml` 指向 `@drawable/ic_launcher`（一个橙色三角矢量图），熊抱电视的 `mipmap` 图标从未被使用。改用 `@mipmap/ic_launcher` + `roundIcon`，并补上 Android 8+ 自适应图标与 5 档 TV banner
- **修复**：应用名不生效 — TV flavor 的 `strings.xml` 把 `app_name` 覆盖成 `BabyOnTV · TV`，主 strings 里的「宝宝请听题」对电视包无效
- **修复**：快捷面板按钮全部 403 — `/api/remote` 只认家长会话与集成令牌，而面板用设备令牌调用；现在 loopback + `X-Device-Token` 放行
- **优化**：网页与管理面板品牌统一（熊 logo + 中文名），`gen_icons.py` 重写为可复用的图标生成脚本

### v1.0.7 (2026-11-11) — 电视端家长控制快捷面板 + 全屏加固
- **新增**：电视端家长控制快捷面板 — 长按左上角品牌区 1.5 秒或按遥控器 MENU 键，弹出「解锁 30 分钟 / 解锁 60 分钟 / 立即进入管控 / 取消 / 无限额解锁」5 个快捷开关，无需手机扫码即可临时放行
- **新增**：`BOTV_RESET_TIMER` 前端事件 — 管控解除时自动复位前端计时器与状态机，避免倒计时残留
- **修复**：答题页全屏适配 — `html, body` 强制 `100vw/100vh` 且零外边距，配合 viewport `maximum-scale=1.0, user-scalable=no`，解决小窗口渲染
- **优化**：仓库体积 — 本地构建工具链 `.tools/`（JDK / Android SDK，约 900MB、1.2 万文件）加入 `.gitignore` 并移出版本库，仓库拉取/推送恢复正常

### v1.0.6 (2026-11-11) — 遥控器全键位支持
- **修复**：电视端遥控器全键位可操作 — 所有按钮、权限列表行新增 DPAD_CENTER/Enter 键监听，修复 OnboardingActivity 权限引导页「去开启」按钮无法用遥控器选中、ParentActivity 密码验证页按钮遥控器不可用问题
- **构建**：TV / Mobile release APK 编译通过，无新增 lint 错误
- **注意**：本版申报的「图标替换」与「应用名改为宝宝请听题」实际未生效，直至 v1.0.8 才修正

### v1.0.5 (2026-11-11) — 7 项关键修复与稳定性加固
- **修复**：WebView 全屏渲染 — `useWideViewPort=false` + `setInitialScale(100)` 彻底解决界面只显示左上角
- **修复**：覆盖安装缓存残留 — `web.clearCache(true)` + `?v=VERSION_CODE` 双重 cache-busting
- **修复**：JS 桥接注入时序竞态 — 重构 `createWeb()` 先配置/注入桥接后 `loadUrl`，语音播报 100% 就绪
- **修复**：`lanInfo()` 越权访问风险 — 仅配对页 `#/pair` 放行，学习页/锁屏页仍需授权
- **修复**：前端定时器泄漏导致 UI 残留 — 新增 `hideAllTimers()` 统一清理所有状态切换
- **新增**：LAN 端口冲突容灾 — 8099 起始自动递增重试 8099~8118（共 20 端口）
- **加固**：Android 7.0 (海信 VIDAA) 后台防杀 — 新增 `requestIgnoredBatteryOptimization()` 引导电池优化白名单

### v1.0.4 (2026-11-10) — 电视实测 3 个严重 Bug 修复
- **修复**：答题时没有读题目 — 调整 JS 桥接注入时序，`addJavascriptInterface` 先于 `loadUrl`，语音播报 100% 就绪
- **修复**：答题界面只占屏幕左上角 — `MainActivity.onCreate` 新增沉浸式全屏标志，TV / Mobile 均生效
- **修复**：家长控制二维码无法扫描 — `DeviceBridge.lanInfo()` 移除 `connectionAllowed` 守卫，配对页可直接获取局域网地址

### v1.0.3 (2026-11-10) — 正式发版签名
- 启用 release keystore 签名（替代 v1.0.2 的 debug 签名）
- GitHub Actions 自动发布 Release，产物含 SHA256 校验文件

### v1.0.2 (2026-11-10) — 初始公开版本
- 完整功能：识字/英语/书写 210 题、832 条离线语音、SM-2 间隔复习、家长面板、局域网配对
- 包名：电视 `com.babyontv.tv`，手机/平板 `com.babyontv.mobile`

## 许可

- 本项目代码以 [LICENSE](LICENSE)（自有版权）发布：个人免费使用，禁止商用与再分发。
- 引用的第三方数据与库见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
