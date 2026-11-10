# Third-party notices

本项目的原创代码以 `LICENSE`（个人使用许可）发布。仓库中打包的以下第三方数据与工具库保持其自身的许可证，逐项列出：

- **holiday-cn**（法定节假日公开数据，https://github.com/NateScarlet/holiday-cn ）：
  CC0 1.0 /	Public Domain 风格许可，打包于 `data/holidays/`；运行时也可经 jsDelivr 获取最新数据。
- **渐近包装器（可移除）**：无。
- **KaTeX**：原项目不再内置。公式渲染如需要，可自行引入（MIT）；当前孩子端标题全部纯文本实现，不依赖任何渲染库。
- **React** 等 UI 库：家长面板不再使用任何第三方 UI 框架 —— `admin/assets/panel.{css,js}` 是手写的零依赖实现。
- 手写二维码生成器 `app/web/assets/js/qrcode.js` 参考规范（ISO/IEC 18004）自行实现，包含文档注释。

除此之外没有其它第三方代码。原项目（如上游题了个题等）的代码以**零行**存在于本仓库。
若发现任何无意保留的第三方代码，请提 issue，会在 48 小时内移除。
