# 定时任务与执行日志

入口为 **运行维护 → 定时任务**及任务日志页面。平台身份和 `monitor:job:*` / `monitor:jobLog:*` 控制管理与日志动作。任务只能选择服务端显式注册的handler，不能输入Java类名、Bean表达式或任意调用目标。

## 新建与运行

1. 读取处理器列表，选择handlerKey。首次检查可用无业务副作用的 `system.noop`，参数只能是 `{}`。
2. 填写任务名、组、cronExpression、timeZone、handlerParams、misfirePolicy及concurrent；时区是明确的区域名称。
3. `misfirePolicy`只接受2（补执行一次）或3（跳过）；`status`0启用、1暂停；concurrent按界面0/1选项提交。
4. 保存后查看nextFireTime。编辑现有任务不同时修改status，启停走独立状态接口。
5. “执行一次”返回持久化fireId；查看执行记录直到结果完成，不能把返回ID当作成功完成。

## 执行记录

fire状态为 `CLAIMED/SUCCEEDED/FAILED/SKIPPED/CANCELLED`，触发类型为 `MANUAL/SCHEDULED`。记录含attemptCount、scheduledFireTime、startedAt、completedAt、resultSummary。记录查看、删除与清理有独立日志权限，清理前确认筛选与保留要求。

## 正常结果与恢复

合法启用任务显示下一次触发时间；实际成功以SUCCEEDED记录为准。未知handler、非JSON参数、无效cron/时区或不支持的枚举在保存阶段拒绝。失败时先看安全结果摘要并修正处理器配置；不要直接修改持久化fire状态伪造重试。并发/补偿策略不能作为业务天然幂等的保证；扩展处理器仍需自己的去重约束。

当前是平台调度，不是租户任意脚本执行平台。开发处理器见[调度扩展](/development/scheduler-handler)。

## 源码依据

- 前端：`apps/web-ele/src/api/monitor/job.ts`、`apps/web-ele/src/views/monitor/job/index.vue`、`apps/web-ele/src/views/monitor/jobLog/index.vue`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/quartz/controller/SysJobController.java`、`quartz/controller/SysJobLogController.java`、`quartz/handler/JobHandlerRegistry.java`（均从同一Java源码根定位）。
