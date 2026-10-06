# Issue #45 整合验证记录

本目录提交本次分支对比、整合与验收阶段的文本记录（仅去除日志尾部空白），以及最终看板快照。记录中包含旧基线、失败诊断、修复前审查和中间草案，不能把每个文件都理解为最终通过结论。

最终实现与验收以 `../p51-import-verification-2026-10-05.md`、`../p6c-verification-2026-10-05.md` 和 `../../design/0.7/longterm-branches-integration-plan.md` 为准。`pre-integration-design/` 是整合前设计快照，不覆盖最终四表设计。dashboard 是合并后的静态快照，不再实时采集。

本次整合已通过 PR #76 合并到 main，提交 `ab29aca5`，对应 Issue #45–#55 已关闭；用户明确要求不等待 GitHub CI。新增导入布局和 iOS 导出目录选择的实际点击验收限制仍保留在报告中。

清理前的四个未提交 iOS 脚本/测试文件通过增量 patch 接入最新 main：识别 CoreDevice 暂时未提供 reality 的已配对设备、按需探测有线连接，以及修复 Xcode Rust 构建脚本 sandbox 配置。聚焦脚本测试 26 项通过，完整脚本测试 176 项通过 / 1 项跳过，官方格式检查 394 个文件全部通过；本轮没有执行真机安装或重新打包应用。

Git 分支历史已由 GitHub main 保存；不将 Git bundle 或浏览器 profile/cache 作为项目源码提交。此次临时恢复备份在提交和推送核验后删除。
