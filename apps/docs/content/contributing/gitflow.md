# 双仓 GitFlow

本页面向贡献者与维护者。应用分为两个Git仓库，前后端提交必须配对，但不是一个提交同时改变两个仓库。前提是取得正确仓库访问权，确认上游归属与自己的remote，不能把Vben上游地址当成本项目发布目标。

## 分支与配对

后端开发集成约定为`dev`，前端为`develop`；稳定主线按仓库实际配置（master/main）使用。功能/修复使用`feature/*`、`fix/*`，发布准备用`release/*`，紧急修复用`hotfix/*`。已存在的用户功能分支保留，不因新任务reset或覆盖。

当前CI事件：后端PR目标master/dev、push含feature/fix/release/hotfix；前端PR目标main/master/develop、push含同类工作分支。事件配置不表示远端已运行或主线已开启required checks。

```bash
git remote -v
git status --short
git switch -c feature/your-change
```

命令假定已处于自己确认过的起点，不默认切到远端未知分支。需要独立工作树时从明确commit创建自己的feature，避免在共享目录并发修改同一文件。记下两端起始SHA，交付中说明只改了哪一端或为什么另一个端保持基线。

## 提交与串行组合

小范围提交给出目的、变更范围与验证；同一个hunk只由明确负责人写。跨功能冲突逐段读diff保留双方真实语义，不用整文件ours/theirs吞掉权限或路由修复。

```bash
git diff --check
git diff --stat
git add path/to/owned-file
git commit -m "docs: explain verified runtime configuration"
git rev-parse HEAD
```

路径与message替换为实际文件/目的。不要`git add .`把私有日志、密钥或测试产物一并提交；保留失败证据在受控存储，公开PR只给脱敏摘要。README中的提交号应指向已存在代码，不用待生成SHA占位假交付。

## 合入与版本准备

提交review说明包含两端SHA、页面/API/迁移范围、实际测试、产物摘要和未运行关口。每个必需CI job必须真实success，取消/跳过/缺失均不算成功；只有本地通过时明确写本地，不能由维护者说明代替远端Actions。

两仓按集成窗口串行组合，再对最终代码运行相关门槛。不得并发跑多个资源密集生产build，或在build期间继续改源码后用旧产物交付。正式合主线/推送/Tag/互联网发布由项目实际授权流程执行；文档正文更新本身不授权公开历史。

## 失败与源码依据

冲突不确定时由文件负责人和集成负责人协调；测试失败先保留实际输出、完成最小行为修复，不通过关规则/删断言/skip用例放行。旧源码/产物/报告不属于新候选。

依据：两端`.github/workflows/ci.yml`、后端`scripts/quality/check-needs.mjs`与前端`scripts/check-needs.mjs`，版本说明见[版本组合](../releases/versions.md)，实际门槛见[质量验证](../operations/quality-gates.md)。
