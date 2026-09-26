# QuickLang Apple 本地实时字幕设计

> 日期：2026-09-20  
> 状态：macOS 27 英文字幕实施方案已批准；各模块并行实现中，尚未完成目标设备上的采集、离线识别与持续运行验收。第 11 节为本轮实施范围及可执行验收清单，优先于前文的候选方案。  
> 范围：合并音频链路分析、Apple 实时字幕架构建议、WhisperKit / SimulStreaming 引擎分析及本次需求澄清。本文件作为上述主题的统一设计入口。

## 1. 需求与设计结论

用户希望在 Mac 和 iPhone 上，实时显示其他 App 正在播放的英文原文。主要音源为会议、视频及通话；用户接受新版系统。第一阶段语音识别尽量完全在本地完成，未来通过外部大模型将识别文字实时翻译成目标语言。

推荐采用 **Apple 原生采集 + 本地 ASR + 字幕事件 + 独立翻译模块**：

1. 先验证目标 App 的声音能否被采集，以及 iPhone 切换到来源 App 后字幕能否持续显示。
2. 以 **SpeechAnalyzer / SpeechTranscriber** 为第一轮验证对象，以 **WhisperKit** 为开源、可选模型的对照。
3. 新语音模块优先用 Swift 实现，保留现有 Rust 学习业务与 React/Tauri 界面；已存在的 Objective-C 采集代码按接口复用，不因语言选择而直接重写。
4. 第一版不融合 SimulStreaming 与 WhisperKit，不运行两套 ASR，也不引入本地 EuroLLM。
5. 将稳定原文作为未来外部翻译的输入；翻译失败或断网不影响英文字幕。

本地识别与首次模型准备是不同阶段：语言资源可能需要提前联网下载，资源就绪后应通过断网验收。系统引擎不可用时明确提示，不自动改成云端 ASR。

第一阶段不包含发音评分、自动说话人分离、实时语音合成，也不承诺所有第三方 App、电话通话和受保护内容均可捕获。完整学习数据库的 iPhone 离线支持是另一项要求，不作为字幕会话启动的前提。

## 2. 实现基线与证据边界

### 2.1 早期听说、听力训练链路

原音频分析基于本地 HEAD `3b573a9` 的工作区。以下描述用于解释已有训练功能，不能代表后来新增的同传功能全部仍处于相同状态。

```text
麦克风 → getUserMedia / MediaRecorder → 完整 Blob → 用户点击发送
  → Tauri IPC → Rust reqwest multipart → 配置的 /audio/transcriptions
  → text → 文字对齐或 /chat/completions 教练反馈

导入学习音频 → 整文件上传 → verbose_json + segment 时间戳
  → segments[{start,end,text}] → validateCues → 逐片段循环播放
导入 SRT/VTT → parseSubtitles → validateCues → 同一播放器
```

| 环节 | 早期实现及定位 | 边界 |
| --- | --- | --- |
| 麦克风录音 | `src/ui/src/features/conversation/Recorder.tsx`、`listening/Recorder.tsx`，使用 MediaRecorder，按环境选择 WebM/MP4/OGG | 听说练习最多 60 秒，听力跟读最多 120 秒；分块仅用于内存累计，不是持续送入模型 |
| 文字转写 | `conversation/ai.ts` → `src/app/src/coach.rs` 的 `coach_transcribe` | 上传 model、language=en、file；读取 text，最多 4000 字符。模型由用户配置，不能断言服务实际使用 Whisper |
| 时间轴字幕 | `listening/ai.ts` → `listening_transcribe` | 请求 verbose_json 和 segment 时间戳；缺少 segments 就报错，不由语言模型猜测时间轴 |
| 字幕校验 | `listening/model.ts` 的 `validateCues`、`parseSubtitles` | 1–3000 段，时间单调且不重叠、内容非空；ASR 片段不一定是语法上的完整句子 |
| 跟读匹配 | `listening/model.ts` 的 `alignment` | 对英文词序列做最长公共子序列匹配，不评价声音 |
| AI 讲解 | `listening/Listening.tsx`、`conversation/ai.ts` | 发送文字获取翻译、意群、词汇与表达反馈；提示词明确禁止推断发音表现 |
| 朗读 | `src/app/src/speech.rs`、`features/speech/` | macOS 使用 `/usr/bin/say` 生成 WAV；浏览器使用 speechSynthesis。这是独立 TTS 链路 |

早期跟读匹配度为“匹配到的原文词数 / 原文词数”，不直接惩罚额外插入的词。例如原文 `I like apples` 与转写 `I really like green apples` 可以得到 100% 覆盖。它不是 WER，更不是音素、重音或语调评分。新增实时字幕也不能改变这一教学边界。

早期接口存在 8 MB 音频上限、60 秒 Rust 请求超时、256 KB 响应上限。ASR 与聊天共享 baseUrl；桌面 AbortSignal 只在 invoke 前后检查，未传递到底层 Rust 请求。音频经 JS 数字数组进入转写 IPC，材料存取还经过 hex 编解码。这些限制属于文件训练接口，不应直接成为新原生流式通道的接口设计。

### 2.2 合并文档时已存在的新增同传代码

本次合并时，工作区已经出现以下实现，故不再用“项目完全没有系统音频采集”描述当前状态：

- `src/app/native/interpretation_capture.m`：使用 ScreenCaptureKit 等原生接口，处理系统、麦克风或混合音频，转换并输出可独立解码的 WAV 数据。
- `src/app/src/interpretation_capture.rs`：通过原生桥管理采集会话，将音频和错误事件发送到主 WebView；当前非 macOS 分支明确不支持原生采集。
- `src/ui/src/features/interpretation/ai.ts` 与 `src/app/src/interpretation_ai.rs`：通过所选 AI 配置调用 `audio/transcriptions`，并调用 `chat/completions` 翻译或总结；已查看的变换请求使用 `stream: false`。

这证明系统采集与服务转写路径已有代码，**不证明已接入 SpeechTranscriber/WhisperKit 本地引擎，也不证明 iPhone 可用或已经满足实时字幕验收**。本次只做有界源码核对，没有执行该新增功能的测试。其配置、超时和数据路径须按新增模块核查，不套用上一节的旧接口限制。

目标设计应复用可用的采集、权限和会话逻辑，逐步将本地 ASR 放入原生处理路径，避免音频为识别目的在原生层、WebView 和 Rust 请求之间反复搬运。

## 3. 平台音频采集

### 3.1 Mac

候选接口为 **ScreenCaptureKit** 与 **Core Audio process taps**。后者可以捕获指定进程或进程组的输出。优先让用户选择目标应用，排除 QuickLang 自身的播放声音；根据需要将系统声音与麦克风分开处理，不默认混合。

采集需要系统权限，并须处理应用退出、音源变化、耳机切换和中断恢复。目标会议 App 输出中的多个远端说话人可能已经混合，不能把进程级捕获等同于说话人分离。

依据：[Core Audio tap 示例](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps)、[macOS ScreenCaptureKit 示例](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos)。

### 3.2 iPhone

本次资料核查中，Apple 的 ScreenCaptureKit iOS 示例及 audio API 标注 **iOS 27+**，提供系统内容选择器和全屏捕获路径；示例还包含后台 screen-capture 模式。这是 API 可用性证据，不是目标设备和第三方 App 的兼容性验证。

如果需要支持 iOS 26，应单独验证 ReplayKit / broadcast extension；不能把 iOS 27 的接口能力倒推给 iOS 26。ReplayKit 明确提供 `activePhoneCall` 错误，表示因正在进行电话通话而无法录制。因此视频、会议 App 和电话通话必须分项验收，不能用“视频采集成功”推导“所有通话可用”。

依据：[iOS ScreenCaptureKit 示例](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-on-ios)、[audio 输出](https://developer.apple.com/documentation/screencapturekit/scstreamoutputtype/audio)、[ReplayKit](https://developer.apple.com/documentation/replaykit)、[activePhoneCall](https://developer.apple.com/documentation/replaykit/rprecordingerrorcode/activephonecall)。

必须同时验证字幕交互：切换到来源 App 后字幕在哪里显示、应用进入后台是否持续处理、锁屏与来电如何结束或恢复。不能假设 Mac 的悬浮字幕窗可以原样移植到 iPhone。若目标系统、音源或交互不成立，应明确列为不支持，不能用麦克风收扬声器声音冒充已完成系统音频捕获。

## 4. ASR 选型与组合边界

| 方案 | 在本设计中的定位 | 优势 | 成本与边界 |
| --- | --- | --- | --- |
| Apple SpeechAnalyzer / SpeechTranscriber | 第一轮主选 | Swift 系统 API，本地长时间转写，临时/最终结果与时间范围 | 系统框架非开源；模型由系统管理，需检查设备、语言和资源可用性 |
| WhisperKit / Argmax OSS Swift | 第一轮开源对照；按结果决定是否作为可选引擎 | Whisper 模型经 Core ML 执行，可选择模型，有开源流式应用代码 | 系统音频输入适配、模型体积、尾部提交、持续运行与温控仍需工程验证 |
| SimulStreaming | 后续算法研究参考 | AlignAtt 与增量翻译策略可检查、可研究 | Python/PyTorch 路径，迁移到 Core ML 不是接口拼接；不作为第一版依赖 |
| whisper.cpp | 原生嵌入备选 | C API、量化和多平台原生执行 | 当前范围已收敛到 Apple，不再仅凭跨平台优势列为首选；性能仍需对测 |

早期文件转写方案曾建议先接 WhisperKit 本地 HTTP、再比较 whisper.cpp。**针对当前 Mac+iPhone、持续音频输入的要求，决策更新为优先评估进程内原生语音模块**。本地 HTTP 可用于 Mac 原型对照，不作为两平台统一的产品部署架构。更广泛的项目比较见 [GitHub 八种方案对照](2026-09-20-asr-github-comparison.md)。

### 4.1 Apple SpeechTranscriber

SpeechAnalyzer / SpeechTranscriber 属于 macOS 26 / iOS 26 系列 API，提供本地语音转写。可选择临时结果以尽早显示文字，随后用最终结果替换相同音频范围。使用 `AssetInventory` 准备模型，启动前检查 `isAvailable`、支持的语言与已安装资源；按引擎要求选择音频格式。

“26 系列支持语音识别”不等于“iOS 26 支持新版系统音频捕获”。识别与采集是两个独立平台能力。

依据：[SpeechAnalyzer 官方介绍](https://developer.apple.com/videos/play/wwdc2025/277/)、[硬件可用性](https://developer.apple.com/documentation/speech/speechtranscriber/isavailable)。

### 4.2 WhisperKit 的实际能力

WhisperKit 基于 Whisper 模型，但不是简单调用原版 Python 程序，也不是 whisper.cpp 的 Swift 外壳。它以 Swift/Core ML 组织本地推理，配套工具负责模型转换、优化和评估。只引入所需的 WhisperKit 产品，不必同时引入 Argmax OSS 中的 SpeakerKit 或 TTSKit。

已核查的 `AudioStreamTranscriber` 行为如下：

1. 维护 `currentText`、`confirmedSegments`、`unconfirmedSegments` 等状态，默认从麦克风音频处理器读取缓冲。
2. 新增音频超过一秒时尝试转写；这只是触发条件，不是“一秒内稳定出字”的性能承诺。
3. 使用 `clipTimestamps` 从上次已确认片段末尾继续处理。
4. 按片段数量保留若干尾部段不确认，将前面的段移入已确认结果；这不是 LocalAgreement，也不是 AlignAtt。
5. 停止方法主要停止采集并修改状态，不能未经验证就认为所有尾部文字已最终化。

调用方仍需验证系统音频输入、字幕去重和替换、停止后的尾部提交、长时间缓冲回收及过载处理。Whisper 本身的窗口式推理与应用层流式体验必须区分。

开源 HTTP/SSE 返回进度不等于持续上传麦克风的协议，也不能将 Argmax Pro 的实时 WebSocket 能力计入开源版本。

依据：[Argmax OSS](https://github.com/argmaxinc/argmax-oss-swift)、[AudioStreamTranscriber 源码](https://github.com/argmaxinc/argmax-oss-swift/blob/main/Sources/WhisperKit/Core/Audio/AudioStreamTranscriber.swift)、[转换工具](https://github.com/argmaxinc/whisperkittools)、[本地服务边界](https://github.com/argmaxinc/argmax-oss-swift#local-server)。

### 4.3 为什么不直接融合 SimulStreaming

SimulStreaming 的语音路径使用修改后的 PyTorch Whisper 与 AlignAtt，通过解码器注意力信息决定何时暂停输出并等待更多音频。文本翻译路径另使用 LLM 与 LocalAgreement，比较连续候选结果的共同前缀以确认文字。

AlignAtt 不能只靠 WhisperKit 已输出的文字实现。迁移到 Core ML 需要研究模型导出信息、注意力输出和 Swift 解码过程，并做质量与延迟的等价性验证，属于算法移植。将 SimulStreaming 放到 WhisperKit 后面不会自动获得同等能力。

第一版只借鉴候选/稳定文本、上下文和提交边界等思想。使用苹果引擎时先尊重其临时/最终结果语义；使用 WhisperKit 时完善其应用层确认策略。仅在基础方案实测达不到要求、且团队愿意维护解码器改造时，再研究 AlignAtt。未来外部 LLM 翻译不需要本地 EuroLLM。

依据：[SimulStreaming 官方项目](https://github.com/ufal/SimulStreaming)。

## 5. Rust、Swift 与界面职责

Rust 能编译为 Apple 平台机器码，并没有天然的 ASR 性能劣势。Swift 的优势在于直接使用苹果音频、Core ML、权限和生命周期 API。计算语言与平台集成成本是两个问题。

QuickLang 的原始设计选择 Tauri 2 + React + Rust，是为了复用界面、共享学习领域逻辑、隔离存储，并兼顾当时的 Windows 目标。原始 ADR 位于 `docs/quicklang-product-technical-design-v1.md`。平台范围收敛后，不应继续为未来 Windows 牺牲当前语音体验，但也不必重写已稳定的学习业务。

| 层 | 职责 |
| --- | --- |
| Apple 原生语音模块 | 音源、权限、格式转换、缓冲、ASR、字幕事件与资源回收；新增逻辑优先 Swift，适配现有 Objective-C 采集 |
| Rust 业务层 | 学习记录、收藏、导出、既有词库和复习业务；通过窄接口接收字幕与状态 |
| React/Tauri | 当前应用界面、会话控制、字幕展示与学习交互 |
| 可选 SwiftUI 验证界面 | 在接回完整应用前独立验证平台能力，不默认演变为整应用重写 |

高频 PCM 留在原生层；跨层传递控制命令、状态和字幕。macOS 可采用窄 C ABI/Objective-C 桥，iOS 可使用 Tauri 的 Swift 插件。共享 Swift 语音模块不代表两平台的采集和后台代码完全相同。[Tauri 移动插件](https://v2.tauri.app/develop/plugins/develop-mobile/)

现有 iOS 配置和 mobile entry point 不能作为 iPhone 已验收的证据。字幕会话应能独立于完整学习数据库启动；存储接入另行验证，本设计不依据旧笔记断言 seekdb 最新 iOS 支持状态。

## 6. 目标处理链路

```text
其他 App 音频
  → 平台采集与权限
  → 原生音频格式转换、单调时间轴、有界缓冲
  → 本地 ASR 适配器：SpeechTranscriber / WhisperKit
  → 字幕事件与会话状态
      ├─ 即时英文原文：候选替换、最终提交
      ├─ QuickLang 学习记录、收藏与导出
      └─ 稳定文本分句 → 外部 LLM → 按片段更新译文
```

第一版建议统一事件字段：`sessionId`、`segmentId`、`revision`、`start`、`end`、`text`、`isFinal`、`language`。这是目标契约，不表示当前模块已经实现。音频时间由采集时间轴或引擎结果产生，不由 LLM 推算。

同一片段候选更新使用相同 segmentId 和递增 revision；新会话使用新的 sessionId。UI 替换相同片段，不简单拼接所有候选。引擎未提供词级时间戳时，不生成伪逐词定位。

建议会话状态为 `idle → preparing → capturing → draining → stopped`，失败进入 `error`。正常停止先停止输入，再排空已接收音频、提交尾部结果并释放资源；强制取消立即停止并标明未完成片段。退出或开始新会话后，不接纳旧会话迟到事件。

## 7. 实时字幕策略

- 持续输入音频并保留必要上下文，不把每 500 ms 音频独立识别，也不等整句话结束才首次显示。
- 临时文字允许覆盖；最终文字保持稳定。语音端点、字幕断句和翻译提交可以采用不同条件。
- VAD 用于静音控制与端点判断，不把“必须出现静音”作为所有字幕输出的前置条件；连续长句也应有反馈。
- Whisper 窗口之间处理时间偏移、重叠和重复，保留尾部未完成词；引擎升级后重新验证确认策略。
- 采集回调只完成必要的缓冲工作，推理异步执行。有界队列与缓冲必须监控积压；无法跟上时提示或停止，不能无限积累延迟或静默漏掉音频。
- 英文为初始固定识别语言。不要为了识别英文中的少量专有名词而强制每个短片段重新检测语言。
- 手机模型配置由持续运行结果决定，不直接把 Mac 上可用的大模型设为 iPhone 默认值。

## 8. 外部实时翻译扩展

ASR 与翻译使用独立配置：本地引擎与模型设置不依赖聊天服务 baseUrl；外部翻译单独配置服务、模型、凭据和目标语言。原有文件转写兼容接口如继续保留，也应与翻译解耦。

翻译默认消费稳定原文，按语义片段或有界等待时间触发，附带有限前文和术语表。请求及结果携带 sessionId、segmentId、revision；候选更新、会话停止或模型切换后，过期响应不能覆盖当前译文。重试和缓存按版本去重，避免重复提交整场转写。

翻译开启后发送文字，不默认发送原始音频。翻译关闭或网络不可用时，本地原文字幕仍然可用。SSE 可以改善译文逐步展示，但流式 token 输出并不保证源句和译句已稳定；不要将所有不稳定 ASR 候选都立即请求翻译。

## 9. 实施阶段与验收

| 阶段 | 交付内容 | 通过条件 |
| --- | --- | --- |
| A：平台采集 | Mac 与 iPhone 指定系统版本的采集、字幕显示原型 | 视频 App、会议 App 分别获得有效音频；字幕可见、前后台行为清晰；通话单独列出支持或不支持 |
| B：本地识别 | SpeechTranscriber 路径及 WhisperKit 对照 | 模型准备好后断网可识别；候选更新、最终提交、静音和停止尾部处理正确 |
| C：持续运行 | 资源、字幕质量和生命周期验证 | 至少 30 分钟运行，检查积压、内存、发热、耗电、路由切换与中断恢复 |
| D：QuickLang 集成 | 复用现有采集接口，接入原生字幕事件与学习业务 | 会话隔离和取消正确，保留已确认结果；不因学习库未就绪阻塞字幕 |
| E：外部翻译 | 独立翻译配置、上下文与版本化结果 | 翻译失败不阻塞 ASR，重试不重复，旧译文不覆盖新版本 |

测试集包含真实会议英语、不同口音、短词、连续长句、噪声、静音、专有名词与目标 App 的实际音频路由。使用人工参考文本和时间边界，固定模型与解码参数，记录：

- 首个可读字幕延迟与稳定提交延迟的 p50/p95，分别测量，不用推理耗时替代端到端延迟。
- WER、重复/漏词、静音误识别、字幕修订和边界误差；已有训练匹配度不能作为 WER 的替代指标。
- 冷启动、模型准备时间、峰值内存、持续资源占用、温控与耗电。
- 权限拒绝、模型缺失、音源消失、后台、耳机切换、停止/强制取消、快速重启会话和翻译断网。

具体延迟预算应由最弱目标 iPhone 和代表性音频实测决定。本设计没有新的准确率或速度排名；“官方支持接口”“源码存在实现”“真机验收通过”必须分别记录。

## 10. 资料来源与维护约定

原始分析参考了 Joplin `ai/media` 中 2026-09-06 的 whisper.cpp、LibreTranslate 和 SimulStreaming 项目笔记。这些笔记是当时的源码快照，未运行模型；当前选型以本文件引用的第一方资料和目标设备验证为准，不将旧版本号当成最新发布版本。

本文合并了先前的三份专题分析，保留其关键事实、源码定位、选型变化和未验证边界，消除重复与相互引用。GitHub 八种方案对照仍作为独立横向调研保留。后续实现和实测结果统一补充到本文件，注明设备、系统、引擎版本、输入来源和验证日期。

## 11. 已批准的 macOS 27 实施范围与验收

### 11.1 本轮固定决策

2026-09-20 已批准本轮交付 **macOS 27 本地英文字幕**，不是 iPhone、WhisperKit 对照或实时翻译交付。前文保留的跨平台及翻译内容仅为演进背景。

- 使用可供未来听说训练复用的 Swift 公共语音模块：`SpeechAnalyzer` / `SpeechTranscriber`、英文资源准备、输入适配、临时/最终结果与停止排空；模块不依赖 NSPanel、React 页面、云 AI 配置或学习数据库。
- 麦克风使用 `CaptureInputSequenceProvider`；系统音频使用 ScreenCaptureKit。两种输入分别验收，不用扬声器外放再录麦克风冒充系统采集，也不默认混合输入。
- 字幕采用原生 `NSPanel`：屏幕底部、宽度 92%、高度 84 pt、字号 26 pt、背景不透明度 76%、最多两行英文。尺寸以逻辑点为准，不能用 Retina 像素数直接判定；背景透明度不应使文字和按钮同步变淡。对不同显示器、Dock、菜单栏及全屏空间验证实际可见性。
- 只有权限、英文资源、输入与分析器启动准备成功，且字幕面板可用后，才隐藏主窗口。仅 IPC 返回“已接受启动”不能等同于准备成功。
- **返回（return）**只恢复主窗口，不结束采集或识别；必须能继续看到会话状态并执行停止，不能在 React 卸载时误停原生会话。
- **停止（stop）**先停止新增输入，再刷新转换器尾部、结束输入序列、等待分析器及结果消费排空，随后释放资源、收起字幕并恢复主窗口。不要先取消消费任务再宣称尾部已提交。失败及排空超时须记录明确原因，并保证主窗口可恢复；不把强制取消标为正常排空成功。
- 面板只显示英文原文，不叠加翻译；保留原有云转写、翻译与历史功能，本轮不迁移、删除或自动调用它们。未来听说训练通过公共模块接入，并不代表本轮已改造训练界面。

### 11.2 SDK 版本与格式契约

2026-09-20 本机 `xcrun --sdk macosx --show-sdk-version` 为 `27.0`，Swift 为 `6.4`，目标为 `arm64-apple-macosx27.0.0`。本轮直接核对该 SDK 的 `Speech.swiftinterface` 可用性声明：

- `SpeechAnalyzer` / `SpeechTranscriber` 从 26 系列可用。`SpeechTranscriber.ReportingOption.fastResults` 已属于 26 系列，**不是 27 新增，也不是名为 fastResults 的 Preset**。它不构成具体端到端延迟承诺。
- 27 新增 [CaptureInputSequenceProvider](https://developer.apple.com/documentation/speech/captureinputsequenceprovider)：从采集设备/会话生成分析器输入，供本轮麦克风路径使用。其 `captureSession` 与 `analyzerInputs` 的生命周期仍需调用方管理。
- 27 新增 [AssetInputSequenceProvider](https://developer.apple.com/documentation/speech/assetinputsequenceprovider)：从 AVAsset/track 生成输入，是未来文件听说训练的复用入口，本轮不宣称已接入文件训练。
- 27 新增 [AnalyzerInputConverter](https://developer.apple.com/documentation/speech/analyzerinputconverter)：转换音频并通过 `flush()` 输出残留输入。应优先使用 `converter(compatibleWith:)` 或分析器支持的格式，不能假定任意 AVAudioFormat 都是有效分析格式。
- 本机独立测试中，以 Float32 的 16 kHz 单声道格式作为 `analyzerFormat` 时在 Speech 框架触发进程 trap（退出 133）；改用交错 Int16 的 16 kHz 单声道后通过。此结果只描述当前系统/SDK 的观察，不推断所有版本仅支持 Int16。生产实现必须协商格式，不能照抄测试的固定 16 kHz 作为引擎要求。

以上版本结论以本机 SDK 声明核对为证据；官方文档链接用于后续追踪。API 存在、转换测试通过与整应用验收通过是三个不同结论。

### 11.3 自动检查入口与当前结果

仓库现有工具为 Vitest（`tests/unit/ui`）、Node test runner（`tests/unit/scripts`）和独立 Rust 测试 crate（`tests/rust`）。它们本身不能验证 TCC 授权、NSPanel 可见性或 Speech 真机识别。为避免源码字符串检查充数，本轮新增独立 Swift SDK 契约烟测 `tests/native/local-caption-sdk-contract.swift`，不改生产代码或构建配置、不进入 `interpretation*` 测试文件。

在仓库根目录执行：

```bash
xcrun --sdk macosx --show-sdk-version
xcrun swiftc --version
xcrun swift tests/native/local-caption-sdk-contract.swift
```

运行前提：macOS 27 与对应 SDK。脚本不请求麦克风/录屏权限、不下载模型；实际生成一秒 48 kHz Float32 正弦 PCM，经系统转换器转换为 16 kHz Int16，排空后检查输出非空、声道/采样率、有效时长及已提供的时间戳单调性，同时编译检查两个 provider 和 reporting options 的公开类型。格式转换保留 20 ms 时长容差以容纳重采样边界，不断言固定缓冲个数。

**2026-09-20 已执行并通过**：上述 Swift 烟测，退出码 0；本次观测为 14 个输出缓冲、总时长约 1 秒。它不调用 QuickLang 产品路径，不是应用行为契约或本地 ASR 成功证据。当前没有稳定、独立且无需修改生产代码的原生会话注入接口，因此本轮没有另写“mock 自己”或只查字符串的产品测试。

集成者可另执行以下现有回归入口；**本轮文档任务未执行，不能标为通过**：

```bash
npm run typecheck
npm test -- --reporter=default
npm run test:scripts
```

Swift 编译/链接、Rust/native 桥、最终应用包与签名必须由集成构建另行验证。旧 SDK 的构建应明确不支持或按约定跳过，不应偷偷回退云 ASR。产品编译目标与 macOS 27 availability 检查须一致；尤其检查 Swift runtime/rpath、跨语言符号和依赖 framework，不能用 Swift 单文件烟测替代最终包验收。

### 11.4 可逐项执行的整应用验收（全部待实测）

使用集成者构建的 `.app`，记录 commit/工作区版本、机器型号、macOS build、SDK/Swift 版本、签名/bundle ID、显示器分辨率与缩放、模型/语言、音源 App 和权限初始状态。每项附操作时间、结果、相关日志和必要截图；失败写明原因，不只勾选“源码已实现”。日志记录会话 ID、音源、状态转换、格式、错误与排空耗时，不默认记录完整识别文本或敏感音频。

- [ ] **A01 首次启动/模型准备**：以未准备英文资源的环境启动本地字幕。下载/准备过程主窗口持续可见并显示进度或状态；准备失败可重试。资源就绪并成功启动采集/面板后才隐藏主窗口。模型已安装时明确记录“模型缺失分支未覆盖”，不要为了测试自动删除系统模型。
- [ ] **A02 麦克风权限拒绝**：系统设置中拒绝本应用麦克风权限，选择麦克风启动；应有明确错误、无悬挂会话、主窗可见。重新授权并按系统提示重启后可重试。对产品实际请求的语音权限分支同样验证，不预设它与麦克风权限等价。
- [ ] **A03 系统音频权限拒绝**：拒绝系统录屏/系统音频相关权限后启动系统音频，验证不会隐藏主窗或无声无限等待；授权并按系统提示重启后重试。TCC 以实际签名/bundle ID 验证，开发二进制授权不代表分发包已授权。不自动运行全局 `tccutil reset`。
- [ ] **A04 麦克风英文**：使用耳机避免回声，朗读固定英文参考文本，覆盖短词、连续长句与十秒静音；出现临时结果并被修订，不逐次拼接造成重复，最终结果稳定。只显示英文，不出现译文、云 AI 配置要求或网络转写请求。
- [ ] **A05 系统英文**：关闭/不选择麦克风，在目标视频或会议 App 播放固定英文材料；验证原生系统输入确实出字，并单独记录目标 App、音频路由、受保护内容失败边界。QuickLang 自身发音/提示音不得造成反馈循环。
- [ ] **A06 离线**：英文资源预先就绪后断网，分别验证 A04/A05 仍能持续识别并正常停止；首次下载失败不能被误报成本地识别不支持。另检查原有云功能仍明确依赖网络，但不会被本地字幕自动调用。
- [ ] **A07 面板视觉**：测量底部 92% 宽、84 pt 高、26 pt 字号、76% 背景不透明度、最多两行。输入超长英文、快速修订时无溢出/抖动遮挡按钮；切换应用、全屏视频、Space、外接屏与 Dock 位置后可见且控制可点击，不无故抢键盘焦点。
- [ ] **A08 返回但不停**：采集中点击返回，主窗恢复；持续输入另一句英文，确认同一会话继续出字，没有重新申请权限或重复启动。返回后再次执行停止必须有效；主窗隐藏与显示不能触发前端卸载清理而停掉会话。
- [ ] **A09 停止排空**：朗读固定句子并在最后一个词后立即停止；观察 `draining`、尾部最终结果及 `stopped` 顺序，最终结果不能因面板提前销毁而丢失。输入设备释放、面板收起、主窗恢复；连续点击停止须幂等。超时/错误可恢复主窗，但必须与正常完成区分。
- [ ] **A10 启动/停止竞态**：准备期间停止；连续双击开始；停止后立即新开会话；旧会话迟到文本/错误不能覆盖新会话。模型准备失败、输入启动失败、面板创建失败均不留下隐藏主窗或后台采集。
- [ ] **A11 路由及持续运行**：分别运行两种输入至少 30 分钟，插拔耳机、切换输出、退出音源 App、睡眠唤醒；记录恢复或明确结束行为。检查内存、队列积压、字幕延迟趋势及音频设备释放，不以短时间成功替代长期验收。
- [ ] **A12 原功能回归**：使用既有配置执行一次云转写/翻译并查看、导出或重开既有历史，确认数据与入口保留。进入听说训练验证原有录音/反馈仍正常；不将公共模块的可复用设计标成训练已迁移。

### 11.5 主窗、权限与集成风险检查

- 原生 NSPanel 与主窗 show/hide/激活操作应在 AppKit 主线程执行；不要阻塞主线程等待权限、模型下载或停止排空。Rust 回调与 Swift task 不应彼此同步等待形成死锁。
- 主窗口是 Tauri 窗口，不应仅凭 `NSApp.keyWindow` 寻找：权限弹窗或面板可能成为 key window。恢复须面向明确的主窗口标识，并处理已隐藏、最小化或失去焦点的状态。
- `return` 是导航动作、`stop` 是会话终止动作；事件监听最好由应用级所有者保持，避免页面卸载后再也收不到最终状态。错误、关闭面板、应用退出与准备中取消都应有清晰的资源所有者。
- 系统音频格式可能随音源或设备改变。转换器应使用有效格式与单调音频时间，停止时 flush 在结束 analyzer 输入之前；音频回调不能等待 ASR 推理。采集完成不等于结果流已消费完毕。
- 检查最终 `.app` 的实际隐私说明、签名和适用 entitlement；不要只验证源配置文件。分别记录麦克风和系统音频授权，权限状态不能跨开发包和分发包推断。
- 本节完成的是方案补充与 SDK 烟测。Swift/native 窗口/UI、Rust/build 在并行实现；未经集成构建和上述真机流程，不将其标注为“已实现且验收通过”。

### 本地字幕历史保存（2026-09-20，后台重转写方案）

本地实时 ASR 只用于实时展示，不再作为历史字幕来源。`LocalCaptionHistory` 只保存会话元数据和生命周期，持久化复用 `StorageService` 的独立数据库线程；历史详情不会回退使用旧的实时识别文本。

- 原生录音写盘队列按实际 PCM 帧数计时，满 5 秒后寻找连续 600 ms 的低能量停顿（20 ms 窗口，RMS 低于 -40 dBFS）并关闭 MP3；短停顿不切分，无停顿则 15 秒兜底。停顿是声学断句线索，不保证语义完整，停止时关闭短尾批。批次关闭后才原子写入带起止时间的 JSON 就绪标记。
- 独立 `history-subtitles` 后台线程扫描持久化任务，向用户选定的远程转写模型上传已关闭的音频批次。采用兼容 `/audio/transcriptions` 的接口，要求 `verbose_json` 和 segment 时间戳；缺失或无效时间戳明确失败，不伪造时间轴。
- 原文时间戳加上批次起点，成为整场录音的绝对时间。随后将带 ID 的原文发给远程翻译模型生成简体中文，严格保留相同的分段和时间轴。历史提供原文、中文两份 SRT，并支持点击字幕时间定位音频。
- 后台远程处理与采集、ASR、字幕面板隔离，限制远程并发。每批失败最多自动尝试三次，保留音频供手动重试；已成功的原文可复用，避免翻译重试时重复转写。重新启动应用可继续未完成任务。
- 配置仅保存模型配置 ID 和语言，密钥在原生层按需读取。未配置远程模型时仍允许本地识别，批次保留到配置完成后处理；启动页明确告知历史字幕会上传音频。
- 文件位于 `recordings/<session-id>.parts/`。临时 MP3 批次保留到删除会话，以支持失败重试或更换模型；同时保留整场 MP3、字幕结果及 `source.srt` / `zh.srt`。待处理批次音频占用单独显示。删除历史同时清理这些文件，数据库删除失败则恢复。
- 旧版已关闭的本地录音可在配置后台模型后重新切批处理。旧实时文本不作为新历史字幕替代。全文分析等待后台字幕完整生成。

验证覆盖短音频切批及尾批、旧录音重新切批、时间偏移与时间戳校验、双语对应关系、本地模拟 HTTP 上传及翻译、任务文件恢复、删除回滚以及前端展示。真实远程服务兼容性和真实会议持续采集仍需实际环境验证；本轮不再生成两小时测试音频。


### 本地录音文件与长会议（2026-09-20）

- 录音格式为单声道 MP3，48 kHz、目标 64 kbps。输入采样率只在独立写盘队列中转换，不改变 ASR 的输入格式和时间戳。按音频码率估算一小时约 28.8 MB，两小时约 57.6 MB，另有少量容器开销；界面显示的是文件系统实际大小。
- 文件位于应用数据目录的 `recordings/<session-id>.mp3`；设置 `QUICKLANG_DATA_DIR` 时使用该目录下的 `recordings/`。状态、时长和错误写入同名 `.mp3.json` 小文件。数据库不保存本地录音字节或 Base64，历史中的会话 ID 用于关联文件。
- `AudioFileRecorder` 的 utility 串行队列独立编码和写盘。采集侧仅复制 PCM 数据并非阻塞提交，待写 PCM 上限 8 MiB。麦克风保留 SDK 原有 delegate 的队列和识别回调；系统声音在提交 ASR 后复制同一段输入。
- 队列超限或磁盘故障会停止继续接收录音数据，并将录音标为不完整，已有部分保留；不停止字幕识别。正常停止会排空队列、编码尾段并关闭 MP3，然后发送会话停止事件。
- 启动页每三秒读取小型文件元数据，显示占用空间；历史列表和详情也显示实际大小及录音状态。回放使用仅授权给指定文件的 Tauri asset 协议，支持范围读取，不把整场音频加载进 JavaScript 或数据库。
- 删除历史会先暂存重命名音频和元数据，数据库删除失败则恢复；成功后清理文件。活动录音禁止删除。读取和删除拒绝路径穿越与符号链接文件。
- 以前的纯文字本地历史没有音频可供后台重转写；没有文件时明确显示“没有录音文件”。进程被强制结束时，未关闭的 MP3 可能无法回放；该情况不等同于正常停止或取消。

原生测试覆盖 AAC 编码与重新打开、单/双声道输入、不同输入采样率、队列积压不等待采集、磁盘故障以及取消后保留部分音频。`recording-tests --long` 加速生成两小时音频并检查实际时长与大小；它不替代两小时真实会议的采集、ASR、权限和设备切换验收。

本次加速编码验证结果：输出时长 7200.002 秒，文件大小 59,068,967 字节（约 59.1 MB / 56.3 MiB），测试临时文件已自动清理。真实两小时会议的持续采集和 ASR 尚未实测。

### 历史会议纪要（2026-09-20）

历史详情新增会议纪要入口，复用所选分析模型。生成前可选“客户拜访”或“内部项目会议”，查看模板栏目并填写最多 2000 字的关注点。模板统一定义在 `meetingTemplates.json`，前端与原生请求共同使用。

本地历史仅在远程字幕全部完成后开放生成。短会议直接生成中文 Markdown 纪要；长会议覆盖全部字幕，逐段提取证据后有界归并，最后按模板生成整场纪要，不截取开头代替全文。提示要求区分讨论建议、已确认决策和冲突信息，未出现的人员、日期、负责人、期限和承诺不得补造。关注点为空也可生成。

每次结果作为独立 run 保存，会记录模板 ID、模板名称、关注点、模型及状态。旧分析记录仍可读取；底层沿用会话 JSON payload，无需新增数据库表。取消和失败保留运行状态，重新生成不会覆盖之前的结果。生成质量需用实际会议和实际模型核对，自动测试不代表真实服务验收。
