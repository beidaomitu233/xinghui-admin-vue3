# 请求、响应与页面状态

适用于API适配和页面交互开发。前置是已经确定Controller路径、真实响应形状及权限，不另造一套客户端认证SDK。

## requestClient契约

`apps/web-ele/src/api/request.ts`默认baseURL来自应用配置，生产约定同源/api。请求头Authorization放当前原始token，不自行加Bearer前缀；Accept-Language来自当前locale。成功业务码是200，默认解包data；处理器按msg/message/error显示错误。

认证失败交给统一expireSession。当前未启用令牌刷新，不能把刷新失败兜底写成偷偷重新登录。下载Blob明确 `responseType:'blob', responseReturn:'body'`；上传通过upload方法，不能套普通JSON body。

```ts
import { requestClient } from '#/api/request';

type ResultPage<Row> = { records: Row[]; total: number | string };
export function loadPage<Row>(path: string, pageNum: number) {
  // path只由可信业务API常量决定，不来自用户输入的任意URL。
  return requestClient.get<ResultPage<Row>>(path, {
    params: { pageNum, pageSize: 10 },
  });
}
```

## 状态设计

读取用loading/error/empty分离，筛选从第一页开始；快速切换时只采纳最新响应。需要取消网络应单独实现，不能把requestId误称为网络中止。编辑先prepare再打开，对象原地更新以保留DOM绑定，saving期间禁止重复提交和关闭。

保存成功后刷新失败是两阶段结果：不要再次新增；保存失败保持输入，版本冲突提供重新读取和人工合并。只有接口定义revision时提交它，资讯等没有该字段的API不套用AI/低代码格式。

## 错误与安全边界

HTTP状态和业务码都需要检查；模型测试可能外层200、内层outcome为RATE_LIMITED/httpStatus429。未授权不是空列表；供应方失败不是通用网络成功。日志只记动作与安全ID，不能记录token、密钥、完整上传数据、渲染提示词或用户表格。

## 源码依据

`apps/web-ele/src/api/request.ts`、`store/auth.ts`、`composables/use-paged-list.ts`、`composables/use-entity-dialog.ts`；后端响应约定见[接口约定](/reference/api-conventions)。
