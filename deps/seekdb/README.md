# seekdb 接入边界

框架已建立存储端口及 seekdb/OceanBase 适配器入口；当前适配器明确返回 DB_NOT_CONFIGURED。
没有 SQLite，也没有生产内存数据库回退。

后续工作：锁定官方 embedded SDK 版本与平台二进制校验和；确认 Rust FFI 或受控 sidecar；
实现事务、迁移、进程锁、逻辑备份；运行真实数据库契约测试后接入桌面壳。
当前不会把用户全局安装的库当作发行输入。

平台目标：macOS 15+ ARM64 首发；iOS 使用在线 API；Windows 后续验证。
