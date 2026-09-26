# 开发指南

仓库入口统一为薄 Makefile，由 `scripts/tasks.mjs` 分派任务；`make init` 先经 `scripts/init.sh` 引导环境。Node 任务入口可以跨平台调用，但当前完整初始化与嵌入式数据库运行时仅支持 macOS 15+ Apple Silicon，不能据此推断 Windows/Linux 已可运行桌面版。

运行 `make init` 准备固定依赖、seekdb 运行时和词库数据库，再按需执行：

- `make dev`：校验最终词库后启动 Tauri 桌面开发；`npm run dev` 仅启动 UI 浏览器预览（`127.0.0.1:1420`）。
- `make test`：许可检查、Rust fmt/Clippy/默认 workspace 测试、TypeScript、Vitest 和 Node 脚本测试。
- `make test-db`：校验词库及本机运行时后，串行运行真实 seekdb 集成、词库 schema、存储 crate 和桌面存储测试；默认测试中忽略的用例不计为通过。
- `make build`：运行时离线校验、许可与词库校验、UI 构建、离线 Rust server 编译及 Tauri 未签名打包。`npm run build` 仅做 UI 类型检查和 Vite 构建。
- `make docs`：文档开发服务器；`make docs-build` 或 `npm run docs`：静态文档构建。
- `make release`：重新构建、验证应用依赖及资源，输出完整离线 ZIP 和校验和到 `dist/releases/`，目前仅 macOS ARM64。
- `make install`：先构建，再安装到 `~/Applications/QuickLang.app`（可用 `INSTALL_DIR` 指定目录），拒绝覆盖已有安装，仅支持 macOS。

覆盖率命令及所需工具见[测试覆盖率与代码审查记录](./coverage-and-review)。这些是当前任务定义，不表示本次文档更新执行过这些验证。

## 本地文档网站

运行 `make docs` 启动 VitePress 文档站，默认访问 http://127.0.0.1:5173。
端口被占用时以终端显示的地址为准。修改文档后页面自动刷新，按 Ctrl+C 停止服务。
Windows 可运行 `node scripts/tasks.mjs docs`。

运行 `make docs-build` 构建可部署的静态网站，输出到 `build/docs/site/`。
`npm run docs` 保留静态构建行为，适用于现有自动化脚本。

### 文档目录与自动导航

- `docs/`：原始 Markdown 文档、图片、图源和供读者使用的静态资源；不放 npm 包配置或 VitePress 工具。
- `scripts/docs/`：文档工具包、VitePress 配置、自动导航及图形导出脚本。
- `build/docs/cache/`、`build/docs/runtime/`：开发缓存与临时构建文件。
- `build/docs/site/`：最终静态网站；`build/docs/diagram-reports/`：图形验证报告。
- 根目录 `node_modules/`：由 npm workspace 统一安装的依赖。

VitePress 通过 `srcDir` 直接读取 `docs/`，构建全部 Markdown 页面，无需复制源文件或维护页面清单。
启动入口仅在 `build/docs/runtime/.vitepress/` 生成引用正式配置的入口文件，确保 VitePress 自身的临时文件也留在 `build/`；原始文档不经过复制或筛选。
侧边栏递归按文档目录生成，页面标题优先使用 frontmatter 的 `title`，其次使用一级标题和文件名。
子目录的 `index.md` 作为该组入口；新增、删除和修改标题会触发导航更新，普通正文修改热更新。
例如 `docs/design/0.2/example.md` 对应 `/design/0.2/example`，保留原始层次。
`docs/public/` 是原样发布的静态资源目录，不参与 Markdown 导航扫描。

从旧布局升级后，应停止旧的 `make docs` 进程，再执行 `npm install` 和 `make docs`。
旧缓存及图形检查产物可通过 `node scripts/docs/migrate-layout.mjs` 一次性迁移到 `build/docs/`；该命令不会覆盖已有目标。

## 环境

完整开发环境为 macOS 15+ ARM64、Node 22.12+、Apple Command Line Tools 和 CMake；初始化还检查 npm、Git、curl、Perl、make。缺少 CMake 时仅在可用 Homebrew 存在时尝试安装，否则给出错误。
`make init` 准备固定 Rust 1.93.1（含 rustfmt、clippy）和 npm 11.12.1，缓存位于 `deps/cache/`，依赖按锁文件安装。Rust 不必由用户预先手动安装。
Windows 打包分支不等于已有可用嵌入式运行时；iOS 不能直接复用当前子进程数据库方案，尚无已验收移动工作流。

## 输出

- UI：`build/ui/`
- Rust：`build/cargo/`
- 应用：`dist/darwin-arm64/macos/QuickLang.app`
- 文档：`build/docs/site/`，可由任意静态服务器托管。
- 测试：`build/test-results/ui.xml`
- 许可：`build/compliance/dependencies.json`

静态站发布到子路径时设置 `DOCS_BASE=/quicklang/ make docs-build`。
当前未自动公开发布私有仓库文档。

## 内容

唯一维护的最终词库位于 `src/ui/public/content/word-library/`，浏览器预览和桌面应用共用这份数据。
其中包含 17,844 个单词、14 本词书的 60,897 个有序成员，以及 49,436 条历史来源映射；
同时保留合并冲突、清单、来源清单、许可和署名。详见[词库数据库说明](./word-library-schema)。

`make init` 校验并导入这份最终数据，仅补齐缺失记录，保留已有用户编辑和词书顺序。
`init`、`build`、`dev` 均不重新生成词库，也不依赖上游 checkout。
`source-manifest.json` 中的历史路径仅用于来源追溯，不是构建或运行依赖。

## 日常审查

`make review` 检查全部 Rust workspace（含桌面壳）、TypeScript 和仓库边界。
`make test` 检查核心行为、失败路径、UI 定时器及导入数据验证。
