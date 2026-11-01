# 路由与权限

## 页面入口

前端页面放在 `apps/web-ele/src/views`，接口放在 `src/api`。在菜单管理新建 C 页面，填写路由、组件路径和查询权限，再为角色授权。

## 业务动作

一个页面可以包含多个 G 模块，每个模块下添加任意 F 动作。

```java
@PreAuthorize("hasAuthority('orders:refund:approve')")
@PostMapping("/{id}/approve")
public Result<?> approve(@PathVariable Long id) { ... }
```

前端使用同一个权限码控制动作显示，后端校验执行权限。Agent 工具继续调用该服务，不另建一套授权。

分组示例见 [角色权限](../features/authorization.md)。
