# 主要第三方归属与许可

本次应用构建另外记录了90个实际打包依赖：[包与版本清单](site/licenses/packages.json)、[随包许可及NOTICE原文](site/licenses/third-party.txt)、[本次使用的图标集作者与许可元数据](site/licenses/icon-sets.json)。这份构建清单与下面的主要上游说明一并保留。

以下信息来自本次候选环境中相应包的 `package.json`、原始 `LICENSE` / `NOTICE` 文件核对，许可文本逐字保留。它是主要上游的起始清单，**不是最终构建全部直接/传递依赖的完整清单**；维护者仍须按实际构建模块补齐发行所需声明。

| 包/项目 | 核对版本 | 许可 | 原文 |
| --- | --- | --- | --- |
| Vue Vben Admin 派生界面 | 派生工作区包版本5.5.9，不作为上游发行版本声明 | MIT | [Vben原文](site/licenses/vben/LICENSE.txt)及根[LICENSE](LICENSE) |
| Vue | 3.5.27 | MIT | [原文](site/licenses/vue/LICENSE.txt) |
| VitePress | 1.6.4 | MIT | [原文](site/licenses/vitepress/LICENSE.txt) |
| Element Plus | 2.13.1 | MIT | [原文](site/licenses/element-plus/LICENSE.txt) |
| Apache ECharts | 6.0.0 | Apache-2.0，包含独立子组件声明 | [原LICENSE](site/licenses/echarts/LICENSE.txt)、[NOTICE](site/licenses/echarts/NOTICE.txt)、[D3子组件许可](site/licenses/echarts/LICENSE-d3.txt) |

完整 [Apache License 2.0](site/licenses/Apache-2.0.txt) 来自已核对的 ECharts LICENSE 中对应原文；ECharts完整LICENSE及其附加声明同时保留，没有用一个简短摘要替代许可。这里不删除或替换上游原有版权。

工作流只上传 `site/`。站点内公开许可路径为 `/xinghui-admin-vue3/licenses/`，该目录同时提供本声明的文本副本。最终构建若使用其他版本或包，应以实际模块清单更新并保留其所附许可；不能据此认为未公开的后端源码/历史许可审计已经完成。
