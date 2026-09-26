# 架构图工具与维护

## 工具选择

本项目采用 **Archify** 生成架构图与流程图。当前工作环境已经安装 Archify 技能包，`doctor` 检查通过，因此没有重复安装或添加应用运行时依赖。

工具在本机的位置为 `~/.codex/skills/archify`。它使用 Node.js，包内包含命令行、JSON Schema、渲染器和校验器。该路径是本机工具路径，并不意味着克隆仓库后会自动获得它；其他维护者需要单独准备相同工具包。

**能力边界：**先阅读源码，提取真实模块和调用关系，再编写 JSON 图源，最后由工具布局、渲染及校验。它不是可以自动验证完整业务语义的代码扫描器。

## 文档组成

- [整体架构](./overview)：运行边界、数据归属、Rust 分层以及整体图。
- [模块与流程](./modules)：模块职责、源码入口及主要成功／失败路径。
- `docs/architecture/diagrams/`：可编辑的 JSON 图源。
- `docs/public/architecture/`：供 VitePress 发布的交互式 HTML 和 SVG 阅读资源。
- `scripts/docs/export-svg.mjs`：SVG 导出工具。
- `build/docs/diagram-work/`：图形生成及视觉校验工作目录；`build/docs/diagram-reports/`：SVG 导出记录。检查截图、报告和临时文件不进入原始文档目录。

## 已生成的图

- [整体架构 SVG](/architecture/quicklang-overall.svg) · [交互版](/architecture/quicklang-overall.html)
- [学习、AI 与持久化流程 SVG](/architecture/quicklang-learning.svg) · [交互版](/architecture/quicklang-learning.html)

图源分别为 `quicklang-overall.architecture.json` 与 `quicklang-learning.workflow.json`。本次更新将两个 JSON 图源改为 seekdb 应用状态持久化；学习流程交互 HTML 已由 CLI 重新生成，通过 showcase 9/9 检查、0 错误、0 警告。整体架构 HTML 未能重新生成：Archify 指出图源固定 revision 下找不到 `src/ui/src/features/study/shared.tsx`，因此保留旧产物，不宣称校验或生成成功。图仍未完整覆盖同声翻译的原生采集和独立 AI 请求链路，完整边界以[模块说明](./modules#interpretation)为准。

**整体交互 HTML 及两个静态 SVG 已过时：**整体交互 HTML 和上述两个 SVG 保留此前导出结果，仍有 localStorage 关系，不可当作当前实现依据。现有 SVG 导出脚本依赖 Chrome 查看器；本次未获浏览器自动化授权，未运行导出或视觉检查，也未用文本替换伪造规范导出。架构正文暂不嵌入旧 SVG。交互 HTML 更新不等于静态 SVG 已同步。

此前两图的 showcase 9/9 和四种桌面尺寸溢出检查属于历史记录；本次不宣称重新完成浏览器视觉验收。`visual-check.*.png` 仅是查看器检查截图，不是完整图形 PNG 导出。

## 重新生成

在项目根目录可直接执行（按实际安装位置调整 `ARCHIFY`）：

```bash
ARCHIFY="$HOME/.codex/skills/archify"
ROOT="$PWD"
WORK="$ROOT/build/docs/diagram-work"
mkdir -p "$WORK" "$ROOT/docs/public/architecture"
node "$ARCHIFY/bin/archify.mjs" deliver architecture "$ROOT/docs/architecture/diagrams/quicklang-overall.architecture.json" "$WORK/quicklang-overall.html" --repo-root "$ROOT" --quality showcase --json
node "$ARCHIFY/bin/archify.mjs" deliver workflow "$ROOT/docs/architecture/diagrams/quicklang-learning.workflow.json" "$WORK/quicklang-learning.html" --quality showcase --json
node scripts/docs/export-svg.mjs "$ARCHIFY" "$WORK"
xmllint --noout "$WORK/quicklang-overall.svg" "$WORK/quicklang-learning.svg"
cp "$WORK/quicklang-overall.html" "$WORK/quicklang-overall.svg" "$WORK/quicklang-learning.html" "$WORK/quicklang-learning.svg" "$ROOT/docs/public/architecture/"
npm run docs
```

SVG 导出脚本复用已安装工具的 Chrome 查看器运行时，需要 Chrome/Chromium，并写入 `*.svg-export.json` 记录源 HTML 与 SVG 的 SHA-256。图源包含源码依据；后续代码变化时应先核实并更新依据，不能机械重渲染旧关系。


在 Archify 工具目录执行以下命令。`<类型>` 使用 `architecture` 或 `workflow`；图源和输出均使用绝对路径，避免写入工具目录。

```bash
cd ~/.codex/skills/archify
node bin/archify.mjs doctor
node bin/archify.mjs validate <类型> <图源.json> --quality showcase --json
node bin/archify.mjs deliver <类型> <图源.json> <输出.html> --quality showcase --json
```

校验失败时，先根据诊断修正对应节点、标签或连线，再重新校验；不要为了通过布局检查删除真实业务关系。`deliver` 成功后保留输出中的摘要、校验信息与文件哈希，便于追踪实际交付版本。

需要桌面尺寸截图和溢出检测时，可执行工具自带的检查：

```bash
node bin/archify.mjs visual-check <输出.html> --json
```

该命令需要可用的 Chrome/Chromium。自动检测通过不等于已经人工检查美观性；如果环境缺少浏览器，应如实记录跳过，而不是声称完成视觉验证。

最后回到项目根目录构建文档：

```bash
npm run docs
```

## 更新时必须复核的关系

1. `App.tsx` 的页面是否实际调用对应 adapter，不能只看 adapter 存在。
2. `src/app/src/lib.rs` 是否真实注册命令，命令是否只在特定平台实现。
3. 持久化是否统一写入 seekdb；Keychain 是否仅保存主密钥；临时文件和打包资源是否与应用状态明确区分。
4. 外部 AI、系统 TTS 和录音转写是否为不同链路，有无浏览器限制。
5. 服务端、同步及数据库迁移是正在使用、兼容保留还是拟议方案。
6. 失败分支是否保留真实语义：数据库不可用、词库未就绪、凭据拒绝、网络失败和用户取消不应混为一谈。

## 阅读与导出

交互 HTML 可独立打开，提供缩放、检索与主题切换等工具自带能力。需要图片时，可在查看器的导出菜单生成完整图形；截图只用于视觉检查，不应冒充完整高清导出。

图形布局校验、图片导出、文档构建和业务测试属于不同检查。此次文档更新不改变业务实现，也不以文档构建代替数据库或系统语音的运行测试。
