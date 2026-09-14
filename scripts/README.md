# 初始化脚本

执行 `make init` 或 `./scripts/init.sh` 完成初始化。`init.sh` 可从任意工作目录运行；
`node scripts/tasks.mjs init` 也执行相同流程。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `init.sh` | Shell 入口、Node 可用性提示，转交统一任务入口 |
| `tasks.mjs` | Make/Node 任务分发，其他任务继续复用项目本地 Rust |
| `release/package.mjs` | `make release` 的 ZIP 打包、解压复验、原生依赖检查和 SHA-256 生成 |
| `bootstrap/init.mjs` | 系统检查、初始化锁、六阶段编排、数据库目录选择 |
| `bootstrap/toolchain.mjs` | 从 `rust-toolchain.toml` 读取版本和组件，安装项目本地 Rust |
| `bootstrap/rustup.lock.json` | 官方 rustup 安装器版本、URL 与 SHA-256 |
| `bootstrap/npm.mjs` | 按 `packageManager` 选择或安装项目本地 npm |
| `bootstrap/network.mjs` | 有界网络探测与本次进程的代理/直连选择 |
| `bootstrap/download.mjs` | 分段下载、缓存恢复、SHA-256 校验和原子发布 |
| `bootstrap/process.mjs` | 输出转发、退出状态检查、安全步骤的有限 SIGKILL 重试 |
| `bootstrap/seekdb.mjs` | 锁定运行包、OpenSSL 和 C 驱动构建、动态库打包和验证 |

## 六个阶段

1. 检查 macOS 15+ ARM64、Node 22.12+、Apple Command Line Tools、npm/Git/curl/Perl/Make。缺少 CMake 且已有 Homebrew 时自动安装。
2. 选择网络链路，下载校验锁定的 rustup，自动安装项目本地 Rust 及组件，预热只读版本命令。
3. 检查 `packageManager` 固定的 npm 版本，不匹配则在 `deps/cache/npm` 安装本地副本，再通过 `npm ci` 与 `cargo fetch --locked` 下载锁定依赖。
4. 下载和校验 seekdb/OpenSSL，构建原生驱动；完整缓存通过校验后直接复用。
5. 生成词库种子，离线编译初始化程序；无参数启动探测不打开数据库。
6. 打开数据库、执行缺失迁移、导入缺失词库。数据库操作失败时直接报错，不自动重复写入。

## 这次问题对应的自动处理

| 问题 | 处理 |
| --- | --- |
| `spawnSync cargo ENOENT` | 自动安装到 `deps/cache/cargo`、`deps/cache/rustup`，不依赖全局 Cargo |
| npm 版本导致锁文件解析不同 | 按 `packageManager` 使用 npm 11.12.1，自动安装本地副本并供其他任务复用 |
| 代理下载过慢 | 自动探测；大文件最多 8 路并发、每段 1 MiB；curl 有连接/总时长/最低速度限制 |
| 下载中断、坏包残留 | 完整包校验后复用；坏包保留 `.invalid-*`；分段按长度复用，最终仍强制完整 SHA-256 校验 |
| 不支持 Range | 等待全部下载任务结束后回退单流，避免并发写同一暂存文件 |
| 驱动首次克隆显示大量 `D` | 不再使用 `--no-checkout`；对无 index、无工作文件的旧克隆恢复首次检出 |
| 本地驱动源码已有修改 | 拒绝覆盖并说明路径；用户修改不属于可自动丢弃的缓存 |
| 原生运行包校验失败 | 保留旧包目录，重新构建；`--offline-check` 仍严格报错 |
| 不完整解包或 OpenSSL 安装 | 缺少关键文件时重新解包；OpenSSL 安装成功后才写完成标记 |
| 新二进制首次 SIGKILL | 只对明确允许重试的启动/构建步骤最多重试两次；持续失败原样报错 |
| 已有迁移表的 CREATE IF NOT EXISTS 卡住 | Rust 迁移器查询 `information_schema.TABLES`，已有表时跳过建表，继续校验迁移版本和 checksum |

## 配置与边界

```sh
# 默认：仅本次初始化自动选择网络链路
make init

# 代理是必需条件时固定沿用现有代理环境
QUICKLANG_NETWORK=proxy make init

# 强制直连
QUICKLANG_NETWORK=direct ./scripts/init.sh

# 独立数据库；启动应用时也应传入同一变量
QUICKLANG_DATA_DIR=/absolute/path ./scripts/init.sh
```

脚本不会安装整个 Homebrew、Node.js 或 Apple Command Line Tools，不修改 shell 配置，
不会绕过签名验证/关闭 macOS 安全机制，也不会覆盖用户数据库。缺少这类系统前置条件、
数据库被应用占用、网络完全不可达或源码存在用户修改时，按照错误提示处理后重新执行。
首次安装实际耗时取决于网络与编译速度，自动重试有上限。
