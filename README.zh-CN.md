# ScreenBloom

**隐私优先的开源录屏转 GIF 工具，基于浏览器原生 WebCodecs。**

在浏览器里把录屏截取、裁剪、调整尺寸与速度，导出体积友好的 GIF 或静音 MP4。整个过程都在本地完成。

[English](README.md) · [架构文档](docs/ARCHITECTURE.md) · [GIF 编码器](docs/GIF_ENCODER.md) · [浏览器支持](docs/BROWSER_SUPPORT.md) · [路线图](docs/ROADMAP.md)

- **不上传**：视频只在当前浏览器标签页中读取和编码，不会发送到任何服务器。
- **无后端、无账号、无埋点**：构建产物是纯静态站点，没有统计脚本，也不请求任何第三方资源。
- **针对界面录屏优化的 GIF**：全局稳定调色板、帧差编码、精确到厘秒的帧时长。
- **静态部署**：`npm run build` 生成的文件可以放到任何静态托管上。
- **开源**：采用 [MIT 许可证](LICENSE)。

> **演示**：仓库暂未附带演示 GIF（见[发布报告](docs/OPEN_SOURCE_RELEASE_REPORT.md)）。

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

对应的实测耗时见 [docs/PERFORMANCE.md](docs/PERFORMANCE.md)。

## 隐私

- 视频以本地 `File` 对象打开，在 Web Worker 中分块读取，从不上传。
- 文件名只用于界面显示和下载文件名。
- 没有统计、遥测、外部字体或 CDN，页面只加载站点自身的静态文件。
- 端到端测试会记录导入和导出过程中的全部网络请求；只要出现跨域请求或非 `GET` 请求，测试就会失败。

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

## 快速开始

环境要求：Node.js 24 LTS（最低 22.12）；使用时推荐桌面版 Chromium 内核浏览器。

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
| `npm run build` | 静态导出到 `out/`（同时把 `LICENSE` 和第三方声明复制进去） |
| `npm start` | 在 <http://127.0.0.1:4173> 提供 `out/`，并附带推荐的安全响应头 |
| `npm run samples` | 生成合成测试视频到 `samples/`（需要 Google Chrome 和 ffmpeg） |
| `npm run e2e` | 基于生产构建、在 Chrome 中运行的端到端测试 |
| `npm run e2e:stress` | 大文件与上限测试（先运行 `node scripts/make-samples.mjs --stress`） |

代码结构：

```
src/
  app/          Next.js 入口（静态导出）
  components/   界面：首页、编辑器（预览、裁剪、时间轴、设置、导出栏）、结果页
  hooks/        useSourceLoader、useExportJob、usePlayback、useCapabilities
  lib/
    edit/       领域层：EditParams、参数校验、裁剪几何、输出尺寸、帧时间计划（纯 TypeScript）
    jobs/       Worker 消息协议与客户端（每个任务一个 Worker）
    media/      探测、能力检测、错误分类、帧缩放（仅 Worker）
    encode/     GIF 与 MP4 流水线；gif/ 为调色板、帧差、GIF89a 写入、LZW（仅 Worker）
    i18n/       中英文文案
  workers/      media.worker.ts
```

## 构建

```bash
npm run build
```

`out/` 是纯静态站点（约 1.3 MB），Worker 包只在用户打开文件后才会下载。

## 测试

| 测试 | 命令 | 覆盖范围 |
| --- | --- | --- |
| 单元测试（Vitest） | `npm test` | 编辑参数与校验、裁剪几何、输出尺寸、GIF/MP4 帧时间、GIF89a 结构、LZW 往返、帧差、GIF 流水线像素级回归、错误分类 |
| 端到端（Playwright + Chrome） | `npm run e2e` | 通过真实界面操作并下载真实文件，用 ffprobe 和独立的 GIF 解析器检查：截取、裁剪、旋转、可变帧率、预设、循环次数、静音 MP4、取消后重新导出、更换文件、Object URL 释放、中英文、小屏布局、无跨域请求 |
| 压力测试 | `npm run e2e:stress` | 5K 输入、6K 拒绝、60 秒 GIF、62 秒 MP4 |

最新结果记录在 [docs/OPEN_SOURCE_RELEASE_REPORT.md](docs/OPEN_SOURCE_RELEASE_REPORT.md)。


## 架构

分层、数据模型、Worker 协议、编码流水线、资源生命周期、错误模型与设计决策见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；GIF 编码器见 [docs/GIF_ENCODER.md](docs/GIF_ENCODER.md)。

## 自托管

构建一次，把 `out/` 上传到任意静态托管（Nginx、Caddy、对象存储、CDN、GitHub Pages 等）即可。必须通过 **HTTPS** 访问（WebCodecs 需要安全上下文），`.js` 需要以 JavaScript MIME 类型提供，部署在子路径下时在构建时设置 `BASE_PATH=/tools/gif npm run build`。完整说明和推荐的安全响应头见 [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)。

## 参与贡献

欢迎贡献，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和[行为准则](CODE_OF_CONDUCT.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 许可证

[MIT](LICENSE)。生产构建中包含遵循各自许可证的第三方代码，其中 Mediabunny 为 MPL-2.0，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
