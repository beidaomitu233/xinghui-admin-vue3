# 质量门槛

本页面向维护者和发布验收人员。目标是证明测试确实运行、产物对应正确代码、必需依赖真实success；空用例、跳过、失败或缺失报告不产生绿灯。前提是使用隔离服务和中性夹具，不能将这些fixture密钥用于生产。

## 后端必需测试与产物

`scripts/quality/required-tests.txt`定义当前必需测试类，包含AI数据引用、会话、配置和权限回归。以候选提交的清单及实际报告计算数量，不沿用旧版本的测试总数。执行全部模块package并验证报告及Boot结构：

::: code-group

```powershell [PowerShell 7]
$env:JWT_SECRET='oss04_ci_neutral_jwt_fixture_32_characters'
$env:CONFIG_MASTER_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
$requiredTests=(Get-Content scripts/quality/required-tests.txt) -join ','
mvn -B -ntp clean package "-Dtest=$requiredTests" '-Dsurefire.failIfNoSpecifiedTests=false'
if ($LASTEXITCODE -ne 0) { throw '必需测试或构建失败' }
./scripts/quality/Verify-Build.ps1
./scripts/quality/Test-ReportGate.ps1
```

```bash [Bash]
set -e
export JWT_SECRET='oss04_ci_neutral_jwt_fixture_32_characters'
export CONFIG_MASTER_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
required_tests="$(paste -sd, scripts/quality/required-tests.txt)"
mvn -B -ntp clean package "-Dtest=${required_tests}" -Dsurefire.failIfNoSpecifiedTests=false
# 必须先确认上一步exit0，再在安装了PowerShell 7的机器执行报告门槛。
pwsh -NoProfile -File scripts/quality/Verify-Build.ps1
pwsh -NoProfile -File scripts/quality/Test-ReportGate.ps1
```

:::

`failIfNoSpecifiedTests=false`允许不含选定类的依赖模块继续构建，但后续门槛会要求每个必需类恰有一份非空、零失败/错误/跳过的报告，不能省略。可执行包还需包含BOOT-INF/classes和JarLauncher。

Windows默认启用`windows-test-agent`测试配置，预加载Spring Boot所管理版本的Byte Buddy agent，避免Mockito动态附加被系统拒绝后停滞。它只影响测试JVM，保留原用例和断言；`-DargLine`仍可设置测试内存等参数。Linux使用原有测试启动方式。

`Test-ReportGate`在临时目录证明正常fixture exit0，missing/zero/failed/error/skipped/duplicate exit1。最后故意失败子进程的exit1是受控证据，脚本完成状态不能靠单独读取残留LASTEXITCODE误判；实际失败断言会抛错并中断。

## 隔离服务与兼容矩阵

后端CI声明MySQL5.7/8.0、Redis、MinIO独立服务与中性fixture，执行 `ReleaseServicesIT`。用例必须空schema开始，核对账号/端口/版本/location，验证迁移、严格重启校验、真实认证/权限、加密配置、低代码CRUD/revision和对象往返，最后只清理自有夹具。

服务门槛同时要求`AiConfigurationDruidMySqlIT`与`AiSceneSqlDruidMySqlIT`，后者通过真实Druid、Connector/J与MySQL核对查询、租户/个人政策、精确数值、保存重读、外层读写事务隔离和同一连接恢复。实际数据库拒绝写入须验证MySQL错误码，不能用AST拒绝或JDBC客户端只读错误冒充数据库证据。关闭只读传播必须失败；不得关闭Wall或跳过不通过的用例。

本机服务测试有**精确分配的schema allowlist**，不能将任意已有库改名或绕过0表门槛运行。教程不公开本机测试库/端口；如需本地服务验证，先由负责人分配隔离实例与schema，再按现有用例的精确防护流程执行。CI绝不读取本机私有秘密文件。

需要证明MySQL兼容时，候选提交的两个矩阵版本都必须实际成功，并记录对应Actions结果。本地单一MySQL版本的迁移或数据检查不能代替完整矩阵；已发布版本的旧结果也不能代替新候选验收。

## 前端测试、类型、lint和生产

从前端根目录运行；root、应用和两份认证mjs使用各自严格JSON报告，不用应用子集冒充全量root：

```bash
set -e
pnpm install --frozen-lockfile
mkdir -p .quality
pnpm exec vitest run --dom --maxWorkers=2 \
  --exclude '**/session-info.test.mjs' --exclude '**/captcha-state.test.mjs' \
  --reporter=default --reporter=json --outputFile=.quality/root.json
node scripts/verify-app-tests.mjs --root
pnpm --filter @vben/web-ele test --maxWorkers=2 \
  --reporter=default --reporter=json --outputFile=../../.quality/web-ele.json
node scripts/verify-app-tests.mjs
pnpm exec vitest run --dom \
  apps/web-ele/src/api/core/session-info.test.mjs \
  apps/web-ele/src/views/_core/authentication/captcha-state.test.mjs \
  --reporter=default --reporter=json --outputFile=.quality/auth.json
node scripts/verify-app-tests.mjs --auth
node scripts/verify-app-tests.mjs --self-test
node scripts/check-mock-secrets.mjs
pnpm check:type --force
pnpm lint
node scripts/build-quality.mjs
```

逐条要求exit0；这些多行是Bash命令，在PowerShell中可写成单行参数或用反引号换行，`.quality`用 `New-Item -ItemType Directory -Force .quality` 创建。`menu-cleanup`至少4项、`workspace-theme`至少5项为必需suite，缩减数量也被受控失败测试拒绝。

生产构建采用单任务和默认2GiB，实际执行生成runtime JS检查同源/api。Vite可能重写已跟踪的 `components.d.ts` 格式；本地连续测试/构建后，可对这个生成声明恢复既定Prettier格式再运行lint。格式化声明不是修改生成dist来假装产物通过。

## 汇总、文档与交付证据

`check-needs.mjs`要求每个必需job确实success，failure/cancelled/skipped/missing均拒绝。自检为：

```bash
# 后端
node scripts/quality/check-needs.mjs --self-test
# 前端
node scripts/check-needs.mjs --self-test
pnpm docs:check
pnpm --filter @xinghui/docs build
```

文档完整性检查需要所有正文及锚点；单独章节分支必须声明缺章。报告/产物以准确提交和摘要对应，原始私有日志留本地或受控CI，不发布JWT、转储或真实请求全文。Docker、远端Actions、required checks、独立机器没有运行就写未验证；本地成功不替代正式合入/发行关口。

## 当前验证及源码

应用候选已实测：后端169+1项；前端root69文件/409项、app34文件/118项、auth2文件/4项，零失败/跳过；实际类型、完整lint、生产11/11通过。lint保留34个warning，未关闭规则；结果属于[版本页](../releases/versions.md)的提交，不自动转移到后续文档/应用改动。

源码：两端`.github/workflows/ci.yml`、后端`scripts/quality/`与`ReleaseServicesIT`；前端`scripts/{verify-app-tests,check-mock-secrets,check-needs,build-quality}.mjs`。文档检查/构建由`apps/docs`及文档CI维护，不由本页另建一套工具。
