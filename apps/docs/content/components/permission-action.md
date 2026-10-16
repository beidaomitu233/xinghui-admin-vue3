# 动作权限与确认

适用于新增、编辑、删除、执行一次等按钮。菜单可见、按钮可见和API可调用是不同层次；前端工具只改善交互，后端精确权限、平台身份、租户/资源检查仍是最终边界。

## 当前读取方式

`useAccess().hasAccessByCodes([...])`用于访问码检查；现存页面也通过 `useAccessStore().accessCodes.includes(code)`判断单个权限。使用服务端发回的当前accessCodes，不在浏览器根据角色名自行推导超级权限。会话失效或换用户后需要走统一会话恢复/清理。

hasAccessByCodes对数组执行交集判断，**命中任意一项即true**，不是全部满足。若页面动作确实要求两个权限，分别检查再用逻辑与组合；最终仍以Controller表达式为准。

## 确认工具

`useConfirmedAction()`返回busy和run。run参数为allowed、message、action（Promise）、successMessage、可选onSuccess（可异步）。取消、忙碌、无权限、请求失败时返回false；完成action及onSuccess才返回true。

```ts
import { useAccess } from '@vben/access';
import { removeNews } from '#/api/system/news';
import { useConfirmedAction } from '#/composables/use-confirmed-action';

const { hasAccessByCodes } = useAccess();
const confirmation = useConfirmedAction();
export function confirmRemove(id: string, reload: () => Promise<unknown>) {
  return confirmation.run({
    allowed: hasAccessByCodes(['system:news:remove']),
    message: '确认删除这条资讯？',
    action: () => removeNews(id),
    successMessage: '删除成功',
    onSuccess: reload,
  });
}
```

## 失败语义

该工具的catch同时覆盖action与onSuccess：列表刷新失败也会返回false并提示“操作失败”，不应据此无条件重复删除。恢复时先重读服务端状态。确认框不会授予权限；allowed为true而API拒绝时检查服务端身份/动作，不改变按钮判断来绕过。

正常页面应禁用busy动作，确认文案说明具体影响，不打印用户完整数据或密钥。没有查询权限时不能靠“详情”按钮调用另一个无鉴权接口。

## 源码依据

`apps/web-ele/src/composables/use-confirmed-action.ts`、相邻测试；`apps/web-ele/src/api/request.ts`；访问工具在 `packages/effects/access/src/use-access.ts`。业务真实动作以Controller的 `@PreAuthorize`为准。
