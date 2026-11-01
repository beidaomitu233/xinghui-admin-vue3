# 环境准备

| 工具    | 版本                         |
| ------- | ---------------------------- |
| Java    | 17                           |
| Maven   | 3.9.x                        |
| Node.js | 22 LTS，或仓库声明的兼容版本 |
| pnpm    | 10.28.1                      |
| MySQL   | 5.7 / 8.0                    |
| Redis   | 7                            |

准备独立 MySQL 数据库和 Redis；文件功能另需 MinIO 或兼容对象存储。CI 使用 MySQL 5.7/8.0 服务矩阵。MySQL 5.7 在数据库配置中开启 `explicit_defaults_for_timestamp=ON`，MySQL 8.0 使用默认设置。

```bash
java -version
mvn -version
node --version
pnpm --version
```

浏览器使用近期版本的 Chrome、Edge、Firefox 或 Safari。运行步骤见 [快速开始](quickstart.md)。
