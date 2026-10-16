# useEntityDialog：编辑与只读详情

该工具统一新增、编辑和查看的状态，并保留失败输入。适用于有明确prepare/save边界的实体页面；调用方负责真实API、字段校验、权限和ElDialog/ElDrawer模板绑定。

## options契约

| 参数                        | 要求                                          |
| --------------------------- | --------------------------------------------- |
| `empty()`                   | 返回新的普通Form对象，不共享可变默认值        |
| `allowed(mode)`             | 检查create/edit/view对应动作                  |
| `prepare(mode,id?)`         | 返回 `Promise<Form>`，编辑/详情必须读真实记录 |
| `save(mode,value)`          | 只接收create/edit，返回Promise                |
| `validate()`                | `Promise<boolean>`，由实际表单校验决定        |
| `onSaved()`                 | 保存后刷新列表，可异步                        |
| `parseError(message,error)` | 可选，返回message及fieldErrors                |

```ts
import type { EntityDialogMode } from '#/composables/use-entity-dialog';
import { useEntityDialog } from '#/composables/use-entity-dialog';

type TitleForm = { title: string };
type Dependencies = {
  allowed: (mode: EntityDialogMode) => boolean;
  prepare: (mode: EntityDialogMode, id?: string) => Promise<TitleForm>;
  save: (mode: 'create' | 'edit', form: TitleForm) => Promise<unknown>;
  validate: () => Promise<boolean>;
  onSaved: () => Promise<unknown>;
};
export function createTitleDialog(deps: Dependencies) {
  return useEntityDialog<TitleForm>({
    ...deps,
    empty: () => ({ title: '' }),
  });
}
```

示例把业务行为显式交给调用者，没有假造一个已成功保存的API。

## 返回与模板绑定

返回form（reactive）、visible/mode/loading/saving/submitError（refs）、fieldErrors（reactive）、dirty（computed），以及open、submit、reset、requestClose、beforeClose、clearFieldError。必须绑定 **同一个form对象**；工具会原地替换属性以保留DOM绑定，不另造一个脱离状态的表单副本。

`open('view',id)`只读；submit在view态、未打开、saving或无权限时返回false。prepare成功才显示弹窗。beforeClose可接到Element Plus关闭回调；dirty时确认放弃，loading/saving时拒绝关闭。reset恢复打开时基线，不是重新读取服务器。

## 正常结果与失败恢复

保存成功关闭弹窗、更新基线并调用onSaved；列表刷新失败单独提示“保存成功，列表刷新失败”。保存失败保持visible与输入，显示submitError/fieldErrors；重复提交被saving拦截。加载失败不开弹窗，允许重新open。不要在finally无条件关闭弹窗，也不要把刷新失败当作可以重做新增。

## 源码依据

`apps/web-ele/src/composables/use-entity-dialog.ts`及 `use-entity-dialog.test.ts`。其内部使用 `structuredClone`、`toRaw`和Element Plus消息/确认；这是本地工具，不是上游Modal API。
