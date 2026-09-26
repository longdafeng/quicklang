# QuickLang 在 iPhone 17 Pro 上运行的可行方案

核实日期：2026-09-20。依据当前工作区源码（含正在开发的未提交修改）及 Apple、Tauri 官方资料。本次仅研究，未构建、签名或安装 iOS 应用，未连接手机验收。

## 结论

可以开发出可在 iPhone 17 Pro 上使用的版本，但当前 QuickLang 不能直接安装运行，也不能把现有网页入口公开后就完整使用。主要障碍是 macOS 专属存储、朗读和采集实现，而非手机型号。

- 希望尽快在手机上使用、保留 seekdb 和现有数据：优先开发“iPhone Safari / 主屏幕 Web App → HTTPS API → Mac 上的 QuickLang 存储服务”。Mac 必须保持运行且可达。
- 希望不依赖 Mac、离线背单词：开发 Tauri 2 iOS App，并新增手机本地存储与语音适配。SQLite 是候选方案，但这属于对当前“所有持久化统一 seekdb”设计的调整，不能当作已经选定的实现。
- 希望 iOS 安装图标且保留 seekdb：也可使用 Tauri iOS 薄客户端访问 Mac 服务，但仍需签名，且不因此获得离线能力。

## 当前代码的真实状态

| 部分 | 已确认事实 | 对手机运行的影响 |
| --- | --- | --- |
| 外壳 | `src/app/src/lib.rs:75` 已有 `mobile_entry_point`；`src/app/tauri.ios.conf.json:4` 最低版本为 iOS 18 | 有移动端起点，不代表业务已适配 |
| 数据库 | `src/crates/storage-seekdb/src/lib.rs:35` 非 macOS ARM64 返回 `UNSUPPORTED_PLATFORM`；`native.rs` 加载打包的 macOS 动态库 | iPhone 同属 ARM64 也不能使用此 macOS 运行包；只删除判断不能解决问题 |
| 启动 | `src/app/src/lib.rs:79` 无条件启动 seekdb 存储服务 | iOS 必须切换存储实现或改为远端 API |
| 网页门禁 | `src/ui/src/adapters/appState.ts:19` 拒绝非 Tauri 持久化；`src/ui/src/app/App.tsx:164` 在初始化失败时阻止进入主界面 | `npm run dev -- --host 0.0.0.0` 不等于手机可用版 |
| HTTP 服务 | `src/server/src/lib.rs:4` 仅有活性检查，其余返回 503；`main.rs` 仅监听回环地址 | 需要实现业务 API、身份验证、状态更新与部署入口 |
| 朗读 | `src/app/src/speech.rs` 调用 `/usr/bin/say`；前端 `features/speech/native.ts:8` 把所有 Tauri 环境视为原生语音可用 | iOS 需独立能力判断和语音实现，不能沿用 macOS 命令 |
| 凭据 | `src/app/src/ai_profiles.rs:68` 在非 macOS 上返回 Keychain 错误 | 原生 iOS 需要对应 Keychain 实现；Web 方案可把 AI 密钥保留在服务端 |
| 音频采集 | `src/app/src/interpretation_capture.rs` 非 macOS 返回不支持 | 手机麦克风、应用内媒体、跨应用录制必须分别设计 |
| 同步 | `src/crates/sync-core/src/lib.rs` 只有批次结构与校验 | Mac/iPhone 自动同步尚未实现 |
| 界面 | `src/ui/src/styles/main.css` 已有窄屏断点 | 可复用界面，但仍须验证安全区、软键盘、触摸操作与音频生命周期 |

当前 `storage-api` 只抽象了复习仓库，并未覆盖应用状态、词库、听力和 AI 配置；不能假定新增一个存储实现就能自动替换全部 seekdb 依赖。桌面命令中仍直接引用 `quicklang_storage_seekdb` 的类型。

本机检查：`xcode-select -p` 返回 `/Library/Developer/CommandLineTools`；`xcrun --sdk iphoneos --show-sdk-version` 失败，当前选中环境无 iOS SDK。常规 `/Applications/Xcode*.app` 路径未找到 Xcode。未核实手机的实际 iOS 版本及 Apple 开发者账号状态。

## 方案 A：手机 Web App + Mac 服务

建议作为保持现有数据库设计的第一阶段。实际运行分工是手机运行界面、Mac 运行数据与 AI 服务；不是完整程序全部搬到手机。

实施顺序：

1. 把应用状态、词库、生词表、学习进度相关用例暴露为明确的 HTTP API，前端支持 IPC / HTTP 两种传输。
2. 明确数据库唯一所有者。当前 `storage-seekdb/src/lib.rs:59` 使用排他文件锁，不能让桌面进程和新服务分别打开同一个数据库目录。可由运行中的桌面进程提供 API，或让独立服务成为唯一存储进程并让桌面也访问它。
3. 为手机增加设备配对/认证和可信 HTTPS 入口，优先使用同源界面与 API。手机通过局域网或受控远程网络访问；不要直接把开发端口当正式服务公开。
4. 让 Web 端不再进入桌面音色下载流程。基础朗读使用 Web Speech API，录音另行验证 iPhone Safari 支持、授权和格式；音频操作由用户点击触发。
5. AI 请求经服务端完成，保留现有 Mac Keychain 管理路径；手机不应获得 Mac 保存的原始 API Key。
6. 真机验证后，用 Safari 添加主屏幕。添加图标与离线能力是两件事：没有离线存储与缓存设计，Mac 断开后依然不可学习。

第一版范围建议：选词书、背词、拼写、生词表、进度、前台朗读；第二步再补麦克风听说练习。桌面系统音频采集与悬浮字幕不纳入手机第一版。

Safari / 主屏幕 Web App 的安装行为与离线机制应按实际 iOS 版本验证。HTTPS 对麦克风等浏览器能力至关重要；在手机上访问 Mac 的普通 HTTP 局域网地址不能等同于本机 localhost 的安全上下文。

[WebKit Safari 26 官方说明](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)明确：iOS 26 可将任意网站添加为主屏幕 Web App，manifest 与 Service Worker 并非安装前提；它们仍可用于改善元数据与离线体验。[Apple 操作步骤](https://support.apple.com/en-ng/guide/iphone/iphea86e5236/ios)：Safari 分享 → 添加到主屏幕 → 开启作为 Web App 打开。浏览器权限与安全上下文参见 [W3C 规范](https://www.w3.org/TR/secure-contexts/)。

## 方案 B：Tauri iOS 离线 App

[Tauri 官方前置要求](https://v2.tauri.app/start/prerequisites/)支持在 macOS 上使用完整 Xcode 构建 iOS。共享 React 界面与纯 Rust 领域逻辑可继续使用，不需要先重写成全套 SwiftUI。

需要先完成以下适配：

- 为 iOS 提供本地存储实现，覆盖应用状态、词库、练习记录和听力材料。若选择 SQLite，新增独立适配器，并重新设计 MySQL/seekdb SQL、事务与全文检索差异，不能直接复用全部建表 SQL。
- 保留 Mac 的 seekdb 数据，设计逻辑导出/导入；不可把 seekdb 数据目录直接当作手机数据库。多端同步是后续独立工作，需要事件幂等、冲突规则和实际学习状态接线。
- 用 iOS 的 [AVSpeechSynthesizer](https://developer.apple.com/documentation/avfoundation/speech-synthesis) 接替 `/usr/bin/say`。首版也可试验 Web Speech，但必须在 Tauri WebView 真机验证；“有 Tauri 桥”不等于“支持 macOS 朗读”。
- 实现 iOS Keychain、麦克风权限与音频会话；区分前台朗读、锁屏播放、来电中断和后台恢复需求。
- 按平台条件排除 macOS 专属资源、音色下载、采集桥和字幕窗口。核对 Tauri capability 与资源路径：当前 debug 路径引用 Mac 源码目录，真机无法直接读取该目录。
- 适配窄屏导航、底部安全区、拼写输入框、软键盘遮挡与自动纠错；在真实手机测试，不能以桌面缩窗替代。

手机其他 App 的系统音频与桌面采集不是同一个功能。Apple [ReplayKit](https://developer.apple.com/documentation/ReplayKit)提供屏幕、应用音频及麦克风录制机制，[安全说明](https://support.apple.com/en-ca/guide/security/seca5fc039dd/web)要求用户授权。跨应用广播扩展需单独研究和验收，不能承诺复制 Mac 的任意应用采集体验。

完成适配后的开发安装步骤：

1. 安装支持手机实际 iOS 版本的 Xcode 和 iOS 平台组件，登录 Apple Account 并配置开发团队。
2. 配置项目使用的 Rust 环境，安装 `aarch64-apple-ios` 真机目标；Apple Silicon 模拟器可加 `aarch64-apple-ios-sim`。按 Tauri 官方文档准备 CocoaPods 等依赖。
3. 从本项目的 Tauri 目录执行初始化与开发命令：

   ```sh
   cd /Users/longda/work/repo/myself/quicklang/src/app
   ../../node_modules/.bin/tauri ios init
   ../../node_modules/.bin/tauri ios dev --open
   ```

4. 用 USB 连接 iPhone、完成信任与开发者模式设置，在 Xcode 配置唯一 Bundle ID、Signing Team 和目标设备后运行。
5. 真机热更新需要手机能访问 Mac 的开发服务。现有 Vite 脚本绑定 `127.0.0.1`，需调整以配合 `TAURI_DEV_HOST`，再使用 `tauri ios dev --open --host`；不是仅修改 `devUrl`。
6. 日常使用需安装包含构建后静态资源的版本，不能依赖 Mac 上持续运行 Vite。

以上是适配完成后的流程，不是当前仓库已经通过的安装命令。仅调用 `ios init` 不会解决数据库或语音问题。命令参数已通过本地 Tauri CLI `--help` 核对，未实际执行初始化。

## 个人安装与长期使用

| 方式 | 条件与有效期 | 建议用途 |
| --- | --- | --- |
| Xcode Personal Team | 免费 Apple Account；开发描述文件 7 天到期，需要重新构建安装 | 初期真机验证 |
| TestFlight | Apple Developer Program；单个测试构建最多 90 天 | 自己持续试用、方便安装更新 |
| App Store | 付费开发者账号、签名和审核 | 正式长期分发 |

免费 Personal Team 有 App ID 与设备数量限制，详见 [Apple 账号说明](https://developer.apple.com/help/account/basics/about-your-developer-account)。付费计划通常为 99 美元/年或当地价格，见 [注册说明](https://developer.apple.com/help/account/membership/program-enrollment)。TestFlight 的使用期限见 [官方测试说明](https://testflight.apple.com/)，外部测试涉及 Beta App Review，见 [分发说明](https://developer.apple.com/testflight/)。

个人 Xcode 安装需按 [Apple Developer Mode 文档](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)启用开发者模式；TestFlight / App Store 安装与这个开发流程不同。Xcode 版本应匹配实际手机系统，核对 [官方兼容表](https://developer.apple.com/xcode/system-requirements)，不能只看项目中的最低 iOS 版本。

## 验收标准与范围

- Web 第一版：真实 iPhone 能进入词书、完成学习、重开页面保留进度；两端写入不丢失；手机朗读可停止与恢复；Mac 离线时明确提示连接不可用。
- iOS 第一版：真机冷启动成功；飞行模式可读词书、学习并保存进度；恢复网络后 AI 功能正常；录音授权拒绝/再次授权可恢复；无 Mac 路径或原生运行包依赖。
- 两种方案均需回归现有桌面数据与工作流。禁止把“网页能打开”“iOS 外壳编译成功”当成学习功能可用。

本次没有给出承诺工期：底层持久化抽象尚不完整，先打通“选书 → 学习 → 保存 → 重启恢复 → 朗读”的单条真机流程，才能可靠估算后续范围。
