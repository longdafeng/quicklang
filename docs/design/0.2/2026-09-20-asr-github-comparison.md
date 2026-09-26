# QuickLang 的 GitHub 语音方案比较

核查日期：2026-09-20。依据项目第一方 README 与硬件文档；没有在本机运行模型或测量准确率、延迟。建议是工程适配判断，不是性能排名。音频实现基线与 Apple 实时字幕的新需求设计详见 [Apple 本地实时字幕设计](apple-live-captions.md)；本对照中的落地顺序针对早期文件转写场景，Apple 实时字幕以合并设计的决策为准。

## 先区分处理目标

- **语音识别（ASR）**：音频变成文字，Whisper 及其不同推理实现属于此类。
- **文本翻译**：文字变成另一种语言，LibreTranslate 属于此类，不能代替 ASR。
- **流式识别/翻译**：持续接收音频，决定何时提交稳定文字；SimulStreaming 在基础模型上加入此类策略。
- **强制对齐**：把文字与声音的时间位置对应起来；WhisperX 用额外对齐模型改进词级时间戳。
- **发音评测**：判断音素、重音、节奏等学习表现。识别正确率和时间戳都不能直接等同于发音质量分数；本次候选没有提供足以直接替换专业发音评测的证据。

## 候选比较

| 项目 | 已核实能力和边界 | 对 QuickLang 的适用判断 |
| --- | --- | --- |
| [OpenAI Whisper](https://github.com/openai/whisper) | 多语言 ASR、语言识别、语音译成英语；Python/PyTorch，文件转录按 30 秒窗口处理；代码及模型 MIT。`turbo` 未针对翻译任务训练。 | 适合基准与原型；不是直接提供中文译文的通用翻译器，也不是拿来即可使用的实时输入服务。桌面分发还要处理 Python、模型与音频解码依赖。 |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | C/C++ Whisper 实现，C API，Apple Silicon 的 Metal、Accelerate、Core ML 路径，量化与 VAD；MIT。 | 对 Rust/Tauri 原生集成及后续跨平台很有吸引力；推荐作为长期嵌入候选。其 [server](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server) 默认 `/inference`，不能假设与当前 OpenAI 路径直接兼容。 |
| [WhisperKit / Argmax OSS Swift](https://github.com/argmaxinc/argmax-oss-swift) | 原 `argmaxinc/WhisperKit` 已重定向到此仓库；WhisperKit 是其中 ASR 产品。Apple Silicon 本地推理；MIT，并有第三方 NOTICES。README 的开发前提是 macOS 14+、Xcode 16+。 | 对当前 Mac 应用，优先验证开源 Local Server，避免一开始就实现 Swift/Rust 桥接。原生嵌入则需处理 Swift 构建、模型管理和签名。 |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | 使用 CTranslate2 的 Whisper 实现。CTranslate2 官方列出 ARM64 CPU 支持，GPU 支持重点是 NVIDIA CUDA。 | 可作为服务器或 CPU 候选；不能把 CUDA 基准直接套到 Mac，更不能把支持 ARM64 等同于支持 Apple Metal/ANE 加速。见 [CTranslate2 硬件支持](https://opennmt.net/CTranslate2/hardware_support.html)。 |
| [SimulStreaming](https://github.com/ufal/SimulStreaming) | Whisper ASR 与 LLM 翻译可组成级联；AlignAtt 根据注意力接近当前音频末端的情况暂停/继续解码，LocalAgreement 则提交相邻结果的共同前缀。仓库标注 MIT。官方典型配置围绕 Whisper large-v3 与 EuroLLM、1–2 张 GPU。 | 适合未来直播字幕/同传原型；当前录完再上传的调用链必须先改成持续音频输入和增量结果协议。对当前 Mac 单句练习不是优先替换方案，也不能将仓库标注的相对速度视为本机测量。 |
| [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) | 自托管机器翻译 API，底层 Argos Translate；AGPL-3.0。 | 可用来翻译已识别的文字，不能读声音。若已有 LLM 翻译链路，是否增加此服务取决于离线和成本需求，而非 ASR 准确率。 |
| [WhisperX](https://github.com/m-bain/whisperX) | faster-whisper、wav2vec2 对齐与可选 pyannote 说话人分离组合；仓库当前标注 BSD-2-Clause。 | 更适合离线制作逐词字幕、课文音频时间轴；多模型依赖增加桌面打包成本，且对齐不等于发音评分。 |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | 本地流式及非流式 ASR、VAD 等；明确支持 macOS/ARM64 与 Rust API。 | 若重点转为边说边显示，可以选具体流式模型与 Whisper 路线对测。框架支持范围不等于每个模型都有相同语言、精度、硬件加速或许可证。 |

## 推荐的落地顺序

**第一阶段：先验证 WhisperKit Local Server。** 当前开源 README 明确列出 `/v1/audio/transcriptions`、`verbose_json` 和 `timestamp_granularities[]` 的 segment/word 输出，与 QuickLang 的文件转录和听力分段需求接近。这里指开源 HTTP 接口；不能把 Pro SDK 的能力全部算入开源版。必须先拆开 ASR 与聊天服务的 base URL，再验证模型名、认证、超时、错误返回和时间戳结构。[接口与限制来源](https://github.com/argmaxinc/argmax-oss-swift#local-server)

文档列出的输入格式包含 WAV、MP3、M4A、FLAC；对应用录音生成的 WebM/OGG，应实际测试或增加解码转换，不能仅凭接口名称宣布兼容。HTTP/SSE 输出进度也不自动意味着可以持续上传麦克风音频。

**第二阶段：比较 whisper.cpp 原生集成。** 如需免运维本地服务、控制分发体积并兼顾跨平台，可用 C API 接 Rust，或先通过独立进程验证。它仍需音频解码、重采样、模型下载、取消任务与资源回收。CLI 文档示例要求 16-bit WAV；库 API 与应用容器解码是两个不同层次。[输入与构建说明](https://github.com/ggml-org/whisper.cpp#quick-start)

**第三阶段：按需求增加专项能力。** 实时字幕对测 sherpa-onnx 与 SimulStreaming；逐词跟读定位评估 WhisperX；离线中英文翻译评估 LibreTranslate。不要为了单句 ASR 把整套同传系统引入桌面端。

## 验收与许可边界

用同一组真实学习录音对测，包括中国口音、短词、长句、噪声、静音和错误发音。固定模型与解码配置，记录 WER、首字/完成延迟、峰值内存、冷启动、时间戳偏差及静音幻觉；分别测录音容器与课件格式。所谓“更好”应由这些结果与分发成本共同决定。

上述许可标签来自仓库，不代表所有下载模型和可选组件拥有同一许可。WhisperX 的对齐/分离模型、sherpa-onnx 的具体模型及 SimulStreaming 的翻译模型需逐项检查。LibreTranslate 的 AGPL 与 MIT/BSD 不同，集成和分发前应按实际使用方式核查其 LICENSE；本报告不作法律适用结论。
