# 大模型统一接入

QuickLang 采用 **LiteLLM Proxy + OpenAI 兼容协议**作为多厂商接入方案。React/Tauri 继续调用统一的对话和转写接口，由独立网关适配厂商协议。新增厂商或更换模型只修改网关配置，不增加业务分支，也不在桌面包中嵌入 Python 运行时。

LiteLLM 覆盖 OpenAI、Anthropic、Gemini、Azure、Bedrock、DeepSeek、Ollama 等服务，具体范围以[官方提供商列表](https://docs.litellm.ai/docs/providers)为准。统一的是调用协议，不代表所有厂商、模型和功能完全等价；尚未支持的提供商仍需等待或添加网关适配。

## 本机启动

网关作为独立服务安装。按[官方快速开始](https://docs.litellm.ai/docs/proxy/quick_start)安装 `litellm[proxy]`，实际部署时固定经过验证的版本。本仓库提供配置示例，尚未锁定或打包网关依赖。

在仓库根目录的终端设置以下环境变量（密钥填自己的值，不提交到仓库）：

```sh
export LITELLM_MASTER_KEY='sk-替换为本机网关密钥'
export QUICKLANG_CHAT_MODEL='deepseek/deepseek-chat'
export QUICKLANG_CHAT_API_KEY='替换为对话厂商密钥'
export QUICKLANG_TRANSCRIPTION_MODEL='openai/whisper-1'
export QUICKLANG_TRANSCRIPTION_API_KEY='替换为转写厂商密钥'
litellm --config deploy/litellm/config.yaml --host 127.0.0.1 --port 4000
```

模型名称必须是所选厂商账户当前可用的标识。仅使用文字对话时，可从配置中删除 `quicklang-transcribe` 条目，不必设置转写环境变量。

打开“系统设置”，点击“填入本机 LiteLLM 配置”，填写网关密钥后保存：

| 设置 | 值 |
| --- | --- |
| 服务地址 | `http://127.0.0.1:4000/v1` |
| 对话模型 | `quicklang-chat` |
| 语音转写模型 | `quicklang-transcribe`，不用转写时留空 |
| API Key | 上面的 `LITELLM_MASTER_KEY`，仅用于个人本机开发 |

填入配置只是编辑表单，不会安装或启动网关。应用仍支持直接连接 OpenAI 兼容服务；已保存配置不自动迁移。

## 切换厂商与增加模型

`deploy/litellm/config.yaml` 中的 `model_name` 是应用使用的稳定别名，`litellm_params.model` 是带提供商前缀的真实模型名。把 `QUICKLANG_CHAT_MODEL` 改为 `anthropic/<模型 ID>` 或 `gemini/<模型 ID>` 并更新密钥，重启网关即可保留应用设置不变。需要多个模型同时可选时，增加不同 `model_name` 的条目，在应用中填写相应别名。

OpenAI 兼容服务可使用 `openai/<模型 ID>`，同时在对应 `litellm_params` 添加 `api_base`。Azure 需要部署名称、地址和 API 版本，Bedrock 需要 AWS 身份配置，不能仅替换通用 API Key；配置方式见[官方配置文档](https://docs.litellm.ai/docs/proxy/configs)。

对话走 `POST /v1/chat/completions`，转写走 `POST /v1/audio/transcriptions`。两者可路由到不同厂商，转写能力以[支持列表](https://docs.litellm.ai/docs/audio_transcription)为准。当前应用使用非流式文字反馈和音频上传，没有实现工具调用、图片输入或实时语音。

## 运行与验证边界

厂商密钥只放在网关环境中；应用仅在内存中保留网关密钥。远程或多人部署使用 HTTPS 和受限的网关访问密钥，不向客户端分发管理密钥；虚拟密钥、预算和用量管理需要按 LiteLLM 文档额外配置。浏览器预览需允许对应来源的 CORS，桌面版通过 Rust 发请求。

本仓库的客户端协议测试使用模拟响应，不产生厂商费用。真实验收需启动网关并配置有效凭据，分别完成文字对话、语音转写，再更换对话厂商确认别名不变仍可使用。当前配置示例不代表这些真实厂商调用已经验收。
