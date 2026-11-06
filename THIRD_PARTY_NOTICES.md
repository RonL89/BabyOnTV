# Third-party notices

BabyTV 是对 [chadyi/StudyOnTV](https://github.com/chadyi/StudyOnTV) 的二次开发。上游原始代码的版权归 chadyi 所有，采用 Source Available / 个人非商用许可（见 `LICENSE`）。

The project's personal-use license applies to the project's original code. Bundled third-party libraries retain their own licenses.

## 上游项目

- chadyi/StudyOnTV — https://github.com/chadyi/StudyOnTV
  Copyright (c) 2024 chadyi. 上游 LICENSE 一并保留在本仓库根目录。
  本仓库对其做了：题库替换、幼儿化前端、离线语音链路、默认练习模式、CI 发布等改造。

## 第三方库

- KaTeX 0.16.22: MIT, by the KaTeX contributors. Bundled JavaScript, stylesheets and fonts are in `shared/katex`; the license is included in `shared/katex/LICENSE` and copied into the APK with the library.
- React, Radix UI, React Hook Form, Zod, TanStack Query, Recharts, Tailwind CSS, Lucide and Sonner retain their upstream licenses. The parent panel includes compiled distributions and license files in `admin/assets/notices/`.
- shadcn-admin UI components: MIT, Copyright (c) 2024 Sat Naing. Its license is included in `admin/assets/notices/shadcn-admin.txt`.
- The existing bundled QR-code generator retains the copyright and license notice in its distribution.

## 语音资源（重要）

- `data/audio/` 中的 mp3 由 `edge-tts` 调用 Microsoft Edge 在线语音合成服务生成，音色为 `zh-CN-XiaoxiaoNeural` 与 `en-US-JennyNeural`。
- 这些音频**不是**本项目的开源代码，也不是随开源协议授权的素材：它们属于对应语音服务的使用输出。
- 允许范围：个人、家庭、非商业的离线自用。
- 若需商业使用、上架应用商店或公开分发，请替换为自建语音合成（VITS / ChatTTS / 本地录音）后再发布，避免依赖第三方云语音服务条款。

## 设计参考

The reference APK inspected during interface design is not bundled with this project. No code, images or fonts from it are distributed here.
