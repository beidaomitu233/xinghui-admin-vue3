# 原生表单、编辑弹窗与详情

实体新增/编辑/只读详情默认采用`useVbenForm`和`useVbenModal`/`useVbenDrawer`。直接使用现有容器和状态API，保留字段与业务校验，不再制作通用弹窗壳。

## 打开与取数

父页使用connectedComponent获得同一组件/API，`modalApi.setData({mode,id}).open()`；子组件在onOpenChange内getData，按操作权限加载真实详情。详情加载使用setState({loading:true})，准备成功才允许保存。关闭后迟到回包不能覆盖下次打开。

权限是逐动作检查。可选下拉项的查询权限不能变成整个实体详情/编辑的新前提：例如没有角色列表权，仍可查看/编辑获授权的用户普通字段；角色选择不可用时必须保留原角色，不能在payload中误清空。

## 校验与保存

字段Schema经`#/adapter/form`注册的组件映射；规则使用z或已注册规则，不直接套Element FormRules。`formApi.validate()`返回包含valid的对象。校验通过后getValues，组合明确的业务payload，server-owned字段由服务端决定。

保存期间使用modalApi.lock()/unlock()或Drawer对应API。成功后关闭并通知父页query；失败保留输入、显示短且可关闭的错误和字段提示，finally解锁，不无条件关闭。详情态隐藏确认按钮并禁用编辑；未保存关闭通过onBeforeClose与成熟确认组件处理，不另建关闭状态机。

resetForm清理状态，setValues恢复打开基线；这与重新读取服务器不同。重复提交、资源不存在、revision冲突、刷新失败、可选依赖失败及无权限必须区分处理。

## 当前接口

- useVbenModal/useVbenDrawer：来自`@vben/common-ui`，返回组件与api；setData/getData/open/close/setState、onOpenChange/onConfirm/onBeforeClose。
- useVbenForm/z：来自`#/adapter/form`；setValues/getValues/resetForm/updateSchema/validate等。
- 原生用户示例：`apps/web-ele/src/views/system/user/user-modal.vue`，包括角色权限和失败输入保留；采用当前分支实际版本。

## 旧useEntityDialog

旧`apps/web-ele/src/composables/use-entity-dialog.ts`是历史业务状态工具，并非Vben API。已有调用可在迁移时参考其失败/未保存语义，但新页不要继续用它拼装ElDialog/ElDrawer模板，也不要再建同类通用工具。涉及历史对外类型时按真实引用清理，不能删文件后靠放宽测试掩盖引用错误。
