# QuickLang iOS SQLite 开发版验证

日期：2026-09-21。代码与 Mac 版共用当前 QuickLang 仓库。

## 实现边界

- iOS 编译目标自动使用静态链接 SQLite；macOS 默认仍使用 seekdb。
- 连接、结果行和事务由存储驱动封装；SQL 差异集中在 `src/crates/storage-seekdb/src/dialect.rs`，复习、词库、听力、设置及 AI 配置共用业务实现。
- SQLite 使用 WAL、完整同步、版本检查和原子事务，存储目录为应用沙盒内 `Library/Application Support/io.github.longdafeng.quicklang/sqlite/`。
- 原生朗读使用 iOS AVSpeechSynthesizer；AI 配置加密主密钥使用 iOS Keychain。
- 手机界面支持安全区域、触控目标和折叠导航。新增 iOS 27 同传采集与页内本地字幕；Mac 式跨应用悬浮字幕仍未移植。新增能力的真机验收状态见下文。
- 未实现 Mac 数据迁移、跨设备同步或 seekdb 移动后端切换。未来后端需通过同一持久化行为测试再接入。

## 已验证

| 范围 | 结果 |
| --- | --- |
| SQLite 持久化测试 | 30 项通过，含完整词库、重开、回滚、中文与引号、复习 CAS/幂等、加密配置与听力数据 |
| 默认 seekdb 单元测试 | 34 项通过；7 项既有真实引擎测试未执行 |
| 前端 | 全部 49 个测试文件、438 项测试通过；TypeScript 与生产构建通过 |
| Mac 原生回归 | 56 项通过、5 项既有集成测试忽略；首次测试进程无输出 SIGKILL 后再次运行通过 |
| iOS 脚本及 scene 配置 | 9 项检查通过，含构建路径、生成脚本修复、旧产物清理及上游补丁完整性 |
| iPhone 17 模拟器 / iOS 27 | 应用安装、启动和创建用户页面截图通过；沙盒 SQLite 完整性为 `ok`，10 张表、17,844 个单词、11 本词书；终止后再次启动成功 |
| ARM64 真机安装包 | 构建和开发签名通过，IPA 已导出；`codesign --verify --deep --strict` 通过 |
| iPhone 17 Pro 真机 / iOS 27 | 安装、启动与界面截图通过；停止进程后复制沙盒 SQLite 检查，完整性为 `ok`，10 张表、17,844 个单词、11 本词书，用户设置已有 1 条记录 |
| iOS 原生语音运行 | 隔离模拟器应用枚举 68 个音色，Samantha 合成英语测试句；WAV 为 22,050 Hz、54,172 字节、1.227 秒，校验通过 |

真机已完成安装、启动和数据库落盘检查。检查后设备连接中断，重新启动命令未成功，因此真机重启后的数据读取尚未验收；朗读、录音与 Keychain 操作也仍需真机功能验收。模拟器结果不代表这些真机检查已通过。

iOS 语音桥已通过真机和模拟器 SDK 的严格编译。独立原生朗读 smoke harness 已产生 PASS 标记和非静音 WAV；复现脚本为 `tests/native/ios-platform-smoke.sh`，输出位于 `build/ios-native-smoke/`。该隔离测试不访问应用数据库或 Keychain，也不代替应用界面内的播放、停止及实体设备音频验收。

## 逐字母拼读修复

飘单词与强化学习共用的 `nativeSpellingText` 生成 macOS `say` 的 character-mode 指令。iOS 原先将这些指令当作普通文本交给 AVSpeechSynthesizer，导致拼读错误。现在 iOS 语音桥仅识别完整的拼读请求，将小写字母逐个转换为带明确 IPA 字母名的 utterance，再以 300 毫秒 PCM 静音连接成一个 WAV；同一请求中的重复字母复用音频。普通文本朗读和 Mac 的实现保持原有路径。

原生回归覆盖全部 26 个字母、单字母词、普通文本和无效标记；真实模拟器合成验证重复字母音频一致及 300 毫秒静音。关闭该修复的对照版本会在重复字母检查失败，启用后通过。相关前端测试 43 项通过。证据位于 `build/ios-spelling-regression-before.log`、`build/ios-spelling-smoke.log`、`build/ios-spelling-ui-tests.log`，试听音频位于 `build/ios-native-smoke/spelling-alphabet.wav`。

拼读修复与图标修复已于当日一并构建、签名校验、覆盖安装到 iPhone 17 Pro 并成功启动；没有删除应用或沙盒数据。真机主观听感仍需界面试听确认。安装和启动证据为 `build/ios-spelling-icon-install.json`、`build/ios-spelling-icon-launch.json`。

用户再次反馈部分字母听感不清晰。只读核实真机设置为 Samantha 基础音色、1 倍语速；前端未压缩中间停顿。第二版仅调整 iOS 拼读：语速上限 0.8 倍（保留更慢设置），字母间静音 500 毫秒，拼读首尾各保留 250 毫秒静音，避免与相邻整词相连。Mac 版及普通整词的语速不变。模拟器原生回归已验证 26 个字母、重复片段一致性、500 毫秒字母间静音及 250 毫秒边界静音；普通句子输出仍为 54,172 字节。日志为 `build/ios-spelling-clarity-smoke.log`。这些检查不等同于主观发音清晰度验收，仍待用户具体单词和字母的试听反馈。

第二版已通过真机构建与签名校验，并覆盖安装到 iPhone 17 Pro，证据为 `build/ios-spelling-clarity-build.log`、`build/ios-spelling-clarity-install.json`。

## 应用图标统一

iOS 生成工程原先仍引用 Tauri 默认图标。`scripts/ios.mjs` 现在在初始化后、构建或运行前，将仓库 `src/app/icons/ios/` 中已有的 QuickLang 图标同步到 Xcode asset catalog；18 个尺寸均与源文件逐字节核对一致，使用与 Mac 相同的绿色 Q 图案。没有重新设计图标。

## 重建与证据

从仓库根目录执行：

```sh
make ios-init
make ios-simulator
APPLE_DEVELOPMENT_TEAM=YOUR_TEAM_ID make ios-device
```

详细操作见 `scripts/ios-README.md`。生成的 Xcode 工程位于 `src/app/gen/apple/quicklang-app.xcodeproj`，不提交个人签名状态。

- 模拟器包：`src/app/gen/apple/build/arm64-sim/QuickLang.app`
- 真机包：`src/app/gen/apple/build/arm64/QuickLang.ipa`
- 构建日志：`build/ios-simulator-build.log`、`build/ios-device-build.log`
- 模拟器截图与数据库计数：`build/ios-simulator-running.png`、`build/ios-simulator-database.json`
- 真机安装、启动、截图与数据库计数：`build/ios-device-install.json`、`build/ios-device-launch.json`、`build/ios-device-running.png`、`build/ios-device-database.json`
- 前端与原生测试日志：`build/ios-ui-tests.log`、`build/ios-host-regression.log`

这些是本次本机生成的证据，不随 Git 保存；重建时可以重新生成。

## iOS 27 启动兼容

`Info.ios.plist` 显式声明 TaoSceneDelegate。Tao 0.35.3 的场景配置返回值需要回移上游所有权修复，补丁固定在 `deps/patches/tao/`，没有修改 Cargo registry 缓存。来源及移除条件见 `deps/patches/README.md`。

原生 Objective-C 桥使用 AVFoundation 模块导入，保留框架自动链接信息，确保 Rust 静态归档交给 Xcode 后仍可链接语音符号。

## iOS 27 同声翻译移植

使用 ScreenCaptureKit 的系统共享选择器采集屏幕音频，麦克风使用 AVAudioEngine；混合输入遵循选择器麦克风授权。标准化后的 16 kHz 单声道 PCM 同时供本地识别和现有 AAC 录音管线使用，云端模式沿用独立 5 秒 WAV 分块。iOS SDK 的模拟器没有该采集 API，模拟器会明确提示需要真机。最低应用版本已同步为 iOS 27。

设备端英文识别使用 SFSpeechRecognizer，强制 `requiresOnDeviceRecognition`，提供部分结果、完成结果、停止和取消；音频不回退到云端识别。iOS 页面上下分区：上区仅显示本地英文 ASR（含部分结果），下区显示独立音频批次的中文译文。两区在底部时自动跟随，上翻查看历史时保留位置。录音与现有 `.m4a`、sidecar、分批历史任务兼容。

iOS 批次在 30 秒后寻找至少 600 毫秒的停顿，最迟 60 秒强制切段；停止时提交短尾段。停顿不等于语义完整，连续讲话超过上限仍可能截断句子。闭合 AAC 转为有大小和时长限制的 PCM WAV，直接以 `input_audio` 发给所选远程模型，要求输出中文；不会使用上区 ASR 文本，也不会先调用远程转写。模型必须支持 Chat Completions 音频输入。默认 Mac 历史转写流程保留。音频批次保留至删除会话，以便失败或更换模型后重试。

系统音频需用户在系统选择器中授权整个屏幕；受保护内容或其他 App 限制仍可能阻止采集。背景模式按 [Apple iOS 27 ScreenCaptureKit 示例](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-on-ios) 声明 `screen-capture` 与 `audio`，不存储屏幕视频帧。

验证：原生回归覆盖 30–60 秒切段、停止短尾、真实 AAC 编解码、取消竞争与录音落盘；设备和模拟器 Swift 6 严格编译通过。13 项历史字幕 Rust 测试通过，其中模拟 HTTP 服务验证直接音频请求和时间范围。前端最终全量 449 项测试通过，iOS 构建脚本 7 项测试通过。最终设备构建和签名校验通过，安装包位于 `src/app/gen/apple/build/arm64/QuickLang.ipa`；日志为 `build/ios-dual-caption-final-build.log`。13 项 Rust 测试的首次启动被宿主 SIGKILL，同一二进制重试全部通过，见 `build/ios-audio-history-tests-retry.log`。真机授权、跨应用采集、后台连续识别和实际提供商音频输入仍待验收；设备当前不可用。

Allison 增强音色新增逐字母恒定增益补偿：只放大偏轻片段，不裁剪采样、不改变时长，受峰值和最大 4 倍增益限制。相同 Allison Enhanced 标识的 Mac 原生合成对照中，S 的有效 RMS 从约 -19.7 dBFS 提升至 -16.1 dBFS，26 个字母采样数均未改变。模拟器原生测试验证静音间隔、重复字母及无削波。此为合成数据验证，不能代替 iPhone 扬声器或蓝牙输出的实际试听。证据为 `build/ios-letter-host/metrics-after.json` 与 `build/ios-letter-level-smoke.log`。

### 最新真机安装验证

新版已覆盖安装到 iPhone 17 Pro，成功启动并通过屏幕截图确认应用页面正常渲染、现有词书仍可显示。安装和启动记录为 `build/ios-dual-caption-install.json`、`build/ios-dual-caption-launch.json`，截图为 `build/ios-dual-caption-device.png`。当前尚未产生本次同传录音，等待设备上开始采集和完成系统授权；这不是音频识别或远程翻译端到端通过的证据。

### 系统音频启动时的授权回调崩溃

真机 `QuickLang-2026-09-21-151923.ips` 显示 `EXC_BREAKPOINT/SIGTRAP`，触发线程为 `com.apple.root.default-qos`；栈为 `_dispatch_assert_queue_fail → _swift_task_checkIsolatedSwift → closure in IOSSpeechSession.begin → SFSpeechRecognizer` 授权返回。回调原先在 `DispatchQueue.main.async` 中构造，继承主 actor 隔离，但系统实际在后台线程调用。

修复将授权回调提取为显式 `@Sendable` 工厂，在进入主队列前创建；回调只向会话串行队列转交授权结果。回归测试从主队列获取同一工厂回调，再从全局后台队列返回拒绝结果，验证错误事件而非崩溃。设备/模拟器 Swift 6 严格编译及生命周期回归通过，日志为 `build/ios-authorization-regression.log`。闪退证据保存在 `build/ios-system-audio-crash.ips`。

修复包已完成签名构建并覆盖安装到 iPhone 17 Pro；安装记录为 `build/ios-authorization-fix-install.json`，构建日志为 `build/ios-authorization-fix-build.log`。授权/共享选择器的实际交互需再次在真机验证。

### 系统音频无字幕诊断

用户使用照片 App 内保存的视频，打开声音后仍无英文/中文字幕。真机读取的三个已完成系统录音解码后均为数字静音（ffmpeg volumedetect 均 -91 dB）；录音文件存在不代表已采集到声音。随后麦克风授权完成后的截图出现英文 partial，麦克风录音也有非零音频，说明本地识别与页面渲染至少能处理麦克风来源。

采集代码存在确定的时序缺陷：定时 flush 按主机时钟写入静音并推进 cursor，晚到超过 200 ms 的音频会被当作过期数据丢弃。改为以首个真实输入的 PTS 定义起点，只提交实际转换后的音频边界；增加无内容的回调数、非零采样数及过期帧计数用于真机核验。该缺陷是否是此次全零录音的唯一原因，仍需修复版设备日志确认。

后台对严格数字静音直接完成空字幕，不再请求远程模型；非静音输入若模型未返回文本，明确提示核查 input_audio 支持。14 项 Rust 历史字幕测试通过，见 `build/ios-silent-audio-tests.log`。真实提供商的音频支持仍未确认。

实际麦克风非静音录音也收到“模型未返回有效文本”（`build/ios-mic-translation-result.json`），所以远程译文失败不能仅归因于系统录音静音。所选 longda-my 自定义模型的 input_audio 协议支持仍需核查。

采集时序修复版已完成设备构建、覆盖安装和带 console 启动。证据为 `build/ios-capture-frontier-build.log`、`build/ios-capture-frontier-install.json` 和 `build/ios-capture-frontier-console.log`。原生测试为 `build/ios-capture-frontier-test.log`。尚待用户用照片中同一视频触发修复后的真实输入；不能以构建/安装通过代替采集成功。

用户复测时序修复后依旧无字幕，截图显示录音 0 B，新会话没有 AAC，说明前述时序缺陷不是全部原因。随后按 Apple iOS 示例挂接 screen output（只计数丢弃，不保留屏幕内容），全屏入口使用 present，并将限量数值诊断写到临时目录，便于确认 SCK 屏幕/音频回调是否到达。这一步尚待新包真机复测。

屏幕输出补全版应用 archive 构建成功、codesign 校验通过，但 IPA exportArchive Zip failed（exit70），没有宣称最终 IPA 成功。直接将最新 archive 内签名 .app 覆盖安装并启动成功：`build/ios-sck-screen-output-install.json`、`build/ios-sck-screen-output-launch.json`。待本版复测读取 `tmp/quicklang-capture-diagnostics.json`。

### 字幕展示、页面恢复与本地视频

iOS 现按用户持久化最后页面（无记录时保留原初始页），同传长说明折叠，采集中保留停止按钮并优先展示字幕。新增字幕画中画：用户显式开启 AVKit sample-buffer PiP，原生 ASR 和后台音频翻译工作线程直接更新两路字幕；只有系统 delegate 确認启动后 UI 才显示开启，失败明确显示。恢复按钮回到原同传页。不使用视频通话 API，不存储画中画视频帧。PiP 的后台展示、与照片 App 同时播放的兼容性仍需真机验证。

新增 application 来源，可选本地视频在 QuickLang 内联播放；对象 URL 在替换/离开时释放，不上传整个视频。使用系统应用内共享 picker，包含 QuickLang 自身音频，不请求麦克风；云端旧模式不接受该来源并回退系统声音。音频仍按 30–60 秒闭合批次直传模型翻译。视频的实际 WKWebView 音频是否进入 SCK 尚需真机验收。

验证：全量 UI 459 项通过，随后 PiP 会话异步拒绝回归和双字幕面板共 9 项通过，TypeScript 通过。存储层新增 application 会话校验测试通过（首次宿主 SIGKILL，同二进制重试通过）。PiP Objective-C 在真机和模拟器 SDK -Wall/-Wextra/-Werror 编译通过；应用音频来源和转换原生回归通过。完整设备构建首次因磁盘不足失败，清理本项目可再生缓存/旧包后重建。

最终设备构建与 IPA 导出已成功，签名校验通过，见 `build/ios-pip-video-device-build-final.log`。这是新画中画/本地视频功能的构建证据，尚不代表 PiP 实际悬浮或 WKWebView 声音采集通过。

新版已覆盖安装成功（`build/ios-pip-video-install.json`）。启动请求被手机锁屏拒绝（`build/ios-pip-video-launch.json`），本轮不能声称启动或真机画中画/视频端到端验收通过；需解锁测试。
