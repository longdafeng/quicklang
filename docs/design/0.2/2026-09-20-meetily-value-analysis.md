# Meetily 对 QuickLang 的价值分析

日期：2026-09-20。分析范围：Meetily 开源 Community 代码与 QuickLang 当前工作树。本文是源码研究，不是性能测评或实现完成报告。

## 结论

Meetily 对 QuickLang 的高价值在于会议录音的持久化与恢复、会后重新转写、本地引擎与模型管理，以及把会议材料转成学习材料的产品闭环。它与 QuickLang 同属 Tauri + React + Rust 技术体系，适合作为有针对性的工程参考；不建议整项目引入或用它的实时管线替换当前 Apple 流式字幕。

QuickLang 已经有系统采集和本地 ASR，本次不能沿用此前“没有系统音频采集”的历史判断。当前仓库包含未提交开发代码，README 的系统要求和部分描述落后于工作树；以下以实际代码为准。

## 1. 基线与证据范围

- Meetily：`a2cb62e827da7ef59f65064c97233efb2313878e`，本次从官方仓库读取并检查源代码。
- QuickLang：HEAD `1e855c329d785e8f7db21eb639765d2dfd473c9d` 加当前未提交工作树；新增字幕模块尚不能当作已发布版本。
- 本次未编译运行 Meetily，未做两项目的同机同音频对测。仓库中的既有 QuickLang 测试报告不等于本次重新验证。

## 2. Meetily 是什么

Meetily 面向会议录音、转写与摘要。当前桌面主体是 Tauri、Next.js/React、Rust、SQLite，使用 Whisper / Parakeet 提供本地转写，摘要支持本地 Ollama 和外部服务。仓库留有 backend 等目录，不能仅凭目录存在就判断当前桌面使用 Python 服务。

依据：[官方项目介绍](https://github.com/Zackriya-Solutions/meetily)、[桌面依赖](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/Cargo.toml)。所谓本地处理成立于选择本地引擎/服务的配置；使用外部摘要服务仍会发送文本。

## 3. 当前 QuickLang 已有什么

| 能力 | 源码核查 | 对比较的影响 |
| --- | --- | --- |
| 系统声音输入 | `src/app/native/speech/SystemAudioInput.swift:28` 使用 ScreenCaptureKit 并排除本进程声音 | Meetily 不是补齐系统采集的唯一方案 |
| 持续本地英文 ASR | `src/app/native/speech/SpeechSession.swift:119` 检查资源，启用 volatileResults / fastResults，输出音频范围和最终状态 | 当前已有低延迟字幕主线 |
| 显示与翻译 | `src/app/src/live_captions.rs`、`src/ui/src/features/speech/captionTranslation.ts:27`、`captionStream.ts` | 已有原生字幕窗、短分句翻译、SSE 与过期结果隔离，不需重新搭建 |
| 云端同传历史 | `src/ui/src/features/interpretation/Interpretation.tsx:227`、`src/crates/storage-seekdb/src/app_storage.rs:214` | 已有会话/音频分段持久化、重试、回放与摘要，不应重复建设 |
| 本地字幕历史 | `src/ui/src/features/interpretation/Interpretation.tsx:193` 只将本地结果写入页面快照；`liveCaptions.ts`维护内存片段 | 在检查的本地链路中未看到接入上述完整录音/历史库，是更有价值的补齐点 |
| 学习业务 | 听力训练、生词、词书、复习等现有模块 | 这是 QuickLang 应继续保留的产品中心 |

当前 `src/app/tauri.conf.json:38` 的最低系统版本为 27.0。即使增加其他 ASR 引擎，也不能据此直接宣布支持较旧系统：还要处理编译目标、原生 API 可用性和打包路径。

## 4. 最值得借鉴的能力

### 4.1 录音和实时字幕分开管理：优先级最高

Meetily 的 `IncrementalAudioSaver` 每累计约 30 秒音频保存 checkpoint，结束时合并，还提供 checkpoint 检查和恢复接口。见[实现](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/incremental_saver.rs#L17)。这不是零丢失保证，未刷盘尾部仍可能损失；保存策略依赖 auto-save 配置。

对 QuickLang 的建议是给当前本地字幕增加独立持久化分支：音频及时落盘，最终文本保留时间范围和修订记录，字幕面板继续显示最新内容。显示可以为追赶而跳过旧画面，完整会议记录不能随之丢弃。复用已有 seekdb 会话/分段仓储，先评估适配字段；无需为了模仿 Meetily 再引入 SQLite。

长会议音频也可评估“文件保存大音频、数据库存索引与元数据”的方式，避免整场 PCM 一直留在内存或频繁穿越 WebView。文件提交、索引一致性、磁盘满与恢复需要单独设计，不能只复制 checkpoint 函数。

### 4.2 会后高质量重转写：高优先级

Meetily 有导入和重新转写路径，用户可在已有录音上选择其他模型/语言。见[重转写实现](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/retranscription.rs)。

对 QuickLang 最合适的组合是：会中 Apple 引擎快速显示；会后可选 Whisper/Parakeet 重转写，再生成精听材料、生词与表达练习。这允许会中追求延迟、会后追求准确率；是否确实提高准确率必须对测。

新的批处理结果不应悄悄覆盖用户修改过的字幕，应保留引擎、模型版本和结果版本。学习材料中的逐句/逐词定位要使用可靠时间戳，不能拿整段范围均分。

### 4.3 本地模型管理与引擎接口：中高优先级

Meetily 统一 `TranscriptionProvider`，封装 Whisper 和 Parakeet，同时有模型下载进度、取消和完成/失败事件。见[接口](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/transcription/provider.rs#L40)、[Parakeet 下载命令](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/parakeet_engine/commands.rs#L379)。

建议保留 QuickLang 当前 Apple 引擎主线，先把模型管理作为选配功能。只有明确需要跨平台、模型选择或替代引擎时再接入；不是现在同时加入两个推理运行时。即使暂不加新引擎，也可借鉴资源状态、首次准备进度、错误重试与磁盘占用展示。Parakeet 下载支持 Range 恢复；所检查的校验函数只核对文件字节数，不能视为 SHA-256 内容校验，正式采用时宜补充模型版本与内容校验。见[校验实现](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/parakeet_engine/parakeet_engine.rs#L413-L428)。

Meetily 的接口是输入一段 16 kHz 单声道浮点音频再返回结果，并非可直接满足当前 QuickLang 持续 partial/final 的接口。QuickLang 适配器应显式区分持续输入能力、最终结果、时间戳精度、支持语言和取消语义。

### 4.4 采集和长会话工程：作为检查表

Meetily 在 Rust 中组织设备、重采样、混音、录音与转写。macOS 当前默认走 Core Audio process tap，也保留 ScreenCaptureKit 路径，可作为 QuickLang 采集兼容性的备选研究；见[后端选择](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/capture/backend_config.rs#L76-L83)。可用于检查耳机/设备变化、静音、采集停止后排空、录音和识别隔离等细节；不能假设全部已经经过我们的设备验证。

不要照搬其混音质量描述：当前活跃 `audio/pipeline.rs` 的 mixer 与仓库 `audio_v2/` 中的 ducking 代码不是同一条路径。主链当前采用混合相加和幅度限制，不能用 README 的“intelligent ducking”证明当前实际会自动闪避。QuickLang 本地字幕当前明确拒绝 mixed，云端采集路径已有 mixed；如增加本地混合，应验证回声、重复识别和同时讲话，而非只合并采样。

### 4.5 从会议到学习：产品价值最高，但需要自行实现

建议形成“英文视频/会议 → 本地字幕 → 保存感兴趣片段 → 精听/听写/跟读 → 生词与表达复习”的闭环。Meetily 提供会议资料获取与管理的参考，QuickLang 已有学习模块可以承接。

这属于本次产品建议，不是 Meetily 已有的教学能力。其摘要不能直接等同于英语讲解，ASR 文本差异也不能当作发音、音素或语调评分。

## 5. 不适合直接照搬的地方

### 5.1 VAD 完整语音段转写不等于低延迟持续出字

当前活跃代码以 VAD 决定分段，实时路径静默阈值 500 ms，批量路径通常为 2000 ms；`target_chunk_duration_ms`明确被忽略，持续讲话的输出问题仍在源码中指向 issue #756。见[pipeline 常量](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/pipeline.rs#L19)、[分段初始化](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/pipeline.rs#L739)。

500 ms 是语音结束判断参数，不是首字延迟或端到端延迟。对持续英语视频，等待整段结束可能比 Apple 临时结果路径慢，因此不建议替换字幕主线。Whisper/Parakeet 名称或推理加速宣传也不能直接推导用户更早看到文字。

### 5.2 段时间范围不等于词级对齐

`TranscriptResult`主要包含 text、confidence、is_partial，活跃 worker 从音频 chunk timestamp/duration 形成事件时间范围。见[worker](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/transcription/worker.rs#L194)。这不能直接交付 QuickLang 逐词定位、字幕精确对齐和跟读评分。

### 5.3 架构参考不等于整套依赖引入

Meetily 是应用，不是独立 ASR SDK。Next.js 页面、SQLite 仓储、会议业务和推理运行时与 QuickLang 的 Vite/React、seekdb 和学习业务没有必要整体合并。应优先复用思想或底层库，少量移植边界清晰的代码；保留当前 Swift 原生采集和 Rust 业务边界。

### 5.4 开源与商业能力需分开

官方 README 明确 Pro 使用不同代码库。不能把商业版增强识别、高级导出、自动会议检测或说话人分离等宣传自动记为当前开源可复用能力。Meetily 桌面支持也不能证明其采集或悬浮字幕能直接迁移到 iPhone。

## 6. 许可证与采用成本

根许可证为 MIT，许可文本要求保留版权与许可声明，见[LICENSE.md](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/LICENSE.md)。若采纳代码，应将来源 commit 和声明纳入 QuickLang 第三方归属记录；模型权重和新增运行时/FFmpeg 等组件分别核对其许可证，根 MIT 不能替代这些组件的许可。

成本主要来自模型下载体积、冷启动、内存与持续发热、平台打包、模型版本维护和结果时间戳适配。是否值得付出，应由实际对测与目标用户需求决定。

## 7. 建议执行顺序

1. **先补本地字幕的资料留存**：接入既有会话仓储；明确正常停止/异常退出/磁盘满时录音和文本边界；验证字幕低延迟不受保存影响。
2. **打通学习闭环**：从会话选择有真实时间范围的片段进入现有听力训练，收藏生词和常用表达。
3. **再做单个替代引擎的离线原型**：复用录音，不先改实时链。对 Apple、候选 Whisper 或 Parakeet 做同机同音频对照；引擎选一个起步。
4. **有证据后决定是否加入正式产品**：记录首个临时结果、稳定结果延迟、WER、术语错误、时间戳误差、内存、CPU/GPU、冷启动与长会话积压。离线处理速度与实时首字延迟分别报告。

测试音频应包括实际英语会议、口音、专有名词、连续无长停顿发言、静音和多人重叠；以清晰合成语音的单次结果作为普遍性能承诺没有依据。

本次仅新增研究文档，未修改产品实现，未运行性能或功能测试。
