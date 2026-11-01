# 数据库迁移

MySQL 5.7 在数据库启动配置中设置 `explicit_defaults_for_timestamp=ON`，应用账号只需专属数据库权限。

使用 Flyway，迁移目录为 `system-admin/src/main/resources/db/migration`。

```text
V1__baseline_schema.sql
V2__baseline_data.sql
V20261101_600__ai_statistics_and_permission_modules.sql
V20261101_610__agent_extensions.sql
```

新功能新增迁移文件，不修改已执行迁移。空库由基线与后续版本顺序初始化；存量库按 `flyway_schema_history` 升级。

发布前验证空库与已有版本升级，保留数据库备份。升级说明见 [2.0 升级](../releases/upgrade.md)。
