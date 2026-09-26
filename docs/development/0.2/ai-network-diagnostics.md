# macOS 同声翻译网络诊断

AI 转写、文本翻译和历史字幕共用 `src/app/src/ai_network.rs`。本地服务始终直连；显式的进程代理变量沿用 reqwest 行为；否则 macOS 通过 CFNetwork 获取系统代理并执行 PAC，支持 HTTP、HTTPS 和 SOCKS（代理端解析域名）。代理解析在阻塞工作线程执行，PAC URL 查询最多等待 5 秒，连接和代理结果缓存 30 秒。

实时字幕日志仍位于 `~/Library/Logs/io.github.longdafeng.quicklang/caption-timing.jsonl`。`network_error` 现在附带受限的 `errorCode`：

- `AI_NETWORK_CONNECT`：连接失败，包括代理不可达。
- `AI_NETWORK_TIMEOUT`：请求超时。
- `AI_NETWORK_TLS`：TLS/证书连接失败。
- `AI_NETWORK_DNS`：域名解析失败。
- `AI_PROXY_CONFIGURATION`：系统代理/PAC 解析失败。
- `HTTP_401` 等：服务端已响应，检查密钥、权限、模型或额度。
- `TRANSLATION_RESPONSE`：响应格式、流解析或完成状态异常。

错误分类不记录 URL、密钥、录音、转写文字或服务端原始错误正文。前端不能写入后端的错误分类字段。界面保留具体网络分类和 HTTP 状态，而英文识别仍继续运行。

## 验证

单元测试：`cargo test -p quicklang-app --lib`，以及 `npm test -- tests/unit/ui/caption-translation.test.ts tests/unit/ui/caption-stream.test.ts tests/unit/ui/interpretation-ai.test.ts`。

原生代理编码测试：

```sh
clang -fobjc-arc -Wall -Wextra -Werror -framework Foundation -framework CFNetwork \
  tests/native/ai-proxy-test.m -o /tmp/quicklang-proxy-tests
/tmp/quicklang-proxy-tests
```

手工连通性测试为 ignored 测试，不会在普通测试中访问外部服务：

- `ai_network::tests::live_connectivity_probe` 使用 `QUICKLANG_AI_PROBE_URL`，发送不带凭据的测试请求。401 仅证明连接和 TLS 可达。
- `caption_stream::tests::live_profile_translation_probe` 使用 `QUICKLANG_AI_PROBE_DATA` 和 `QUICKLANG_AI_PROBE_PROFILE`，通过系统钥匙串读取已有配置，翻译固定测试句子，不输出密钥或返回文字。必须显式指定要验证的现有数据库及配置；数据库应未被应用占用。

模拟 Finder 启动时，清空大小写形式的 HTTP_PROXY、HTTPS_PROXY 和 ALL_PROXY 后运行测试。2026-09-21 在该环境下，系统 PAC/SOCKS 连通性测试收到 HTTP 401，已有配置的真实文本翻译测试返回非空译文。该结果不代表语音转写模型的服务端能力已验证。
