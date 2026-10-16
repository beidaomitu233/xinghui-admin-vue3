# 数据库迁移

本页面向部署者和数据库维护人员，用于空库初始化、存量库升级与迁移失败恢复。前提是确认数据库归属、代码版本与备份方案；本页不授权清理现有业务库。

## 配置与目录

| 项目 | 当前行为 |
| --- | --- |
| 数据库建立 | 部署者先创建 schema，Flyway 不创建数据库 |
| 主连接 | `DB_URL/DB_USERNAME/DB_PASSWORD` 同时供 Flyway 和 dynamic-datasource 主库 |
| 默认 location | `classpath:db/migration` |
| 历史 optional location | `classpath:db/optional-migration`，仅在环境需要时显式保留 |
| baseline | `baseline-on-migrate=false`，`baseline-version=2` 仅为经评估的历史基线预留 |
| 校验与顺序 | validate-on-migrate=true，out-of-order=false，严格 missing 校验 |
| 清理 | clean-disabled=true；不用 clean/删 history 解决故障 |

`sql/xinghui_admin.sql` 是历史导出，不能作为当前初始化方式。旧文档写的 DB_HOST/DB_NAME 自动拼接、默认自动 baseline 已过期。

## 版本与 repeatable

当前目录有 **22 个 versioned SQL**，从 V1/V2 到 `V20261013_170__menu_consolidation.sql`。版本按 Flyway 数值段比较，不以字符串排序或文件修改时间判断先后。新增脚本前核对当前分支所有版本，不能复用已存在的版本号。

| 迁移阶段 | 作用 |
| --- | --- |
| V1 / V2 | 基础表与种子；包括公开初始化账号，部署后立即处理 |
| 20260726 系列 | 文件权限、旧结构对齐、字符集/排序规则 |
| 20260926 系列 | 参数运行态、字典、受控调度、通知、AI模型/场景、微信授权 |
| 20261012.120–160 | 内容权限、历史网站管理建立与退役、菜单清理、加密业务配置、低代码 |
| 20261013.170 | 三个一级组、叶子归并与权限关联迁移 |

V130 曾建立网站内容表；V140 已退役这些表/菜单。应保留历史版本链，不删除旧脚本来假装模块从未存在。optional 下同名 R 脚本用于历史资料示例清理，不再创建示例表。曾使用该 location 的库，后续必须保留，才能校验已应用 repeatable 历史。

当前质量验证环境启用了两个 location，实测 `history=23`（22 versioned + 清理 R）。默认仅 versioned 的新库不应机械要求23行；判断依据是每条 script/version/type/success 与本环境 location 匹配。

## 空库启动

1. 建立专属 utf8mb4/general_ci schema 和账号，确保表数为0。
2. 设置完整 `DB_URL` 及账号；检查自己连接的 schema。
3. 保持 baseline 默认 false，启动当前后端。
4. 查看 V1/V2 及后续迁移日志，查询完整 history。
5. 重新启动，确认严格校验成功且原有业务数据保留。

```sql
SELECT DATABASE(), CURRENT_USER(), VERSION();
SELECT COUNT(*) AS table_count
FROM information_schema.tables WHERE table_schema=DATABASE();
SELECT version, script, type, checksum, success
FROM flyway_schema_history ORDER BY installed_rank;
```

其中表数检查是在首次启动前进行；已有 history 后不能把该步骤转成删表命令。应用代码还依赖 Redis/JWT，不能只凭数据库迁移成功断言整个应用启动验证完成。

## 存量库与基线

有业务表但没有 history 的库不会默认自动接受 V2 baseline。先对比其结构、种子、租户数据、当前脚本及依赖版本；规划人工基线或前向迁移，经负责人确认、备份/恢复演练和窗口准备后实施。

baseline=2 表示将 V1/V2 视为已有，并非自动补齐这两份 SQL 的所有内容。旧结构不一致时，盲目启用 baseline 会留下缺表/字段/权限。不要通过全局设置 `baseline-on-migrate=true` 把未知库连接问题吞掉。具体升级流程见[升级](../releases/upgrade.md)。

## 增加与修复迁移

成功执行过的 versioned SQL 不再修改；修复用更高版本的新脚本。采用具名列、显式字符集/排序规则，评估旧数据和权限关联。MySQL DDL 可能自动提交，失败不能假定整份脚本自动回滚。

迁移失败时停止反复启动，保留目标 commit、history 和错误短摘要，检查实际 DDL/DML 已完成部分。checksum mismatch、missing migration 与 SQL 执行失败不同，不能一律执行 `repair`。只有经审查确认 schema 与历史一致的方案才考虑 repair；它不会替你修复业务结构。

不得随意删库、清表、删除 `flyway_schema_history` 或将 out-of-order/ignore-migration-patterns 改宽来得到绿灯。需要回退时按[备份恢复](../operations/backup-restore.md)成套恢复 DB、主密钥、对象与配套代码。

## 已验证与源码依据

当前开发候选在隔离 MySQL8.0.12 空库完成含 V170 的23条 history、重启 strict validate、真实认证/SQL/MinIO和夹具清理。MySQL5.7/8.0容器矩阵及独立机器未运行；这些本地结果不替代目标环境升级演练。

源码：后端 `system-admin/src/main/resources/application.yml`、`application-datasource.yml`、`db/migration/*.sql`、`db/optional-migration/*.sql`、`system-admin/src/test/java/com/xinghuiTec/quality/ReleaseServicesIT.java`；版本组合见[版本页](../releases/versions.md)。
