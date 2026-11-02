# 项目介绍

星辉是以 AI 为核心的应用开发后台。它把模型接入、提示词、Agent、业务工具和使用统计放在一套管理系统中，保留用户、角色、表单、文件、通知与定时任务等基础功能。

## 核心能力

- **AI 中台**：使用 AgentScope Harness 处理自然语言任务和图片，展示结果、计划与执行进度。
- **模型管理**：一个业务模型可接入多个供应商，场景分别设置模型顺序与兜底。
- **工具扩展**：接入现有 Java 业务服务、原生 Skill、远程 MCP 和外部知识库。
- **AI 统计**：按模型、供应商、场景与时段分析费用、用量、速度、可靠性和用户评价。
- **管理底座**：多角色、模块操作权限、租户、可视化表单与常用后台功能。

## 技术选型

| 层次       | 技术                                                       |
| ---------- | ---------------------------------------------------------- |
| 管理前端   | Vue 3、TypeScript、Vue Vben Admin、Element Plus、VXE Table |
| AI 对话    | AgentScope WebUI、AgentScope Java 2.0.3 Harness            |
| 后端       | Java 17、Spring Boot、Spring Security、MyBatis-Plus        |
| 数据与状态 | MySQL、Redis、Flyway、对象存储                             |
| 发布       | GitHub Actions、GHCR、Docker Compose、Nginx                |

前端优先沿用 Vben 与 Element Plus 组件；Agent 使用官方 Harness 和工具注册机制。业务开发主要编写服务和工具适配器。

## 开始使用

[快速开始](../guide/quickstart.md) → [模型与提示词](../features/ai.md) → [AI 中台](../ai/workbench.md) → [开发业务工具](../development/ai-extension.md)。

源码：[前端仓库](https://github.com/beidaomitu233/xinghui-admin-vue3)、[后端仓库](https://github.com/beidaomitu233/xinghui-admin-backend)。
