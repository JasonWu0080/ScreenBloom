<div align="center">

<img src="src/app/icon.svg" width="72" height="72" alt="ScreenBloom 标志">

# ScreenBloom

**把视频变成精美的 GIF，直接在浏览器里完成。**

为开发者和创作者打造的隐私优先 GIF 制作工具。

[**在线体验**](https://screenbloom.storyweave.cloud) · [功能](#功能) · [快速开始](#快速开始) · [参与贡献](#参与贡献)

[English](README.md) | 简体中文

[![MIT License](https://img.shields.io/github/license/JasonWu0080/ScreenBloom)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/JasonWu0080/ScreenBloom)](https://github.com/JasonWu0080/ScreenBloom/releases)
[![CI](https://github.com/JasonWu0080/ScreenBloom/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JasonWu0080/ScreenBloom/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](package.json)

</div>

直接在浏览器中将录屏和视频转换为 GIF。支持时间裁剪、画面裁剪、帧率调整和导出优化，无需上传文件。

## 在线体验

**[立即在线体验 ScreenBloom → screenbloom.storyweave.cloud](https://screenbloom.storyweave.cloud)**

无需安装，无需注册。视频只在你的浏览器标签页中处理，不会上传。推荐使用最新版桌面 Chrome 或 Edge（见[浏览器兼容性](#浏览器兼容性)）。

## 预览

<p align="center">
  <img src="docs/assets/screenbloom-demo.gif" width="960" alt="ScreenBloom 演示：打开视频、在时间轴上截取片段、裁剪画面、选择预设、导出并预览 GIF">
</p>

上面的演示录制自真实应用，并**用 ScreenBloom 自己**转换成 GIF（960 × 600、12 fps、13.8 秒、1 MB），由 [`scripts/make-assets.mjs`](scripts/make-assets.mjs) 生成。

<details>
<summary>编辑器截图</summary>

![ScreenBloom 编辑器：已截取片段，预览上显示裁剪框](docs/assets/screenbloom-preview.png)

</details>

## 功能

适合 GitHub README、Issue 问题复现、更新日志、产品演示和技术文档。

| 环节 | 能做什么 |
| --- | --- |
| 导入 | 选择或拖入本地视频。是否支持由实际解封装和解码首帧决定，而不是看扩展名。 |
| 截取 | 拖动起止手柄或输入精确时间；可把当前播放位置设为起点 / 终点。 |
| 裁剪 | 在预览上拖动裁剪框或输入像素值；自由、原始、16:9、1:1、9:16。手机录屏的旋转信息会自动校正。 |
| 输出 | 输出宽度（不会放大）、帧率 1–30 fps、速度 0.25–4×、首尾帧停留 0–10 秒。 |
| 预设 | 小文件（640 px、10 fps、128 色）、均衡（960 px、15 fps）、高清（1280 px、24 fps、轻度抖动）。 |
| GIF | 无限循环或播放 N 次、32–256 色、可选有序抖动。 |
| 静音 MP4 | 仅 H.264 视频轨，文件中根本没有音轨；三档画质。 |
| 导出 | 真实进度（已处理帧数 / 总帧数）、已用时间、随时取消、结果预览与下载。 |
| 语言 | 简体中文、英文。 |

### 本地处理上限

处理全部在用户设备上进行，以下上限用于避免页面卡死或内存耗尽。配置集中在 [`src/lib/config.ts`](src/lib/config.ts)，超出时会在开始编码前说明原因并禁用导出。

| 项目 | 上限 |
| --- | --- |
| 源文件大小 | 2 GB（按需分块读取，不会整体载入内存） |
| 源画面最长边 | 5120 px（5K） |
| GIF 输出 | ≤ 60 秒且 ≤ 1500 帧；最长边 ≤ 1600 px |
| MP4 输出 | ≤ 300 秒；最长边 ≤ 1920 px |

## 工作原理

```
React 界面 ──（编辑参数快照）──► 专用 Worker（每个任务一个）
                                  ├─ Mediabunny：解封装 + WebCodecs VideoDecoder
                                  ├─ 裁剪 + 高质量缩小（OffscreenCanvas）
                                  ├─ GIF：全局调色板 → 颜色映射 → 帧差 → GIF89a + LZW
                                  └─ MP4：WebCodecs VideoEncoder（H.264）→ MP4 封装
```

- 解码与编码使用浏览器原生 **WebCodecs**，解封装和 MP4 封装借助 [Mediabunny](https://mediabunny.dev)。
- **GIF 写入器和 LZW 压缩是本项目自己的实现**；颜色量化使用 [`gifenc`](https://github.com/mattdesl/gifenc) 中的 PnnQuant 实现。详见 [docs/GIF_ENCODER.md](docs/GIF_ENCODER.md)。
- 每次导出都在新建的专用 Worker 中执行，完成、失败或取消时立即终止。
- 不使用 FFmpeg/WASM：Worker 包约 500 KB（gzip 后约 130 KB），也不需要特殊的服务器响应头。

在 Apple M4 的 Chrome 中，一段 10 秒的 1080p 录屏导出为 800 px、15 fps 的 GIF 约需 1.3 秒（[实测数据](docs/PERFORMANCE.md)）。

## 浏览器兼容性

ScreenBloom 需要在安全上下文（HTTPS 或 `localhost`）中使用 WebCodecs、`OffscreenCanvas` 和模块 Worker。页面会在运行时检测，并明确列出缺少哪个 API。导出 MP4 还需要 H.264 编码器；没有时 GIF 导出仍然可用。

| 状态 | 浏览器 |
| --- | --- |
| 已验证（自动化端到端测试） | macOS（Apple 芯片）和 Linux（CI，无头模式）上的 Google Chrome |
| 部分验证 | Chrome 设备模拟下的 375 px 手机布局（不等于真实移动浏览器） |
| 尚未测试 | Edge、Safari、Firefox、Windows、Android、iOS |

详细依据和手动测试清单见 [docs/BROWSER_COMPATIBILITY.md](docs/BROWSER_COMPATIBILITY.md)。

## 隐私

**你的视频只留在你的浏览器里。**

- 视频以本地 `File` 对象打开，在 Web Worker 中分块读取。视频、视频帧、音频以及导出的 GIF/MP4 都不会上传。
- 文件名只用于界面显示和下载文件名。
- 没有后端、账号、统计、遥测、外部字体或 CDN，页面只加载站点自身的静态文件。
- 端到端测试和冒烟测试会记录导入和导出过程中的全部网络请求，只要出现跨域请求或非 `GET` 请求就会失败；冒烟测试也在生产站点上运行过。
- 推荐的部署配置发送 `Content-Security-Policy: connect-src 'self'`，浏览器本身也会阻止向其他地址发送数据。

## 快速开始

**只想做个 GIF？** 打开 <https://screenbloom.storyweave.cloud>，拖入视频，导出即可。

**在本地运行**——环境要求：Node.js 24 LTS（最低 22.12），以及桌面版 Chromium 内核浏览器。

```bash
git clone https://github.com/JasonWu0080/ScreenBloom.git && cd ScreenBloom
```

```bash
npm ci
```

```bash
npm run dev
```

打开 <http://localhost:3000>。请使用 `localhost` 或 HTTPS 访问：浏览器只在安全上下文中提供 WebCodecs，用局域网 IP 打开开发服务器时页面会给出说明而无法处理视频。需要在手机等其他设备上测试时，可以使用 `npx next dev --experimental-https`。

## 开发

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run check` | 类型检查 + Lint + 单元测试 |
| `npm run build` | 静态导出到 `out/`，同时包含 `LICENSE`、第三方声明和 `version.json` |
| `npm start` | 在 <http://127.0.0.1:4173> 提供 `out/`，并附带推荐的安全响应头 |
| `npm run samples` | 生成合成测试视频到 `samples/`（需要 Google Chrome 和 ffmpeg） |
| `npm run e2e` | 基于生产构建、在 Chrome 中运行的端到端测试 |
| `npm run e2e:smoke` | 关键路径冒烟测试；设置 `E2E_BASE_URL=https://…` 可对任意部署运行 |
| `npm run e2e:stress` | 大文件与上限测试（先运行 `node scripts/make-samples.mjs --stress`） |
| `npm run bench` | GIF 导出基准测试（多次运行取中位数，可与基线比较） |

代码结构：

```
src/
  app/          Next.js 入口（静态导出）、元数据、robots/sitemap、图标
  components/   界面：首页、编辑器（预览、裁剪、时间轴、设置、导出栏）、结果页
  hooks/        useSourceLoader、useExportJob、usePlayback、useCapabilities
  lib/
    edit/       领域层：EditParams、参数校验、裁剪几何、输出尺寸、帧时间计划（纯 TypeScript）
    jobs/       Worker 消息协议与客户端（每个任务一个 Worker）
    media/      探测、错误分类、帧缩放（仅 Worker）
    encode/     GIF 与 MP4 流水线；gif/ 为调色板、帧差、GIF89a 写入、LZW（仅 Worker）
    i18n/       中英文文案
    capabilities.ts、site.ts、config.ts、format.ts
  workers/      media.worker.ts
```

## 架构

分层、数据模型、Worker 协议、编码流水线、资源生命周期、错误模型与设计决策见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；GIF 编码器见 [docs/GIF_ENCODER.md](docs/GIF_ENCODER.md)。

## 测试

| 测试 | 命令 | 覆盖范围 |
| --- | --- | --- |
| 单元测试（Vitest，69 项） | `npm test` | 编辑参数与校验、裁剪几何、输出尺寸、GIF/MP4 帧时间、GIF89a 结构、LZW 往返、帧差与复杂运动下的残影回归、错误分类、能力检测、格式化 |
| 端到端（Playwright + Chrome，69 项） | `npm run e2e` | 通过真实界面操作并下载真实文件，用 ffprobe、独立的 GIF 解析器和 Chrome 完整逐帧解码检查：截取、裁剪、旋转、可变帧率、预设、循环次数、静音 MP4、取消（Worker 已终止）后重新导出、更换文件、Object URL 释放、缺少 API 的提示、SEO 元数据、中英文、小屏布局、无跨域请求 |
| 冒烟测试（46 项） | `npm run e2e:smoke` | 可对任意部署运行的关键路径，以及连续导出时的 Worker 生命周期和主线程内存 |
| 压力测试（8 项） | `npm run e2e:stress` | 5K 输入、6K 拒绝、60 秒 GIF、62 秒 MP4 |

最新结果见 [docs/audits/TEST_REPORT_V1.md](docs/audits/TEST_REPORT_V1.md)。

## 部署

`npm run build` 在 `out/` 生成纯静态站点（约 1.4 MB），可放到任何支持 **HTTPS** 的静态托管上。带版本标签的 Release 也会附带 `screenbloom-vX.Y.Z-static.zip`（用于自托管的网站文件，不是桌面应用）。每次构建都包含 `version.json`，记录版本号、Git 提交和构建时间，首页底部也会显示。

自行托管时请在构建时设置 `SITE_URL`，让 canonical 和 Open Graph 链接指向你的地址；部署在子路径下时设置 `BASE_PATH`。完整说明和推荐的安全响应头见 [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)。

## 参与贡献

欢迎贡献，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和[行为准则](CODE_OF_CONDUCT.md)。计划中的工作见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 安全

请按 [SECURITY.md](SECURITY.md) 私下报告安全漏洞，不要提交公开 Issue。

## 许可证

[MIT](LICENSE)。生产构建中包含遵循各自许可证的第三方代码，其中 Mediabunny 为 MPL-2.0，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
