# BabyTV

面向 **3~6 岁** 的电视端启蒙应用：**识字 + 英语启蒙 + 书写练习**。
所有题目语音**预合成离线音频**打包进 APK，不联网、不依赖电视自带 TTS 引擎；界面只有巨大字块，孩子用遥控器 `←` `→` 选、`OK` 确认即可。

> 本项目基于 [chadyi/StudyOnTV](https://github.com/chadyi/StudyOnTV) 二次开发，原项目是「答题解锁电视时间」的家长管控工具，本仓库将其改造为幼儿启蒙形态。协议与来源见 [一、开源协议与来源标注](#一开源协议与来源标注)。

---

## 功能一览

| 能力 | 实现 |
| :-- | :-- |
| 纯语音朗读 | 题干出现即自动播报；`←/→` 切换选项时播报该选项；`OK` 后播报「答对了，你真棒 / 再想一想哦」 |
| 离线音频包 | 832 个 mp3（约 7.8 MB）随 APK 打包，`MediaPlayer` 直读 assets，**零网络、零系统 TTS** |
| 音色 | 中文 `zh-CN-XiaoxiaoNeural`（温柔女声），英文 `en-US-JennyNeural`（亲切女声），由脚本按文本自动切换 |
| 极简大字 | 题干 `5.2vh`、选项 `12vw` 的巨大卡片；无配图、无多余文字 |
| 遥控器交互 | `←` `→` 切焦点，`OK/Enter` 确认；兼容 `KEYCODE_DPAD_CENTER` 与 `KEYCODE_ENTER` |
| 老电视兼容 | `minSdk 21`（Android 5.0），实测目标 Android 7.0 / VIDAA；前端已规避 `flex gap`、`fetch` 等新特性 |
| 题库 | 210 题：识字 100、英语 100、书写 10；固定 ID 与音频一一对应 |
| 出题去重 | 最近 **30 题不重复**（`recent_qids`），小题库自动重置队列 |
| 错题重现 | 答错后**隔 5 题**再出（`retry_qids`），间隔复习（`spacedRepetitionEnabled`）默认开启 |
| 复听 / 纠错 | 遥控器 `MENU`（或 `PLAY/PAUSE`）重播题干；答错后高亮并**朗读正确选项** |
| 手机 / 平板 | 独立 `mobile` 包（`com.babytv.mobile`）：点按卡片作答、竖屏/横屏自适应、底部「再听一遍」、长按题干或点「家长」进家长页 |
| 家长面板 | 电视上直接显示 `http://<电视IP>:8099/admin/`，手机/电脑浏览器**免扫码**打开 |
| 退出 / 本轮完成 | 遥控器 `BACK`、屏幕「退出」按钮随时回电视桌面；每答完一轮（默认 5 题）显示「本轮完成」，15 秒无操作自动退出，也能点「再学一轮」 |
| 家长休息 | 家长页可设「休息 1 / 2 / 4 小时」：期间孩子端只显示休息页并自动退出，家长可随时取消 |
| 家长入口 | 有鼠标/触屏时右上角显示「家长」按钮；纯遥控器电视连按 `↑` 5 次进入；手机打开 `http://<电视IP>:8099/admin/` |

### 关键参数

| 项 | 值 |
| :-- | :-- |
| versionName / versionCode | CI：`1.1.<run>` / `10000 + run`；本地：`1.1.0` / `10000`（自动，无需手改） |
| applicationId | 电视 `com.babytv.tv`；手机/平板 `com.babytv.mobile`（debug 构建带 `.debug` 后缀，可同时安装） |
| 签名 | release 包使用自有 keystore（PKCS12），CI 从 GitHub Secrets 注入 |
| minSdk / targetSdk / compileSdk | `21` / `34` / `36` |
| APK 体积 | 电视版约 10 MB；手机版约 10 MB（各含 832 个离线音频） |
| 题库文件 | `data/seed.json` |
| 音频目录 | `data/audio/`（构建时同步进 `assets/audio/`） |

---

## 快速开始

```powershell
# 1) 电脑上先看效果（不需要模拟器、不需要 Android Studio）
python tools/preview.py          # 打开 http://127.0.0.1:8123/
#    ← → 切换选项，Enter 确认；首次按键后浏览器才允许出声

# 2) 改完题库重新生成语音（会清空 data/audio 全量重建）
python scripts/generate_audio.py

# 3) 推送到 GitHub，Actions 自动构建并发布 APK 到 Releases
git add -A; git commit -m "feat: ..."; git push
```

---

## 目录结构

```
BabyTV/
├─ app/
│  ├─ web/index.html                 ← 【孩子端唯一界面】大字卡片 + 遥控器交互（改 UI 改这里）
│  └─ native/                        ← Android 工程（gradle 根，无 wrapper，CI 用 gradle 命令构建）
│     └─ app/src/main/
│        ├─ java/com/babytv/tv/     ← Kotlin 源码（见下表）
│        ├─ res/values/strings.xml   ← 应用名 BabyTV / 无障碍文案
│        └─ assets/                  ← 构建时自动生成：web/ admin/ audio/ questions.json
├─ data/
│  ├─ seed.json                      ← 【题库唯一入口】210 题
│  ├─ audio/                         ← 【离线语音】832 个 mp3，随仓库提交
│  └─ banks/open-play.json           ← 上游示例题库（仅文档引用）
├─ admin/                            ← 家长管理面板（编译产物，LAN 内网访问）
├─ shared/                           ← KaTeX 等前端共享资源
├─ scripts/
│  ├─ generate_audio.py              ← edge-tts 批量合成语音
│  ├─ gen-how-it-works.mjs           ← 上游：生成流程图
│  └─ make-shots.mjs                 ← 上游：生成截图
├─ tools/
│  ├─ preview.py                     ← 电脑端预览服务器（本地模拟设备 API）
│  └─ make_brand_assets.py           ← 生成应用图标（小熊）+ 电视横幅
├─ keystore/                         ← 【本地私有，不入库】release 签名钥匙，务必备份
├─ docs/                             ← 上游文档存档 + 截图
└─ .github/workflows/build.yml       ← CI：校验音频 → release 签名构建 → 发布 Release
```

### 核心 Kotlin 文件

| 文件 | 作用 |
| :-- | :-- |
| `MainActivity.kt` | 入口，创建 WebView、把遥控器按键转发给前端 `window.TV` |
| `DeviceBridge.kt` | JS ↔ 原生桥：`playAudio()` / `stopAudio()` / `apiToken()` 等 |
| `AudioPlayer.kt` | 单实例 MP3 播放器；`assets.openFd()` 直读，失败则复制到缓存再播 |
| `LanServer.kt` | 本机 HTTP 服务（127.0.0.1:8099），提供页面与 `/api/quiz/*` |
| `LearningEngine.kt` | 出题、判题、统计；`practice` 模式不受时段额度限制 |
| `SeedAssets.kt` | 首次启动/题库变更时把 `assets/questions.json` 导入 SQLite，并分配固定 ID `q_<序号>` |
| `LocalStore.kt` | SQLite 封装（题目、进度、事件、配置） |
| `GateService.kt` / `GateOverlay.kt` | 上游的屏幕时间管控（可选，不影响答题主体） |

---

## 一、开源协议与来源标注

### 1.1 上游项目

| 项 | 内容 |
| :-- | :-- |
| 上游仓库 | [chadyi/StudyOnTV](https://github.com/chadyi/StudyOnTV) |
| 作者 | chadyi |
| 本项目关系 | Fork 后二次开发（BabyTV：适龄化 + 离线语音 + 大字卡片） |
| 保留内容 | 屏幕时间管控框架、家长面板、LAN API、Kotlin 工程结构 |
| 改造内容 | 题库、前端界面、离线音频链路、`practice` 默认模式、CI 发布流程 |

> 二次开发要求（重要）：上游 `LICENSE` 为 **Source Available / 个人非商用**，不是 MIT/Apache。因此：
> - **允许**：个人下载、编译、安装、家庭内非商业使用；fork 与修改。
> - **禁止**：任何商业用途、售卖、以本代码提供付费服务（需上游作者书面授权）。
> - 发布/分发衍生作品时**必须**保留本文件与 `LICENSE` 中的版权声明。

### 1.2 本项目声明

```
BabyTV — 基于 chadyi/StudyOnTV 的幼儿启蒙改造
Copyright (c) 2024 chadyi（上游原始代码）
Copyright (c) 2026 RonL89（BabyTV 改造部分）
许可证：沿用上游 Source Available License（个人非商用），见 LICENSE
```

### 1.3 第三方组件与素材

| 组件 | 协议 | 位置 |
| :-- | :-- | :-- |
| KaTeX 0.16.22 | MIT | `shared/katex/`（含 LICENSE） |
| React / Radix UI / TanStack Query / Recharts / Tailwind / Lucide / Sonner | 各自上游协议 | `admin/assets/`，许可证在 `admin/assets/notices/` |
| shadcn-admin | MIT (c) 2024 Sat Naing | `admin/assets/notices/shadcn-admin.txt` |
| 语音合成 | Microsoft Edge 在线 TTS（edge-tts）生成的音频 | `data/audio/` |

> ⚠️ **音频合规提示（容易忽略）**：`data/audio/` 里的 mp3 是用 `edge-tts` 调用微软在线语音服务生成的。**个人家庭自用没问题**；若要商用、公开分发或上架应用商店，请替换为自建 TTS（如 VITS/ChatTTS/本地录音），避免使用第三方云语音输出。详见 `THIRD_PARTY_NOTICES.md`。

### 1.4 修改上游代码后的标注规范

1. 文件头保持不变，不删除上游版权声明。
2. 大幅改写的文件在文件顶部加一行：
   ```kotlin
   // Modified for BabyTV (2026): <一句话说明改了什么>
   ```
3. 提交信息中标注影响范围（见 [2.6 提交规范](#26-提交规范)）。

---

## 二、标准开发流程

### 2.0 环境要求

| 场景 | 需要 |
| :-- | :-- |
| 只改题库/语音 | Python 3.8+、`pip install edge-tts` |
| 电脑预览界面 | 同上（无需 Android SDK） |
| 本地打 APK | JDK 17、Android SDK（platform 36 + build-tools 36）、Gradle 8.13+ |
| 只发版 | 什么都不装，`git push` 即可（GitHub Actions 云端构建） |

### 2.1 初始化

```powershell
git clone https://github.com/RonL89/BabyTV.git
cd BabyTV
pip install edge-tts
```

### 2.2 电脑端预览（改界面的首选方式）

```powershell
python tools/preview.py
# 浏览器打开 http://127.0.0.1:8123/
```

- 复用 `app/web/index.html` + `data/seed.json` + `data/audio/`，与电视上表现一致（仅播放器实现不同）。
- 键盘 `←` `→` 切换、`Enter` 确认。浏览器的自动播放策略要求**先有一次交互**，按一下方向键即可出声。
- 改完 `app/web/index.html` 后刷新页面即可，无需重编译 APK。

### 2.3 改题：唯一入口 `data/seed.json`

```json
[
  {
    "q": "高大的大象，'大'字是哪一个？",
    "a": ["大", "小", "中"],
    "k": 0,
    "subject": "识字"
  }
]
```

| 字段 | 必填 | 说明 |
| :-- | :-- | :-- |
| `q` | ✅ | 题干，会被朗读。**不要写 `//` 注释**（不是合法 JSON） |
| `a` | ✅ | 选项数组，2~3 个最佳（电视屏宽） |
| `k` | ✅ | 正确选项下标，**从 0 开始** |
| `subject` | 建议 | `识字` / `英语` / `书写`，用于后台统计筛选 |
| `difficulty` / `tip` / `level` | 否 | 难度星级 / 解析 / 年龄段 |

规则：
1. **顺序即 ID**：第 i 题（从 0 开始）对应音频 `q_i.mp3` 与 `q_i_opt_j.mp3`。
2. **增删题目后必须重跑** `python scripts/generate_audio.py`（脚本会清空 `data/audio` 全量重建）。
3. 题库变化后，已装设备重新安装 APK 会自动重建题库（`SeedAssets` 用「题数 + 首题哈希 + 末题哈希」做签名比对）。
4. 用 Python 校验一遍再提交：
   ```powershell
   python -c "import json;d=json.load(open('data/seed.json',encoding='utf-8'));print(len(d),'题 OK')"
   ```

### 2.4 生成离线语音

```powershell
python scripts/generate_audio.py
```

- 中文（含汉字）→ `zh-CN-XiaoxiaoNeural`；纯英文单词 → `en-US-JennyNeural`；纯数字/符号 → 中文音色（`12` 读「十二」）。
- 并发 8，210 题约 832 个文件、3~5 分钟。
- 每次运行**先清空** `data/audio/*.mp3`，保证不会残留改题前的旧语音。
- 想换音色：改脚本顶部 `ZH_VOICE` / `EN_VOICE`（如童声 `zh-CN-XiaoyiNeural`），重跑即可。

### 2.5 构建 APK

**方式 A：本地（装了 Android SDK + JDK17）**

```powershell
cd app/native
gradle assembleTvDebug        # 电视 debug：app/build/outputs/apk/tv/debug/app-tv-debug.apk
gradle assembleMobileDebug    # 手机/平板 debug：app/build/outputs/apk/mobile/debug/app-mobile-debug.apk
gradle assembleTvRelease      # 电视 release（需先配置 keystore，见 2.8）
gradle assembleMobileRelease  # 手机/平板 release
```

> 仓库**不含 gradle wrapper**（`gradlew`），请用系统 `gradle` 或 `gradle wrapper` 自行生成；CI 用 `gradle/actions/setup-gradle` 提供 Gradle 8.14.3。
> 本机若没有 Java / Android SDK，直接走方式 B 即可（本仓库就是纯云端构建）。

**方式 B：GitHub Actions（推荐，零本地环境）**

```powershell
git push   # 触发 .github/workflows/build.yml
```

流水线步骤：装 JDK17/SDK → 校验音频完整性（缺文件直接失败）→ 有 `KEYSTORE_BASE64` 时 `assembleTvRelease assembleMobileRelease`（release 签名，否则自动回退 debug）→ 重命名 + SHA256 → 上传 Artifact → **发布 GitHub Release（标签 `v1.1.<run>`）**。

构建前 `Sync` 任务会把 `app/web`、`admin`、`data/seed.json`、`data/audio` 同步进 `assets/`（这些生成物已 gitignore）。

### 2.6 提交规范

```
<type>(<scope>): <一句话>

type: feat | fix | ci | docs | chore | refactor
scope: web | native | seed | audio | ci | docs
例：feat(seed): 新增 20 道 5 以内减法
    fix(native): 修复 assets 被压缩导致无声
```

- 一次提交只做一件事；题库与音频**放同一次提交**，避免"声音对不上题"。
- 不要提交 `app/native/app/src/main/assets/` 下的生成物、`dist/`、`build/`、`keystore/`、`*.jks`、`*.p12`。

### 2.7 版本与发布（已自动化）

| 项 | 规则 |
| :-- | :-- |
| `versionCode` | `10000 + GITHUB_RUN_NUMBER`，只增不减，覆盖安装不会冲突 |
| `versionName` | `1.1.<GITHUB_RUN_NUMBER>`；若本次是 tag 触发则用 tag 名 |
| Release 标签 | `v<versionName>`，每次 push `main` 自动创建/更新 |
| 附件 | `BabyTV-v<version>-tv-release.apk`（电视）+ `BabyTV-v<version>-mobile-release.apk`（手机/平板）+ `SHA256SUMS.txt`；无密钥时是 `-tv-debug.apk` / `-mobile-debug.apk` |

本地构建不设环境变量时：`versionCode=10000`、`versionName=1.1.0`。想固定语义版本，打 tag 即可（如 `git tag v1.2.0 && git push --tags`）。

### 2.8 签名密钥（release，务必阅读）

- 本地密钥：`keystore/release.p12`（PKCS12）+ `keystore/keystore.properties`（密码/别名），**两者都不入库**（`.gitignore` 已忽略整个 `keystore/`）。
- **必须备份**：把整个 `keystore/` 目录复制到网盘 / U 盘 / 密码管理器。丢失后无法再发布"可覆盖安装"的更新，只能让用户卸载重装（学习进度会丢）。
- CI 使用 4 个 GitHub Secrets：`KEYSTORE_BASE64`（p12 的 base64）、`KEYSTORE_PASS`、`KEY_ALIAS`（`babytv`）、`KEY_PASS`。当前仓库已配置。
- 备份 base64（用于重建 Secret）：
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("keystore/release.p12")) | Set-Content keystore.b64
  ```
- 更换密钥会改变签名 → 老用户无法覆盖升级，非必要不要重新生成。

---

## 三、调试与装机快捷方案（ADB 命令行）

### 3.1 电视开启 ADB

1. 电视 `设置 → 关于/系统信息` → 连续点击「版本号」7 次，出现「开发者选项」。
2. 打开 `开发者选项 → USB 调试`；若 VIDAA 提供「网络调试 / ADB over network」也一并打开。
3. 查看电视 IP：`设置 → 网络 → 当前网络`（例：`192.168.1.23`）。
4. 电脑安装 platform-tools（或 Android SDK 自带 `adb`），确认在同一局域网。

### 3.2 连接与安装

```powershell
adb connect 192.168.1.23:5555     # 无线调试（Android 7 无需配对码）
adb devices                       # 看到 device 才算成功；offline 就 adb disconnect 再连
adb install -r dist\BabyTV-v1.1.12-tv-release.apk      # 电视
adb install -r dist\BabyTV-v1.1.12-mobile-release.apk  # 手机 / 平板
```

> 电视包名：`com.babytv.tv`；手机/平板包名：`com.babytv.mobile`（debug 分别加 `.debug` 后缀）。两个包独立，可同时安装在一台设备上。
> ⚠️ 从旧版迁移：旧包 `com.studyontv.tv` 与新包互不兼容，先 `adb uninstall com.studyontv.tv`（或电视上卸载）再装新版；卸载会清空旧进度（本项目改名时本来也是 0 进度）。

### 3.3 常用命令速查

| 目的 | 命令 |
| :-- | :-- |
| 启动应用（电视） | `adb shell am start -n com.babytv.tv.debug/com.babytv.tv.MainActivity` |
| 启动应用（手机/平板） | `adb shell am start -n com.babytv.mobile.debug/com.babytv.tv.MainActivity` |
| 或（等价） | `adb shell monkey -p com.babytv.mobile.debug -c android.intent.category.LAUNCHER 1` |
| 强制停止 | `adb shell am force-stop com.babytv.mobile.debug` |
| 卸载 | `adb uninstall com.babytv.mobile.debug` |
| 清空学习数据（保留下载包） | `adb shell pm clear com.babytv.mobile.debug` |
| 查看版本 | `adb shell dumpsys package com.babytv.tv.debug \| Select-String versionName` |
| 已装包名 | `adb shell pm list packages \| Select-String babytv` |
| 本机 HTTP 服务端口 | `adb shell "curl -s 127.0.0.1:8099/api/hello"`（电视无 curl 时跳过） |
| 关闭安装校验（装不上时） | `adb shell settings put global verifier_verify_adb_installs 0` |

### 3.4 日志（排障核心）

```powershell
adb logcat -c                                        # 先清空
adb logcat -v time | Select-String -Pattern "babytv|AndroidRuntime|chromium|MediaPlayer"
```

- 只看崩溃：`adb logcat -v time *:E`
- 按进程过滤：`adb shell pidof com.babytv.tv.debug` → `adb logcat --pid=<pid>`
- 前端报错（JS）：WebView 控制台会进 logcat，关键字 `chromium`；debug 包已开启 `setWebContentsDebuggingEnabled(true)`，可用电脑 Chrome 打开 `chrome://inspect` → `inspect` 远程调试页面。

### 3.5 截图 / 录屏（注意 PowerShell 会破坏二进制输出）

```powershell
adb shell screencap -p /sdcard/s.png
adb pull /sdcard/s.png .\s.png                      # 推荐：先落盘再 pull
adb shell rm /sdcard/s.png

adb shell screenrecord --time-limit 15 /sdcard/r.mp4
adb pull /sdcard/r.mp4 .
```

> ❌ 不要用 `adb exec-out screencap -p > s.png`：PowerShell 的 `>` 会把二进制转成 UTF-16，图会坏。需要时用 `cmd /c "adb exec-out screencap -p > s.png"`。

### 3.6 不用遥控器模拟按键

```powershell
adb shell input keyevent 22   # DPAD_RIGHT
adb shell input keyevent 21   # DPAD_LEFT
adb shell input keyevent 23   # DPAD_CENTER / OK
adb shell input keyevent 66   # ENTER
adb shell input keyevent 4    # BACK
```

### 3.7 覆盖升级与数据

| 操作 | 结果 |
| :-- | :-- |
| `adb install -r` | 保留数据（学习进度、家长密码） |
| 换题库重新装 | 题库签名变化 → 自动重建题目表（进度清空） |
| `pm clear` | 等同首次安装：重建题库、回到首次启动流程 |

---

## 四、真机安装与连机调试

### 4.1 首次安装（U 盘，最稳）

1. Releases 页下载：电视用 `BabyTV-v1.1.12-tv-release.apk`；手机/平板用 `BabyTV-v1.1.12-mobile-release.apk`。
2. 拷到 U 盘根目录 → 插设备 → 打开「文件管理/U盘」→ 点击 APK。
3. 弹出「禁止安装未知来源」→ 允许该文件管理器安装。
4. 安装完成后在电视「我的应用」/ 手机桌面找到 **BabyTV**。

### 4.1.1 手机 / 平板使用说明

- **作答**：直接点按巨大卡片；底部有「🔊 再听一遍」。
- **不想装 App**：同一 Wi-Fi 下，手机/平板浏览器打开电视的 `http://<电视IP>:8099/` 也能答题（页面会自动带上设备令牌并走 `/audio/` 播放离线语音）；首次点一下屏幕后声音才会解锁。
- **家长入口**：点右上角「家长」，或长按题干 1.5 秒；输入家长密码即可。
- **屏幕**：竖屏、横屏都自适应；平板横屏最接近电视体验。
- **管控**：手机/平板不启用系统级悬浮窗监控（避免影响正常使用），学习时段由 App 内部规则控制；返回键直接退到后台。
- **共存**：包名 `com.babytv.mobile`，与电视版 `com.babytv.tv` 可同时安装，学习进度各自独立。

### 4.2 无线 ADB 安装（调试期最快）

```powershell
adb connect <设备IP>:5555
adb install -r dist\BabyTV-v1.1.12-tv-release.apk      # 电视
adb install -r dist\BabyTV-v1.1.12-mobile-release.apk  # 手机 / 平板
adb shell am start -n com.babytv.tv/com.babytv.tv.MainActivity
adb shell am start -n com.babytv.mobile/com.babytv.tv.MainActivity
adb logcat -v time | Select-String -Pattern "babytv|AndroidRuntime|chromium"
```

> 装 debug 包时把包名换成 `com.babytv.tv.debug` / `com.babytv.mobile.debug`。

若电视没有「网络调试」入口：先用 USB 线连电视与电脑，执行 `adb devices` 确认后 `adb tcpip 5555`，拔线后用 IP 连接。

### 4.3 首次启动流程

```
启动 App
  └─ 未设置家长密码 → 「设置管理密码」（6~64 位，建议 123456）
       └─ 「进入家长设置」/「开始学习」→ 选「开始学习」
            └─ 进入答题：题干自动朗读 → ←/→ 选项发音 → OK 判题发音 → 自动下一题
```

- 电视权限（悬浮窗/使用情况/无障碍/后台）**全部可选**；手机/平板只提示「后台运行」，不授权也能正常答题。
- 回家长页：电视**连按 `↑` 5 次**；手机/平板点右上「家长」或长按题干 1.5 秒。
- 家长密码遗忘：`adb shell pm clear com.babytv.tv`（或 `com.babytv.mobile`）重置（会清空进度）。

### 4.4 装机常见失败

| 现象 | 原因 / 处理 |
| :-- | :-- |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 之前装过不同签名/包名的同名应用 → 先 `adb uninstall com.babytv.tv.debug`（手机版用 `com.babytv.mobile.debug`） |
| `INSTALL_FAILED_INSUFFICIENT_STORAGE` | 电视存储不足，清理缓存 |
| 安装后打开黑屏 | WebView 未就绪或端口冲突；`adb logcat` 看 `LanServer` / `chromium`；确认 8099 未被占用 |
| 有画面但没声音 | 检查 APK 是否来自 CI（会校验音频）；`adb logcat` 看 `MediaPlayer`；电视静音/音量 |
| 遥控器无反应 | 电视把按键映射成鼠标事件；`adb shell input keyevent 22` 验证应用侧是否正常 |
| 应用启动即退回桌面 | 首次启动被引导到「设置密码」页属正常；若崩溃看 `AndroidRuntime` 堆栈 |
| `adb connect` 拒绝连接 | 电视 ADB 开关未开 / 不同网段 / 路由器 AP 隔离 |

---

## 五、可行性评估与已知限制

已核验（2026-11）：

| 检查项 | 结论 |
| :-- | :-- |
| 题库 JSON 合法性 | ✅ 210 题全部可解析（曾含 `//` 注释，已清理） |
| 音频完整性 | ✅ 832 个文件，脚本与 CI 双重校验 |
| 题↔音对应 | ✅ 固定 ID `q_<序号>`，不再依赖随机顺序 |
| assets 播放 | ✅ 已设置 `noCompress += "mp3"` + 缓存兜底 |
| 老 WebView 兼容 | ✅ 已移除 `flex gap`、`fetch`/`Promise` 依赖（Android 7 自带 WebView 常见 Chrome 51~60） |
| 出题去重 | ✅ 最近 30 题不重复；错题隔 5 题重现 |
| 签名 | ✅ 自有 release keystore（PKCS12），CI 自动签名 |
| 品牌 | ✅ 小熊图标 + 320×180 电视横幅，包名 `com.babytv.tv` |
| 手机 / 平板 | ✅ `mobile` 变体（`com.babytv.mobile`）：触摸作答、竖屏/横屏布局、触摸重听与家长入口；390×844 / 844×390 / 800×1280 截图核验 |
| 构建 | ✅ CI 同时构建电视 + 手机两个签名包，并发布到 Release |

已知限制（需要的话可以继续改）：

1. **签名密钥只有一份**：丢失后无法再发布可覆盖安装的更新，务必备份 `keystore/`（见 2.8）。
2. **音频来源**：云 TTS 输出，个人自用没问题，商用需替换（见 1.3）。
3. **旧包名迁移**：从上游包 `com.studyontv.tv` 升级必须先卸载旧版（数据不继承）；新装包名 `com.babytv.tv`。
4. **首次家长密码**：必须在设备上用遥控器/键盘/触摸输入，属于一次性成本。
5. **屏幕时间管控（GateService/无障碍）** 仅电视启用；手机/平板不叠加系统悬浮窗，且 VIDAA 上可能受限，均不影响答题主流程。
6. **去重窗口是 30 题**：玩超过 30 题后旧题会再次出现（符合幼儿复习预期，不是无限不重复）。
7. **电视未适配超低端 720p**：字号用 `vh/vw`，极端分辨率下需微调；手机/平板已单独适配。
8. **练习模式不锁屏**：默认 `playMode=practice`，`GateService` 直接跳过计时与锁屏；要限制看电视时间，用家长页的「休息 1/2/4 小时」，或把玩法改回 `round`/`streak`。
9. **手机/平板进度独立**：与电视版是两个包，学习记录不互通（后续可做导出/导入）。

---

## 六、常见问题（FAQ）

**Q1：改题要动几个文件？**
一个：`data/seed.json`。改完跑一次 `generate_audio.py`，再 `git push`。

**Q2：为什么音频文件名是 `q_数字.mp3`？**
文件名由题目在 JSON 里的下标决定（`SeedAssets` 导入时固化为 ID `q_<下标>`），所以**必须在改题后重新生成音频**。

**Q3：PowerShell 里 `python` 输出中文是乱码？**
控制台是 GBK。文件本身是 UTF-8，不影响结果；想看正常输出可 `chcp 65001`。

**Q4：能不能不用 CI，本地出 release 包？**
可以，有两种方式（任选其一）：
- 把 `KEYSTORE_PATH` / `KEYSTORE_PASS` / `KEY_ALIAS` / `KEY_PASS` 写进 `app/native/local.properties`；
- 或直接用仓库根目录的 `keystore/keystore.properties`（Gradle 自动读取）。

然后 `cd app/native && gradle assembleTvRelease`（手机/平板用 `assembleMobileRelease`）。

**Q7：手机/平板怎么装？和电视版冲突吗？**
不冲突。手机/平板装 `BabyTV-v*-mobile-release.apk`（包名 `com.babytv.mobile`），电视装 `-tv-release.apk`（`com.babytv.tv`）；两个包可以同时存在，但学习进度各自独立。

**Q6：为什么 Release 版本号是 `1.1.6` 这种？**
`versionName = 1.1.<CI run number>`、`versionCode = 10000 + run`，全自动、只增不减。打 tag（`git push --tags`）时改用 tag 名。

**Q5：电视很卡/字很小？**
改 `app/web/index.html` 里的 `#stem` `font-size` 与 `.card` `width/height/font-size`（都是 `vh/vw` 相对单位）。

**Q8：手机打开 `http://电视IP:8099/admin` 一片空白？**
旧版页面里的资源是 `./assets/...` 相对路径，访问 `/admin`（不带斜杠）时浏览器会去请求 `/assets/...`（孩子端目录），所以整页空白。v1.1.13 起服务端把 `/admin` 301 跳转到 `/admin/`，电视上显示的地址也带斜杠，重新安装即可正常打开。

**Q9：孩子答完一轮还想学？**
完成页点「再学一轮」即可；纯遥控器电视上在完成页按 `OK` 也是继续下一轮，按 `BACK` 直接回电视桌面。

---

## 七、后续可做的事（建议顺序）

本轮已完成（2026-11）：

- ✅ 自有 release 签名（PKCS12）+ CI Secrets 自动签名
- ✅ 包名 `com.babytv.tv`（彻底去掉上游旧名）
- ✅ 最近 30 题不重复 + 错题隔 5 题再现 + 间隔复习默认开启
- ✅ 小熊图标 / 电视横幅
- ✅ `MENU` 再听一遍 + 答错念正确答案
- ✅ `versionCode` 取 CI run number，`versionName` 自动递增
- ✅ 家长面板电视端直显 `http://IP:8099/admin`（免扫码）
- ✅ 手机 / 平板版：触摸作答、竖屏/横屏布局、底部重听、右上「家长」入口、独立安装包
- ✅ 修复「答完第一题后界面完全卡死」：答题成功直接渲染下一题时没有解除输入锁，遥控器与触摸均失效
- ✅ 题库换新：210 题（识字 100 / 英语 100 / 书写 10），离线音频全量重生成（832 个）
- ✅ 答题界面随时可退出：遥控器 `BACK` / 「退出」按钮；答完一轮（默认 5 题）显示完成页，15 秒无操作自动回桌面
- ✅ 家长页新增「休息 1 / 2 / 4 小时」，期间孩子端只显示休息页并自动退出，可随时取消
- ✅ 有鼠标/触屏时显示「家长 / 再听一遍 / 退出」按钮（之前只在纯触摸设备显示，鼠标点不到）
- ✅ 修复手机打开 `8099/admin` 空白（`/admin` 301 到 `/admin/`，资源路径才对）

可以继续做：

1. **看图选字**：选项换成图片（需加图片资源 + 打包流程 + 音频配套）。
2. **学习周报**：用现有 `events` 表 + `/api/history` 生成家长可见的图表。
3. **语音调速/重读最后一句**：低龄孩子常需要更慢的语速。
4. **专项模式**：按 `subject` 只练识字/英语/书写，遥控器长按切换。
5. **家长面板二维码回退**：已有直显网址，若想扫码可再补一个本地生成的二维码（不依赖外网）。
6. **屏幕时间管控适配 VIDAA**：确认无障碍/悬浮窗在海信上的实际可用性。
7. **多设备同步**：把学习进度导出/导入（U 盘 JSON），换电视不丢进度。
