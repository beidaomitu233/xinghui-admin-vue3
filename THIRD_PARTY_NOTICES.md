# 主要第三方归属与许可

现有审核静态构建记录了90个实际打包依赖：[包与版本清单](site/licenses/packages.json)、[随包许可及NOTICE原文](site/licenses/third-party.txt)、[该次构建使用的图标集作者与许可元数据](site/licenses/icon-sets.json)。这些文件描述对应静态产物，不自动覆盖后来导入或更新的全部源码依赖。

以下信息来自该静态构建环境中相应包的 `package.json`、原始 `LICENSE` / `NOTICE` 文件核对，许可文本逐字保留。它是主要上游的起始清单，**不是整个源码工作区直接、传递及开发依赖的完整许可证审计**。源码依赖范围应结合各工作区 `package.json` 和 `pnpm-lock.yaml` 核查；维护者仍须按实际构建模块补齐发行所需声明。

| 包/项目 | 核对版本 | 许可 | 原文 |
| --- | --- | --- | --- |
| Vue Vben Admin 派生界面 | 派生工作区包版本5.5.9，不作为上游发行版本声明 | MIT | [Vben原文](site/licenses/vben/LICENSE.txt)及根[LICENSE](LICENSE) |
| Vue | 3.5.27 | MIT | [原文](site/licenses/vue/LICENSE.txt) |
| VitePress | 1.6.4 | MIT | [原文](site/licenses/vitepress/LICENSE.txt) |
| Element Plus | 2.13.1 | MIT | [原文](site/licenses/element-plus/LICENSE.txt) |
| Apache ECharts | 6.0.0 | Apache-2.0，包含独立子组件声明 | [原LICENSE](site/licenses/echarts/LICENSE.txt)、[NOTICE](site/licenses/echarts/NOTICE.txt)、[D3子组件许可](site/licenses/echarts/LICENSE-d3.txt) |

完整 [Apache License 2.0](site/licenses/Apache-2.0.txt) 来自已核对的 ECharts LICENSE 中对应原文；ECharts完整LICENSE及其附加声明同时保留，没有用一个简短摘要替代许可。这里不删除或替换上游原有版权。

Pages 工作流只上传 `site/`。站点内公开许可路径为 `/xinghui-admin-vue3/licenses/`，该目录提供与已审核静态快照对应的声明副本；根文档的源码导入说明不表示静态快照已经重新构建或发布。后续构建若使用其他版本或包，应以实际模块清单更新并保留其所附许可。

源码导入须保留 Vben 的原版权和完整 MIT 许可，以及各目录、组件、依赖附带的原有声明。本文件不替代根 `LICENSE` 或第三方许可原文，也不构成后端源码、Git 历史或整个源码工作区的完整许可证审计结论。
