# 权限操作

动作按业务命名，例如 `orders:refund:approve`，页面按钮和后端接口共用同一个码。

```ts
const access = useAccessStore();
const canApprove = computed(() =>
  access.accessCodes.includes('orders:refund:approve'),
);
```

后端在 Controller 或业务服务使用 `@PreAuthorize`。页面内多个功能可在菜单中用 G 模块分类，角色编辑按分类授权。
