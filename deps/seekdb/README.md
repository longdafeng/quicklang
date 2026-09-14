# seekdb 1.4.0 嵌入式接入

版本固定在 runtime.lock.json。2026-09-13 核验的最新稳定版是
[v1.4.0](https://github.com/oceanbase/seekdb/releases/tag/v1.4.0)；构建不跟随 latest 漂移。
官方 macOS ARM64 pkg 仅展开到仓库缓存，不执行 installer、不修改 /opt/seekdb。

## 架构与边界

1.4 embedded 由官方 C driver 管理独立本地引擎进程，以 Unix socket/MySQL 协议访问。
不是进程内引擎，也不需要用户安装服务。没有 SQLite 或生产内存回退。
默认不请求 TCP 监听；首次初始化使用 memory_budget=1G、log_disk_size=2G，约需数秒启动。
测试数据库也会占用磁盘，不能按 SQLite 的资源预期部署。

仅支持 macOS 15+ ARM64。iOS 不能直接使用本地子进程方案，仍需在线 API 或另行验证的官方移动方案；Windows 未适配。
seekdb 1.0–1.3 不能原地升级到 1.4，必须逻辑导出/导入；QuickLang 拒绝打开不匹配版本目录，尚无自动迁移旧数据工具。

## 准备与验证

需要 Node 22.12+、CMake、Apple Command Line Tools、Perl、Make、Git、curl。
make init 校验官方 pkg 和 OpenSSL 3.5.8 LTS 的 SHA-256，构建固定提交的 C driver。
OpenSSL 也从固定源码在仓库内构建，不依赖 Homebrew 的运行库。
产物为 deps/cache/seekdb-runtime，manifest.json 记录文件哈希。
`node scripts/bootstrap/seekdb.mjs --offline-check` 校验缓存；make build 校验后打包为应用资源 seekdb/。
库依赖改为 @loader_path，dylib 仅作本地 ad-hoc 签名。正式发布仍需开发者签名、公证和依赖安全/许可审计。
缓存损坏时拒绝覆盖，请先保留有用改动并将缓存移开，再重新准备。

make test 不需要数据库；make test-db 使用真实引擎，绝不以 mock 冒充通过。
测试数据库保留在 build/test-databases/seekdb-<pid>-<timestamp> 便于检查日志。
后台进程退出由官方 driver/引擎管理，不执行 killall，不自动删除数据库。

## 数据与桌面接口

桌面数据目录为 Application Support/io.github.longdafeng.quicklang/seekdb-1.4.0。
连接在专用线程创建/使用，UI 不暴露原始 SQL 或文件接口。

- get_runtime_status：starting/ready/error，仅真实初始化成功后 persistence_ready=true。
- load_review_state({cardId})：创建或读取卡片状态。
- rate_card({cardId,eventId,expectedVersion,rating})：事务保存复习事件和调度状态。

前端读取 version，为每次评分生成 eventId；失败重试必须复用同一 ID 和评分。
SQL 值使用 UTF-8 十六进制字面量；调度只由 Rust 应用层计算。
目录锁、引擎版本标记、迁移 checksum 失败关闭；拒绝 SEEKDB_BIN 外部引擎覆盖。
V0002__native_reviews.sql 是实际 1.4 原生基线，迁移号 2；早期 V0001 只是未执行的草案。
当前只存 ReviewState/ReviewEvent，不代表词库、整场会话、同步和备份已完成。
界面学习流程存在并行修改，本次仅提供稳定 IPC，不覆盖其持久化接线。

## 第三方许可与重建

seekdb、C driver 为 Apache-2.0，MariaDB Connector/C 为 LGPL-2.1，OpenSSL 3.5 为 Apache-2.0。
QuickLang 动态加载 driver，不因此要求自有代码改成 AGPL，但仍须履行第三方义务。
发行资源携带许可、绑定层及 MariaDB 对应源码归档，允许替换/relink libseekdb.dylib。

在新目录解压 seekdb/sources/seekdb-bindings.tar.gz，再将 mariadb-connector-c.tar.gz
解压到其 deps/mariadb-connector-c。准备兼容的 OpenSSL 3.x，然后执行：

```sh
cmake -S . -B build -DSEEKDB_BUILD_PYTHON=OFF -DBUILD_TESTING=OFF -DWITH_EXTERNAL_ZLIB=YES -DWITH_SQLITE=OFF -DWITH_SSL=OPENSSL -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 -DCMAKE_BUILD_TYPE=Release
cmake --build build --target seekdb --parallel 4
```

必要时设置 OPENSSL_ROOT_DIR。将库放到引擎旁，OpenSSL install name 改为随包 @loader_path，重新本地签名，
即可替换 QuickLang.app/Contents/Resources/seekdb/libseekdb.dylib，无需重新链接 QuickLang。
完整构建参数见 scripts/bootstrap/seekdb.mjs。开发缓存 manifest 校验不是发行应用的运行时替换限制。
