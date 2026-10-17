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

Flyway在application.yml显式配置url/user/password，使用独立迁移连接；业务查询走Druid连接池。独立验证脚本应复现这两条装配路径，不能把带默认Wall的业务池交给Flyway后据此判断历史PREPARE迁移失效，也不应为运行查询放宽Wall。

## 版本与 repeatable

工作区改造前的配对后端目录有 **27个versioned SQL**，从V1/V2到 `V20261016_220__ai_attempt_trace.sql`；v1.2.0静态旧快照的教程基线为22个、截止V170。版本按Flyway数值段比较，不以字符串排序或文件修改时间判断先后。新增脚本前核对当前分支所有版本，不能复用已存在的版本号。

| 迁移阶段 | 作用 |
| --- | --- |
| V1 / V2 | 基础表与种子；包括公开初始化账号，部署后立即处理 |
| 20260726 系列 | 文件权限、旧结构对齐、字符集/排序规则 |
| 20260926 系列 | 参数运行态、字典、受控调度、通知、AI模型/场景、微信授权 |
| 20261012.120–160 | 内容权限、历史网站管理建立与退役、菜单清理、加密业务配置、低代码 |
| 20261013.170 | 旧基线三个一级组、叶子归并与权限关联迁移 |
| 20261016.180 | `V20261016_180__ai_config_v04.sql`：独立AI管理导航、配置/不可变版本、多模型/Key与测试准入 |
| 20261016.190 | `V20261016_190__ai_template_data_v04.sql`：模板、资源、版本与测试/审批证据 |
| 20261016.200 | `V20261016_200__ai_app_runtime_v04.sql`：应用发布版本、业务请求、尝试与阶段日志 |
| 20261016.210 | `V20261016_210__ai_access_actions.sql`：补齐模板/数据动作及AI平台日志审计权限 |
| 20261016.220 | `V20261016_220__ai_attempt_trace.sql`：尝试历史追加实际provider/model/Key版本、供应商追踪ID与输出上限，旧未知值保留NULL |

V130 曾建立网站内容表；V140 已退役这些表/菜单。应保留历史版本链，不删除旧脚本来假装模块从未存在。optional 下同名 R 脚本用于历史资料示例清理，不再创建示例表。曾使用该 location 的库，后续必须保留，才能校验已应用 repeatable 历史。

旧教程基线曾启用两个location，实测history=23（22 versioned + 清理R），属于历史记录。当前源码默认新库应匹配27个versioned脚本；启用该optional清理R时通常为28条history。不能只凭总数验收，判断依据是每条script/version/type/checksum/success与本环境location及当前源码一致。

## 场景工作区增量

直接保存改造新增 `V20261016_225__direct_scene_runtime.sql`，位于既有V220之后，增加场景身份、不可变配置版本、mutation幂等及请求的场景关联，保留旧应用和请求。已发布版本建立精确兼容映射；未发布草稿不变成可运行配置，歧义关联明确标记。该增量尚待组合迁移验收，应以实际部署源码目录与逐条history核对，不能把旧27条成功当成V225已成功。数据对象接缝复用既有表，本次没有额外V226。

不要混入后续阶段的未发布迁移或改写旧成功脚本。正常新增V225的目录应有28个versioned脚本；optional历史按实际location另核对。

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

旧教程基线曾在隔离MySQL8.0.12空库完成含V170的23条history、重启strict validate及真实服务验证。当前配对源码的正式CI已通过MySQL5.7与8.0两组服务矩阵，覆盖空库迁移、严格校验和认证服务检查，并包含AI配置经Druid Wall的HTTP回归。当前一期另有真实记录摘要组合验收；这些结果不等于独立机器或读者目标库的升级演练，不授权修改已应用迁移。

源码：后端 `system-admin/src/main/resources/application.yml`、`application-datasource.yml`、`db/migration/*.sql`、`db/optional-migration/*.sql`、`system-admin/src/test/java/com/xinghuiTec/quality/ReleaseServicesIT.java`及 `.github/workflows/ci.yml` 的MySQL服务矩阵；版本组合见[版本页](../releases/versions.md)。
