# docs/

> ⚠️ **存档说明**：本目录是上游 [chadyi/StudyOnTV](https://github.com/chadyi/StudyOnTV) 的原始文档与截图，保留用于追溯来源。
> BabyTV 的实际用法请以仓库根目录的 [README.md](../README.md) 为准；文中出现的「题了个题 / StudyOnTV」为上游旧名。

README 里引用的图片资源。

| 文件 | 说明 |
|---|---|
| `how-it-works.png` | 「它是怎么工作的」流程图（README 中使用，2x 分辨率，已压到约 120KB） |
| `how-it-works.svg` | 上面这张图的矢量源文件，可直接改文案后重新导出 |
| `wechat-group.jpg` | 家长交流微信群二维码。**微信群二维码 7 天内失效**，过期时用新的替换同名文件即可 |

## 重新生成流程图

```bash
node scripts/gen-how-it-works.mjs
```

脚本纯 Node（无第三方依赖）：先按内容生成 SVG，再用本机 Chrome 无头模式截图为 2x PNG，最后用 Python + Pillow 做调色板压缩。
改文案只需要编辑脚本顶部的 `steps` 数组。

## 换微信群二维码

1. 导出新的群二维码图片，命名为 `wechat-group.jpg` 放到本目录（覆盖旧文件）；
2. README 里的 `<img>` 不用改。

## 其它文档

- [安装指南](./install.md)
- [让 AI 加题（局域网接口）](./ai-api.md)
- [埋点说明](./analytics.md)
- [版本更新机制](./update.md)
