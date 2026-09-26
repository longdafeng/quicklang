# QuickLang 当前代码审查与模块拆分建议

日期：2026-09-22。审查基线：HEAD `f38bb45` 加当前工作区的已跟踪修改和新增源码。本文不代表这些未提交修改已验证可发布。

用户目标：后台同时支持 macOS 和 iPhone；前端分为 desktop、ios 和公共部分；按 `/Users/longda/.codex/AGENTS.md` 整理代码。使用 Superpowers 的代码审查和设计流程，设计已由用户确认，源码重构与格式整理已实施；最终验证与手机安装记录见下方实施结果。

## 功能问题

### R1 — P2：取消启动后可能遗留 macOS 原生录音

- 位置：`src/app/src/interpretation_capture.rs:75-109`。
- Rust 在调用原生启动前释放 SESSION 锁，以允许权限弹窗期间停止；但 macOS 原生实现 `src/app/native/interpretation_capture.m:232-294` 依赖生命周期串行执行，且在授权结束后才登记 QLActiveCapture。
- 时序：首次申请麦克风权限 → 并发停止清空 Rust SESSION、原生因没有 active capture 提前返回 → 用户授权 → 原生继续启动 → Rust 仅返回 cancelled，没有停止原生录音。之后 stop 因 SESSION 已为空而跳过原生调用。
- 建议：在 macOS 原生层建立 pending-session/generation 取消协议，或保留平台适用的串行生命周期；避免旧启动清理新会话。不能仅补一个不区分会话的 stop。
- 验证：确定性覆盖暂停启动、停止、恢复启动，以及取消后再次启动。当前发现来自代码时序分析，未进行设备授权复现。

### R2 — P2：切入历史页会移除 PiP 返回事件订阅

- 位置：`src/ui/src/features/interpretation/IOSCaptionPiP.tsx:25-49`，`Interpretation.tsx:676,933-937`。
- PiP 的原生事件订阅和状态由按钮组件拥有；切入历史页会卸载该组件，但录音和原生 PiP 继续运行。
- 原生 `src/app/native/ios/caption_pip.m:160-161` 发出的 restore 事件不再被转成 `quicklang-open-captions`。回到启动页还会将按钮状态重置成 stopped，与仍运行的原生 PiP 不一致。
- 建议：将 PiP 订阅和状态放入持续挂载的 iOS 会话控制器，按钮只展示状态和触发操作。
- 验证：开启 PiP → 进入历史页 → 收到原生 restore → 返回字幕页；另测重新展示按钮时保留 active 状态。

### R3 — P2：已结束的字幕会话仍持续轮询完整结果

- 位置：`src/ui/src/features/interpretation/IOSCaptionPanels.tsx:125-150`。
- refresh 的 finally 无条件每两秒继续调度，不使用 active 或终态判断。`App.tsx:742-743` 在其他业务页用 hidden 保留同传组件，因此轮询也继续。
- 影响：结束后的字幕仍持续 IPC、后台读取和完整结果 JSON 序列化比较；长会话增加无用处理。
- 建议：以录音停止、最后一批已落盘和后台队列终态共同决定停止；显式重试重新启动轮询。不要在录音中途短暂出现 complete 时停掉轮询。
- 验证：活动会话持续更新、尾段未落盘时继续等待、最终完成停止请求、重试恢复请求、卸载清理定时器。

## 架构和规范问题

以下是维护性问题，不等同于已证实的功能故障。

| 位置 | 当前职责 | 建议 |
| --- | --- | --- |
| `src/ui/src/app/App.tsx`，866 行 | 启动、用户、导航、词库变换、持久化操作、所有页面组合 | 分离启动/用户状态、词库用例、路由内容和平台外壳 |
| `src/ui/src/features/interpretation/Interpretation.tsx`，1,401 行 | 本地/云端会话、历史、回放、模型调用、desktop/ios 视图 | 拆分会话控制、历史控制和两端展示 |
| `src/ui/src/adapters/desktop.ts` | 实际为两端共用的 Tauri IPC | 迁入 shared/native，使用平台中立名称 |
| 共享同传页面直接导入三个 IOS 组件 | 平台功能反向进入共享页面 | 由平台组合层注入视图和能力，shared 不导入平台目录 |
| `src/ui/src/styles/main.css`，1,537 行 | 基础样式、业务组件、两端布局和响应式规则 | 按共享基础、功能组件、平台外壳划分 |
| `src/app` | macOS 与 iOS 共用的 Tauri 宿主及原生适配层 | 已按确认方案从 desktop 改名为 app，Rust crate 同步改为 `quicklang-app` |

Rust 的跨平台业务不需要复制为两个后台。既有 domain/application/storage-api 等公共 crate 应继续复用；macOS 与 iOS 的存储和原生音频实现通过明确接口隔离。当前 SQLite 位于 storage-seekdb 包内，命名与职责并不完全一致，建议后续独立评估，避免同时扩大本轮迁移范围。

另一个统一服务的候选点是 `coach.rs` 与 `ai_network.rs` 的网络客户端和端点处理重复；需先对照代理与认证行为再抽取，不能只因代码相似而合并。

## 待确认的设计

### 三种选择

1. **推荐：单工程内建立 desktop / ios / shared 三层。** 能保持现有构建路径和依赖安装方式，同时分离平台职责。
2. 两个独立 npm 前端工程加公共包。构建和发布隔离更强，但本轮涉及更多脚本、资源和测试路径迁移。
3. 仅移动 IOS 文件、格式化其余代码。风险较小，但不能解决 App 和同传控制器的职责混杂，不满足完整的模块化目标。

推荐目录：

```text
src/ui/src/
  main.tsx                         # Select and compose the platform entry
  desktop/
    DesktopApp.tsx
    navigation/
    interpretation/
    styles/
  ios/
    IOSApp.tsx
    navigation/
    interpretation/               # PiP, local video, iOS caption views
    styles/
  shared/
    app/                          # Startup, learner state, page contracts
    features/                     # Reusable learning views and use cases
      library/
      interpretation/             # Capture/history controllers and contracts
    native/                       # Platform-neutral IPC transport
    contracts/
    styles/
```

依赖约束：入口组合 desktop 或 ios；两端依赖 shared；shared 不导入 desktop/ios；desktop 与 ios 不互相导入。平台专有 UI 和事件留在平台目录，共享状态通过类型化 props、hooks 和能力接口传递。已有的共享学习页面继续复用，不复制整份应用。

会话控制器拥有采集、后台任务订阅和释放流程，路由切换只决定视图是否展示。更换用户时明确清理旧会话，避免重构破坏已有的用户隔离。保持现有数据键、IPC command 名称、录音格式和原生打包路径。

执行顺序：固定上述问题的回归用例 → 修复生命周期 → 提取共享控制器和业务用例 → 拆分两端外壳/同传视图 → 调整导入与测试 → 格式化与验证。每次提取保持对外行为，避免只增加一层转发。

规范：遵循全局 AGENTS.md 的职责单一、显式依赖和英文文档要求；对新增/抽取的函数、方法、类补充英文文档；重要长流程提取阶段，必要的阶段注释用英文。沿用现有 formatter，不引入第二套风格配置。

## 已执行验证

- `npm run typecheck`：通过。
- `npm test -- --reporter=dot`：54 个文件、471 个测试全部通过。
- `npm run test:scripts`：81 通过、1 跳过、0 失败。
- `npm run format:check`：207 个非 Rust 文件中有 13 个需要格式化。
- 使用仓库 `deps/cache` 内 Rust 工具链执行 `cargo fmt --all -- --check`：失败，`history_subtitles/remote.rs` 两处 `.await` 排版不符。
- 同一工具链执行 `cargo test -p quicklang-storage-seekdb --features sqlite`：编译成功，测试进程启动后被 SIGKILL 终止；没有得到测试通过结果，原因尚未确定。

未执行：完整 macOS/iOS 打包、真机麦克风权限与 PiP 交互、真实模型服务验证。前端测试通过不覆盖这些原生时序问题。

实施后的验收还需包含：模块依赖方向检查、两端导航集成回归、会话持续性与用户切换、共享存储/IPC 兼容性、上述三个生命周期回归，以及相关平台的构建与可用设备验证。


## 实施结果

用户已确认方案，并追加 iPhone 本地模式固定化与真机更新要求。

- `src/ui/src/app/App.tsx` 只选择平台入口。
- `src/ui/src/desktop` 拥有桌面应用外壳、导航、同传视图，以及旧云端模式完整实现。
- `src/ui/src/ios` 拥有 iOS 外壳、导航、本地字幕、视频和持续存在的 PiP 控制器；没有字幕模式选择器，不依赖 desktop 模块。
- `src/ui/src/shared/app` 管理启动、用户隔离、共享页面和导航状态。
- `src/ui/src/shared/features` 复用学习、词库、历史、录音会话和分析工作流；词书解析与原子保存已从 App 提取。
- `src/ui/src/shared/native/transport.ts` 统一平台中立的 IPC 调用，原有原生命令契约保持兼容；iOS 已移除旧云端采集命令。
- 共享样式按功能拆分；两端 shell 样式独立，保留既有样式声明。
- R1：桌面原生采集保留会话预约直到取消清理完成，防止旧启动遗留录音或误停下一会话。
- R2：PiP provider 独立于启动/历史视图生命周期，返回事件订阅不会因切页丢失。
- R3：后台新增 `pollingComplete`，依据录音终结元数据、尾段和重试状态判断停止轮询，用户重试重新开始。
- iOS `pcm_capture` 只保留本地管线所需 PCM ABI；删除旧云端 WAV/JSON 事件编码和采集入口，保留本地录音分批 AI 翻译。
- 修复独立审查发现的菜单展开组回归，覆盖同页面导航；补齐新抽取方法的英文文档。

最终验证：`make test` 通过（144 Rust、488 前端、81 脚本测试；16 Rust 与 1 脚本测试按环境要求跳过）；SQLite 功能测试 30 项通过；iOS Release 已构建签名、安装到实体 iPhone 17 Pro 并成功启动；真机截图确认模式选择与云端入口已删除。完整记录见同目录 `2026-09-22-module-refactor-plan.md` 和 `build/refactor-validation/`。
