# 优先复用Vben原生组件

新增和改造管理页默认使用本项目已有的Vben + Element Plus适配。顺序是：Vben现成组件 → 现有Element Plus组件 → 原组件props/slots小范围适配 → 确有业务特殊性时的专用交互。不要再为普通列表自制页头、表格、分页、弹层、按钮组或加载动画。

2026-10-24正在分范围迁移现存页面；本页是当前开发选型，不表示全部旧页面已验收。采用仓库实际版本，不能直接复制最新上游示例中的antdv-next依赖或不同类型定义。

## 按需求选择

| 需求 | 首选入口 | 业务需要处理 |
| --- | --- | --- |
| 页面标题/描述/操作 | `@vben/common-ui`的Page，title/description/extra | 简短业务标题；不叠AdminPageHeader或全局间距覆盖 |
| 查询/编辑表单 | `#/adapter/form`的useVbenForm | 字段、类型、校验、字典与提交 |
| 数据列表/分页/排序 | `#/adapter/vxe-table`的useVbenVxeGrid | 真实代理、允许排序列、权限、返回字段映射 |
| 新增/详情/编辑弹层 | `@vben/common-ui`的useVbenModal/useVbenDrawer | 取详情、保存、只读、失败保留及未保存确认 |
| 按钮组 | VbenButtonGroup/VbenCheckButtonGroup | 选项、值和业务事件，不再手写组选中样式 |
| 加载/空态/提示 | Vben Loading/指令、Grid/Modal原生状态，Element Alert/Skeleton等 | 区分失败与空数据，提示短且可关闭 |
| 顶部通知 | `@vben/layouts`现有Notification | 本人请求、已读、实际能力开关与安全目标 |
| 业务字典 | useDictionary + 已有表单Select/ApiSelect | 启用选项与历史标签分开读取 |
| 可视化设计 | 固定Vue3/Element Plus版form-create，设计时懒加载 | 与本项目七类型Schema往返，保留历史版本 |
| 文件上传 | 原生Upload + `#/api/system/file` | 真实鉴权上传、状态/失败、授权下载 |

## 推荐页面结构

原生Page标题区 → 必要的Vben查询表单（可折叠） → Grid原生工具栏/表格/分页。新增和批量操作放toolbar插槽，不在Grid外再包多层卡片。对话、提示词编辑器等按业务保留工作区，不强迫改成CRUD列表。

表头升/降/恢复默认替代单独的排序筛选器。真实分页必须由后端全量排序再分页，不能只重排当前页。API白名单、稳定ID、租户范围与Long ID处理见[表格](/components/paged-list)。

## 旧实现迁移

usePagedList/useEntityDialog/PageHint及AdminPageHeader是旧业务实现，保留引用时用于兼容和排查，不作为新页的默认架构。逐页迁入原生组件，确认无运行引用后再清理；不能为保住旧测试把自制壳换个名字。

原生组件不能替代后端鉴权；权限、租户、revision、输入保留等仍属于业务。确实缺少props/slots时，先对已有组件做兼容扩展并测试默认行为，不复制整套UI。通知组件扩展必须隐藏无后端支持的删除，不能让未经校验的链接自动跳转。

## 本地源码与官方参考

入口为`apps/web-ele/src/adapter/`，原生实现位于`packages/@core/ui-kit/`、`packages/effects/common-ui/`、`packages/effects/plugins/`和`packages/effects/layouts/`。用户管理原生样板见`views/system/user/index.vue`和`user-modal.vue`，实际源码/验证状态以当前分支为准。

参考[Vben Page](https://doc.vben.pro/components/layout-ui/page.html)、[VxeGrid](https://doc.vben.pro/components/common-ui/vben-vxe-table.html)、[Modal](https://doc.vben.pro/components/common-ui/vben-modal.html)。
