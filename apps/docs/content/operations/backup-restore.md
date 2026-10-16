# 备份与恢复

本页向数据库和部署维护人员说明一致性恢复需要保存的对象。前提是有当前环境的维护权限、保密存储位置和经过评估的恢复窗口；不要在共享数据库或别人环境照抄恢复命令。

## 备份集合

| 内容 | 原因 |
| --- | --- |
| 数据库及 `flyway_schema_history` | 业务数据、权限、已应用版本与校验和必须成套恢复 |
| 原始 `CONFIG_MASTER_KEY` | 数据库密文的解密依赖它；新随机主密钥不能解密旧数据 |
| JWT密钥/服务端配置版本 | 恢复时决定会话有效性和基础设施连接 |
| 对象存储对象及历史平台配置 | 文件记录对应对象；不能只备份SQL或只备份当前bucket配置 |
| 前后端/文档代码与产物摘要 | 确认能与恢复数据库一致运行的版本 |
| Redis恢复/会话策略 | 明确保留缓存或让会话重新认证，不意外恢复已失效登录态 |

微信、短信、存储、模型的数据库凭据使用AES-GCM密文；备份SQL不等于备份完整运行能力。主密钥与数据库分别受控保存，在恢复审批中配对，不能把密钥一并放到公开发布包。

## 建立一致性窗口

规划备份时暂停写入/调度或按数据库、对象存储的一致性策略建立恢复点。`mysqldump --single-transaction`适用于事务表逻辑快照，不自动冻结并发DDL，也不为外部对象提供跨服务事务。是否需要binlog/PITR、对象版本化与更严格RPO由运维方案决定，本项目没有自动跨服务恢复工具。

下面是单个专属schema的逻辑备份示例。使用交互式凭据配置，避免把密码放在命令行和shell历史；替换服务器/账号/目录。

```bash
umask 077
mysql_config_editor set --login-path=xinghui-backup \
  --host=127.0.0.1 --user=your_backup_user --password
mysqldump --login-path=xinghui-backup \
  --single-transaction --default-character-set=utf8mb4 \
  --routines --triggers --events --hex-blob --no-tablespaces \
  --set-gtid-purged=OFF xinghui_admin > xinghui_admin-backup.sql
sha256sum xinghui_admin-backup.sql
```

备份账户所需权限按实际MySQL版本、对象与GTID设置核对；上述是逻辑恢复示例，不包含完整PITR方案。确认命令退出码、文件非空与摘要，把备份加密后传入受控存储，并记录对象存储同一恢复点。

## 在隔离环境演练恢复

不要直接覆盖生产。先建立新的隔离schema及恢复账号，使用**恢复权限**的另一个login-path：

```sql
CREATE DATABASE xinghui_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

```bash
mysql_config_editor set --login-path=xinghui-restore \
  --host=127.0.0.1 --user=your_restore_user --password
mysql --login-path=xinghui-restore --database=xinghui_restore < xinghui_admin-backup.sql
```

备份命令未使用 `--databases`，不应包含切回生产库的USE/CREATE DATABASE；演练前仍检查SQL来源和目标。恢复对象快照及私有配置，使用备份对应主密钥，将应用 `DB_URL` 指向恢复库，Redis/存储也使用演练自己的目标，防止演练应用写生产服务。

使用备份对应的后端代码/迁移location启动，执行strict validate。先验证history、核心表、权限与密文解密，再用自己的低敏文件验证对象读取；供应商默认关闭，不通过发短信/模型调用证明数据库恢复。通过[启动验证](../guide/verification.md)完成最小认证和页面核对后记录结论。

## 回退条件

仅回退JAR不保证兼容已执行的新迁移。确认旧代码能读新schema才考虑代码回退；否则成套恢复旧DB、对象、主密钥、配置和前后端配对，必要时损失的窗口数据需由业务确认。不要用删除history或降低validate来伪造旧版可用。

主密钥丢失时，数据库中的旧密文不能靠新密钥恢复。当前没有批量轮换/重加密功能；应优先恢复原密钥，否则按受控方案重新设置相关凭据，并承认旧密文不能解密。错误主密钥与存储endpoint不可达是不同故障，见[故障排查](./troubleshooting.md)。

## 验证结果与源码

预期是恢复库strict校验成功、业务记录与对象能够读取、密钥不泄露、测试夹具只在演练环境。此文档只提供指南，本次文档任务没有重新备份或恢复用户业务库，也没有把空库测试冒充存量库灾备演练。

源码：`common/common-core/src/main/java/com/xinghuiTec/config/SecretCipher.java`、`system-admin/src/main/java/com/xinghuiTec/businessconfig/BusinessConfigService.java`、`ai/model/AiModelCredentialService.java`；`common/common-oss/src/main/java/com/xinghuiTec/oss/`下的历史存储解析/对象记录实现；`system-admin/src/main/resources/application.yml`与`db/{migration,optional-migration}/`。
