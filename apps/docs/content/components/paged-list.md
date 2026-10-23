# 原生VxeGrid：分页、查询与排序

管理列表默认用`#/adapter/vxe-table`的useVbenVxeGrid，直接接Vben Form、原生工具栏、分页与列排序。无需另行维护ElTable + ElPagination + 通用列表状态壳。

## 本仓库的类型与结构

`useVbenVxeGrid<Row>`接收`gridOptions`、`formOptions`、`gridEvents`等外层配置，返回`[Grid, gridApi]`。`VxeTableGridOptions<Row>`表示裸表格选项；本仓库`VxeGridProps`是外层结构，不能照最新上游示例误套类型。

- 列配置用field/title；真正可排序的列设置sortable。
- 查询用formOptions；本地适配已关闭VXE自身formConfig。
- 代理用gridOptions.proxyConfig.ajax.query，参数含page/sort，第二参数是最近提交的查询表单。
- 远程排序配置proxyConfig.sort与sortConfig.remote；列头事件和分页由原生Grid处理。
- 工具栏使用toolbar-actions/toolbar-tools；不要再做一套外部刷新、分页或列设置。

## 响应与排序

适配默认取items/total，旧接口records/total在API或query边界显式转换。total须为非负安全整数，Long ID继续保持字符串，不能与计数一起Number化。

分页接口沿用pageNum/pageSize、可选orderBy和order（asc/desc）。后端对每个资源使用固定允许列映射，先过滤和排序再分页，相同值以稳定ID排序。客户端传入字段不能直接拼SQL；隐藏按钮不能替代权限/租户检查。

有界完整返回的数据可本地排序；树表只排序同级。数据预览的复杂JSON、数组或精确数值无法正确比较时，不显示假排序能力。动态表单字段需由发布Schema/类型决定允许列。

## 查询、重置与当前版本差异

当前安装版本的 `reload` 会调用 `clearAll` 清除排序。搜索回第一页且保序时，应更新最近提交表单、调用原生 `setCurrentPage(1)` 后 `query`；只有重置操作才清空表单和排序并恢复默认。

VXE 4.17.46 的工具栏刷新默认也是 `reload`。需要保留当前页和排序时，显式配置 `toolbarConfig: { refresh: { code: 'query' } }`，或在已有适配层通过 `vxeUI.setConfig({ toolbar: { refresh: { code: 'query' } } })` 设置原生默认值。不能把 `refresh: true` 本身当作保序保证。

loading中的新proxy查询可能被忽略；正式页面应结合当前原生状态和已提交条件处理，避免表头/分页变了但数据仍来自旧查询。用户管理样板对此有定向回归，参见`apps/web-ele/src/views/system/user/index.vue`。不要把这个版本限制改写为另一套通用请求调度框架。

失败显示原生错误/重试，不能伪装空列表；保存成功但刷新失败应分别提示，不能因此重做新增。查询、翻页、排序、刷新、快速操作及无权限都需实际验证，单测不能替代真正多页排序。

## 旧usePagedList

旧源码`apps/web-ele/src/composables/use-paged-list.ts`仍可能被兼容页面引用，负责records/total、请求代次和分页状态。它不渲染组件，也不鉴权。迁移期间保留其历史接口及测试用于排查，不推荐新增页面继续自行拼表格和分页。原API字段与错误合同不能因换组件改变。
