# 升级与回退计划

本页向部署负责人说明从已有候选到新配对版本的操作顺序。前提是明确当前前后端/数据库/文档版本、有恢复点和维护窗口；当前没有“一键无损升级”工具。

## 升级前确认

1. 获取真实目标代码提交、变更说明和迁移文件，不依据package版本或页面标题判断。
2. 从现有数据库只读导出history，核对所有versioned/repeatable记录、checksum、success和location。
3. 检查默认baseline false、DB_URL统一配置、JWT/主密钥与Redis双客户端覆盖是否符合当前代码。
4. 确认旧模块退役和菜单整理对自己扩展的表、授权和页面是否有影响。
5. 按[备份恢复](../operations/backup-restore.md)保存数据库、对象、主密钥、配置和可回退产物。

```sql
SELECT version, type, script, checksum, success
FROM flyway_schema_history ORDER BY installed_rank;
```

如果库无history但非空，不走普通升级；先审查人工baseline/前向迁移方案。不能直接启用自动baseline到2而假设结构与V1/V2相同。

## 隔离演练

恢复一个经过授权的数据副本到隔离schema，连接隔离Redis和对象快照，关闭真实邮件/短信/微信/模型供应商动作。以目标JAR启动，验证strict迁移/重启、账号权限、三组菜单、文件历史读取和关键业务资源。

已有optional R历史必须保留`classpath:db/optional-migration`；漏location可能导致missing校验，不能改ignore模式掩盖。当前新空库质量验证23条history不等于你的存量库升级结果，不能用空库测试代替这一演练。

演练成功须记录代码/产物摘要、迁移前后history、业务核对结果和明确未验证项；失败先查实际DDL部分执行，不反复运行repair/clean。MySQL5.7/8.0兼容矩阵未运行时，目标数据库版本的风险仍需自己验证。

## AI工作区升级后的权限与会话刷新

包含 `V20261016_227__restore_ai_request_list_action.sql` 的版本将 `ai:request:list` 恢复为独立F动作，仅向原旧日志页已有明确授权、且迁移时有效的角色迁移。配置/场景动作或动态派生的监控导航不会因此获得日志读取权，`ai:monitor:enter` 也不替代日志列表或审计权限。

用户信息与路由缓存前缀随该版本升为v227，但已有登录会话仍可能保留旧权限快照。升级后通过正常“退出登录→重新登录”刷新会话；即使 `/user/info` 已显示新权限，也不能据此认定原会话中的服务端调用身份已刷新。若日志权限或监控调用统计仍不符合预期，重新登录后再核对角色的实际动作授权与接口结果，不通过扩大授权或清空共享Redis解决。

本说明是升级核对项，不代表该版本已完成整体验收。迁移结果、当前角色权限及新会话行为仍需在目标环境确认。

## 正式窗口

1. 暂停写入与相关调度，确认新的恢复点。
2. 部署目标后端、私有配置和稳定主密钥，执行迁移与启动。
3. 发布配套前端/runtime配置及文档dist，保持同源/api和/docs/。
4. 以最小自有账号做登录/菜单/本人通知、授权拒绝和关键业务核对。
5. 查看迁移/服务错误，确认通过后恢复流量和调度。

不要在运行同一schema迁移时同时启动多个不同版本的后端。私有密钥文件不随dist发布；前端哈希资源发布采用过渡策略，减少旧HTML找不到chunk的问题。

## 失败决策

如果目标启动失败，先判断是配置/依赖、迁移前失败还是DDL已经改变schema。只在旧代码与新schema明确兼容时回退代码；否则恢复已验证的成套DB/对象/密钥/配置/产物。恢复窗口的数据取舍应由业务负责人确认。

修改成功迁移、删history、放宽validate或改变主密钥不能作为回退方法。错误主密钥导致旧密文不可解密时优先恢复原值；当前没有自动重加密工具，不宣称随意换密钥可无损继续。

## 正常结果与源码

预期是目标提交对应的迁移全部成功、重启严格校验、原有业务/对象可读、当前权限正确，文档与运行版一致。本文流程未经读者自己的环境演练不自动成为其生产验收证明。

依据：后端`application.yml`、`db/migration/`与`db/optional-migration/`、`SecretCipher`及`ReleaseServicesIT`；前端`apps/web-ele/.env.production`、`src/router/routes-helper.ts`、`scripts/build-quality.mjs`。完整工具命令见[质量门槛](../operations/quality-gates.md)，当前限制见[版本组合](./versions.md)。
