# BabyOnTV

面向 **3~6 岁** 的电视 / 平板 / 手机启蒙应用：**识字 + 英语 + 书写练习**。
题库与语音全部离线，孩子用遥控器 `← → ▲ ▼` 选、`OK` 确认即可。

> 本项目基于 [chadyi/StudyOnTV](https://github.com/chadyi/StudyOnTV) 二次开发。
> **底层管控逻辑（答题解锁、时段、加练、间隔复习、家长面板、AI 批改、权限引导、守护服务）完全沿用上游**，
> BabyOnTV 只替换了**内置题库**，并额外接入**离线 mp3 语音**（不依赖电视自带 TTS）。
> 协议与来源见 [LICENSE](LICENSE)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

## 与上游的差异

| 项 | 上游 StudyOnTV | BabyOnTV |
| :-- | :-- | :-- |
| 内置题库 | 50 题（唐诗 / 100 以内加减法 / 英语） | **210 题**：识字 100、英语 100、书写 10 |
| 语音 | 系统 `TextToSpeech`（部分老电视没有中文音色） | **832 个离线 mp3**：题干、每个选项、对/错音效，全部本地播放 |
| 包名 | `com.studyontv.tv` / `com.studyontv.mobile` | `com.babyontv.tv` / `com.babyontv.mobile` |
| 应用名 | 题了个题 | BabyOnTV |
| 其它 | — | **未改**：答题/解锁/加练/批改/时段/守护/面板逻辑 |

> 源码 package 仍为 `com.studyontv.tv`（namespace），所以无障碍组件名是
> `com.studyontv.tv.WatchAccessibilityService`；系统里显示的安装包名是 `com.babyontv.tv`。

---

## 功能（沿用上游）

- **多种玩法**：按组闯关、连续答对、自由练习；每组题量、及格比例、每日组数、每日时长可调。
- **时段管控**：按周设置可用时段，可区分「仅时段内可用」与「仅时段内需要答题」。
- **奖励与加练**：每次解锁时长、星级奖励、答错累计加练、间隔重复复习。
- **家长面板**：设备局域网 `http://<设备IP>:8099/admin/`，规则、题库、批改、使用记录都在这里。
- **主观题**：家长批改 / Agent 批改 / 兼容 DeepSeek 等 AI API。
- **守护**：开机、覆盖升级、屏幕点亮、网络变化时恢复管理服务；可选悬浮窗/无障碍/使用情况权限。
- **离线语音**：题干出现即播报；`←/→` 切换选项时播报该选项；答对/答错播放反馈音。

---

## 题库与语音

- 题库唯一入口：`data/seed.json`（每题带固定 `id`：`q_0`…`q_209`）。
- 音频目录：`data/audio/`，命名与题库一一对应：
  - 题干：`q_<id>.mp3`
  - 选项：`q_<id>_opt_<序号>.mp3`
  - 反馈：`sfx_correct.mp3` / `sfx_wrong.mp3`
- 重新生成语音（需要 Python 3.8+ 与 `edge-tts`）：

  ```powershell
  pip install edge-tts
  python scripts/generate_audio.py     # 会清空并全量重建 data/audio
  ```

- 构建前会自动校验「题库 ↔ 音频」一一对应（CI 同样校验，缺一个文件就失败）。

---

## 安装

- 从 [Releases](https://github.com/RonL89/BabyOnTV/releases/latest) 下载：
  - 电视：`BabyOnTV-TV-v*.apk`（U 盘或 ADB 安装）
  - 手机 / 平板：`BabyOnTV-Mobile-v*.apk`
- 首次打开：设置管理密码 → 按需开启权限 → 开始使用。
- 升级：应用内「检查更新」会读取本仓库的 Release（`-TV-` / `-Mobile-` 资产）。

> 旧版 BabyTV（`com.babytv.tv`）与 BabyOnTV 是不同包名，可共存；确认新版正常后卸载旧版即可。

---

## 家长面板与权限

- 电视上：品牌位连点 5 次，或在最上方连按 `↑` 5 次 → 家长验证。
- 手机 / 平板：点右上角「家长」，或长按题干。
- 手机扫码/浏览器打开 `http://<设备IP>:8099/admin/`，输入管理密码。
- 权限（可选，但管控生效需要）：悬浮窗、使用情况访问、无障碍、后台运行/自启动。
  ADB 一条龙脚本见 [LLM.md](LLM.md)。

---

## 构建与发版

- 本仓库通过 GitHub Actions 构建（`.github/workflows/build.yml`）：
  - 版本：`1.0.<run>`；`versionCode = 10000 + run`
  - 签名：GitHub Secrets `KEYSTORE_BASE64 / KEYSTORE_PASS / KEY_ALIAS / KEY_PASS`
  - 产物：`BabyOnTV-TV-v*.apk`、`BabyOnTV-Mobile-v*.apk`、`SHA256SUMS.txt`，自动发布 Release
- 本地构建需要 JDK 17 + Android SDK 36 + Gradle 8.14.x：

  ```powershell
  cd app/native
  gradle :app:assembleTvRelease :app:assembleMobileRelease
  ```

- 目录结构：

  ```
  app/web/         孩子端界面（HTML/CSS/JS）
  app/native/      Android 工程（tv / mobile 两个 flavor）
  admin/           家长管理面板（编译产物）
  data/seed.json   题库
  data/audio/      离线语音
  scripts/         语音生成等脚本
  ```

---

## 许可与致谢

- 上游：[chadyi/StudyOnTV](https://github.com/chadyi/StudyOnTV)，License 为 **Source Available / 个人非商用**；
  本项目沿用同一协议，仅限家庭个人使用，禁止商业用途与二次分发。
- BabyOnTV 的改造部分：题库、离线语音接入、品牌与包名。
