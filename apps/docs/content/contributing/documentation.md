# 贡献与维护文档

本页面向维护公开手册的贡献者。统一正文在前端仓库 `apps/docs/content/`，旧后端docs只保留迁移入口与源码定位，不再平行维护快速开始或升级教程。

## 信息组织与写作合同

导航分开始使用、功能手册、开发指南、组件参考、部署运维、版本与参与。结构参考[Vben](https://doc.vben.pro/guide/introduction/vben.html)的分层、[Pure](https://github.com/pure-admin/pure-admin-doc)的新手路径、[JeecgBoot](https://help.jeecg.com/)的产品/开发分类以及[芋道](https://doc.iocoder.cn/)的全栈步骤；正文/字段/代码来自本项目，不复制第三方文章，不用Star数证明质量。

每页需有用途、适用身份/前置、操作或调用方式、正常结果、常见失败/恢复及实际源码依据。API/组件参考要写真实字段/Props/参数/事件/返回示例和权限/租户条件；仅有标题、任务编号或“待补充”不算完成。

## 单页更新

1. 确认负责章节与稳定URL，避免并发覆盖他人的正文。
2. 读取配套应用提交，核对Controller路径、DTO限制/枚举、响应与错误，不以UI路由推导API路径。
3. 用仓库相对源码路径和方法名定位；没有配置自有远端URL时用代码文字，不把本机.java文件链接伪装成公开源码。
4. 示例用自己的替换值、标准本机开发端口或示例域名，不写个人绝对路径、专属QA库/端口或真实provider凭据。
5. 链接到同一站点对应章节，锚点与当前标题一致；不要手写已经改名的锚点。
6. 区分已实现、未配置供应商、未验证外部链路和待建设能力，注明版本。

示例：在API页引用实际 `/system/businessConfig/oss`，在操作页引用UI入口 `/system/business-config`，二者不能混称一个地址。低代码冲突当前不是保证HTTP409；本人通知分页是items，其他Page可能records，文档要保留这种实际差异。

## 本地检查与完整构建

```bash
pnpm install --frozen-lockfile
pnpm docs:check
pnpm --filter @xinghui/docs build
pnpm --filter @xinghui/docs preview
```

从前端根目录执行。完整检查必须拒绝缺章、死链、无效锚点；独立章节分支只有部分正文时，记录缺章结果并等待组合，不创建空白页让检查通过。站点由稳定VitePress1.6.4生成，默认base=/docs/，输出`apps/docs/.vitepress/dist`。

### 项目 Pages 路径检查

当前入口为[文档中心](https://admin.hui7.fun/docs/)与[星辉后台](https://admin.hui7.fun/)，服务器首次验收进行中。GitHub Pages 已停止后续演示发布，旧站保留为历史快照；下述项目子路径检查作为历史布局与路径兼容性参考，当前服务器文档使用 `/docs/`。实际发布结果按 Actions、HTTP 和业务验收记录确认。

项目子路径构建使用 `DOCS_BASE=/xinghui-admin-vue3/docs/`。同一个值贯穿内容检查、test、build、preview；PowerShell/Bash完整步骤见[Pages部署](../operations/deployment.md#github-pages)。不要修改默认 `/docs/` 来服务单次发布，也不要把base设置成域名或缺少docs段的仓库根。

维护路径配置时，使用 `.vitepress/base.mjs` 的受控解析；favicon head必须使用完整base，导航、logo、面包屑及404首页遵循VitePress的base处理，不重复拼接前缀。普通Markdown链接使用站内章节路径，手写HTML则必须验证最终地址。对 `.vitepress/` 和 scripts 的修改至少运行既有文档/搜索自测及base测试；标准build仍要求54页，不能以关闭Vue检查、死链检查或改partial模式解决发布错误。

`scripts/base-path-self-test.mjs` 用临时静态fixture验证默认/项目base、必需深页、favicon、惰性搜索资源和错误前缀/源码映射拒绝；这些是门禁单测，不能代替完整VitePress产物与浏览器交互验收。公开发布只有审核过的静态演示和手册，不因此公开应用源码、历史或内部交付材料。

浏览器验收至少包含：首页/分类、深页刷新、中文“字典管理”、英文“CONFIG_MASTER_KEY”搜索、无结果/关闭检索、代码复制、明暗与移动导航、帮助/版本入口和404。仅Markdown静态检查不能声称这些浏览器交互通过。

## 示例与来源检查

JSON必须可解析；YAML不能重复根节点或把秘密写进前端；PowerShell/Bash命令说明执行目录、变量替换、成功/非零退出码。源代码签名摘要不是独立可编译SDK，标明上下文；可执行片段应按本项目现有类型/接口验证。

版本更新后检查旧命令和字段，历史迁移保留说明但不能继续推荐过期默认。文档-only任务不为验证文章创建新应用脚手架、开供应商请求或修改业务schema。

## 提交与交接

提交页清单、准确SHA、源码核对范围、实际检查结果和未验证项。公开正文不能带TASK_BOARD、私有审计材料、QA日志、DPAPI、认证状态或临时测试账号；截图先脱敏。原始验收证据留在受控交接记录，手册只展示可供读者核查的能力与方法。

维护完成的标准是读者能按配套源码执行并理解失败恢复，且组合后的导航/检索/锚点可用。配置、包/锁文件、检查脚本和应用入口有明确负责人，不以改正文为由顺手调整业务实现。

## 源码依据

完整文档组合的`apps/docs/package.json`、`apps/docs/.vitepress/`、根`package.json`的`docs:check`命令，以及正文目录`apps/docs/content/`。应用事实分别核对后端`system-admin/src/main/java/com/xinghuiTec/controller/`与前端`apps/web-ele/src/api/`；这些位置不由文档任务新增一份重复实现。
