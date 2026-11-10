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

- 电视上：品牌位连点 5 次，或在最上方连按 `↑` 5 次 → 家长验证。
- 手机 / 平板：点右上角「家长」，或长按题干。
- 手机扫码/浏览器打开 `http://<设备IP>:8099/admin/`，输入管理密码。
- 权限（可选，但管控生效需要）：悬浮窗、使用情况访问、无障碍、后台运行/自启动。
  ADB 一条龙脚本见 [LLM.md](LLM.md)。

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

## 许可

- 本项目代码以 [LICENSE](LICENSE)（自有版权）发布：个人免费使用，禁止商用与再分发。
- 引用的第三方数据与库见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
