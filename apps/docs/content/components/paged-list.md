# usePagedList：分页列表

适用于响应为records/total的后台列表。它是组合式状态工具，不渲染表格，也不负责权限或租户过滤。使用前确认API查询支持pageNum/pageSize及受控排序。

## 参数与返回

| options    | 类型/默认                                         |
| ---------- | ------------------------------------------------- |
| `fetch`    | `(Filters & PageQuery) => Promise<PageData<Row>>` |
| `filters`  | 当前过滤对象，可传reactive对象                    |
| `orderBy`  | 固定服务端支持的排序字段，不接收任意SQL           |
| `pageSize` | 可选，默认10                                      |

PageQuery包含pageNum、pageSize、orderBy、order（asc/desc）。PageData包含records和number或string类型total；parsePage仅接受非负安全整数total及数组records，空字符串total拒绝。

返回refs：records、total、loading、error、pageNum、pageSize、order。返回动作：load、search、reset(callback)、setSort、setPage、setPageSize、reloadAfterDelete。search和setPageSize重置第一页；删除末页最后一批时reloadAfterDelete可回退一页。

```ts
import { reactive } from 'vue';
import type { UserInfo } from '#/api/system/user';
import { getUserList } from '#/api/system/user';
import { usePagedList } from '#/composables/use-paged-list';

const filters = reactive({ username: '' });
const list = usePagedList<UserInfo, typeof filters>({
  filters,
  orderBy: 'createTime',
  fetch: (query) => getUserList({ ...query }),
});
const { records, loading, error, total, pageNum, pageSize } = list;
// 在setup生命周期中调用list.load()，将顶级refs绑定表格/分页。
void [records, loading, error, total, pageNum, pageSize];
```

## 失败与并发语义

较旧请求晚返回不会覆盖最新结果；失败清空records/total并设置“列表加载失败，请重试”，load返回false。它没有中止网络请求，也没有卸载取消方法，页面不得声称具备AbortController能力。绑定分页事件至setPage/setPageSize，排序事件使用ascending/descending/null，由setSort转换。

如果接口返回items，先在fetch中转换 `{ records: result.items, total: result.total }`。不要把错误响应强制转成成功PageData；本人通知的items需要这个适配。正常结果应在筛选、翻页、重试后保持最新查询对应的数据。

## 源码依据

`apps/web-ele/src/composables/use-paged-list.ts`（`PageQuery`、`parsePage`、`usePagedList`）；行为覆盖在相邻 `use-paged-list.test.ts`。API参考 `apps/web-ele/src/api/system/user.ts`。
