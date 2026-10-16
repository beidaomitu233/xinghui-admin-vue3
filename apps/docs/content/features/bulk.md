# 用户导入与导出

入口仍是 **系统管理 → 用户管理** 的导入模板、导入和导出按钮。本能力面向受控的用户表格，不是任意实体批量导入框架。

## 身份与文件准备

模板和导出使用 `system:user:list`，导入使用 `system:user:add`。角色标识须是当前允许分配的既有角色；开启租户时，不通过文件指定任意tenant或超级管理员归属。

下载当前版本模板，保持五个表头及顺序：**用户账号、用户昵称、邮箱、手机号码、角色标识**。最多1000数据行。使用中性验证数据或已授权的真实数据；不上传密码列、私有密钥或其他业务表。

## 操作步骤

1. 从页面下载模板，填写字段，不重命名或插入额外表头。
2. 先核对重复账号、手机、角色与当前租户范围，再选择文件导入。
3. 等待完整响应；导入请求超时配置为120秒，不在等待时反复点击。
4. 按响应行号修正失败行，而不是整份无条件重导。导入新账号当前为“待激活”的禁用状态，系统生成随机密码且不回显；检查角色后，由授权管理员重置并安全交付一次性密码，再编辑启用，不能假定导入后即可登录。
5. 导出使用当前查询筛选，下载返回Blob；不要假定只导出当前分页选中项。

## 结果契约与恢复

`POST /system/user/import` 的 multipart字段名为 `file`。响应包含 `totalRows/successCount/failureCount/skippedCount/rows`；每行包含工作表 `rowNumber`、`status`（success/failed/skipped）、`field`和`reason`。成功HTTP或业务码不等于所有行都成功，必须读汇总与逐行结果。

表头或行数错误先重新按模板生成；业务字段错误按field/reason修改。重复提交还受到限流和防重复提交约束，等待提示后再试。导入有部分成功时先核对列表，避免制造重复账号。原始表格和导出文件包含用户资料，按组织的文件访问规则保存与清理。

## 源码依据

- API：`apps/web-ele/src/api/system/user.ts`（`UserImportSummary`、`importUsers`、`exportUsers`）。
- Controller：`system-admin/src/main/java/com/xinghuiTec/controller/SysUserController.java`（`importUsers`、`downloadTemplate`）。
- 解析：`system-admin/src/main/java/com/xinghuiTec/listener/SysUserImportListener.java`（`REQUIRED_HEADERS`、`MAX_IMPORT_ROWS`）。
- 业务接口：`system-admin/src/main/java/com/xinghuiTec/service/SysUserService.java`。
