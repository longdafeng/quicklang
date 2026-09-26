# macOS 本地开发签名

本地自签名证书用于固定 QuickLang 的代码身份，不是 Apple Developer ID，也不能代替面向其他用户分发时的公证。

首次运行：

```sh
node scripts/signing/local.mjs setup
make build
```

初始化会创建十年有效期的 `QuickLang Local Development` 证书，将私钥导入当前用户的登录钥匙串，仅为代码签名设置用户级信任。系统可能要求确认钥匙串操作。临时私钥和导入文件随后删除；仓库不保存私钥。

公开证书和指纹配置位于 `~/.config/quicklang/`。重复初始化会保留现有身份；不要在每次构建时重新生成证书。需要迁移机器时，应通过钥匙串访问安全备份证书和私钥。

`make build` 和 `make release` 在打包后、复制产物前自动应用本机配置，并执行 `codesign --verify --deep --strict`。显式设置 `APPLE_SIGNING_IDENTITY` 时优先交给 Tauri 签名。已配置但不可用的本地证书会让构建失败，不会静默退回临时签名。`make dev` 的裸可执行文件不走这个打包签名流程。

从旧临时签名切换后，需要退出应用并重新授予录音权限一次。固定证书与 bundle identifier 能保持代码身份，录音权限是否跨构建保留仍需实际验证。

AI 配置的钥匙串授权独立于录音权限。首次访问旧的 `com.quicklang.ai-profiles` 条目时，系统仍可能要求登录钥匙串密码；输入 Mac 登录密码并选择 **Always Allow（始终允许）**，才能为当前签名身份保留授权。应用无法代替用户完成这次系统授权；仅选择 Allow 不会保留长期授权。

主密钥成功读取或创建后只在当前应用进程的原生内存中缓存，同声翻译的连续转写和翻译请求共享该缓存，不再逐段访问钥匙串。缓存释放时清零，不写入配置文件；拒绝授权、读取失败或条目不存在不会缓存。退出应用后缓存失效，重新启动会重新读取钥匙串。若在钥匙串访问中修改或删除该条目，也应退出应用以释放已加载的密钥。

检查身份和签名：

```sh
security find-identity -v -p codesigning
codesign --verify --deep --strict build/cargo/debug/bundle/macos/QuickLang.app
codesign -d -r- build/cargo/debug/bundle/macos/QuickLang.app
```
