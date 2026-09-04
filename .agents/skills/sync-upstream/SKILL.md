---
name: sync-upstream
description: 同步上游 Wei-Shaw/sub2api 的最新代码到本 fork（origin anstgh4688-dev/sub2api），采用 main 纯镜像 + custom 定制分支 rebase 的模型，并处理迁移编号冲突。Use when 用户要求同步上游、更新到最新版本、合并官方仓库、跟随 upstream、解决 fork 落后、rebase 定制分支，或提到升级 sub2api 版本。
---

# Sync Upstream

本 fork 的定制代码和上游代码用**分支隔离**，升级时 rebase 而不是 merge。

## 分支模型（先读这一段，否则后面的命令都不成立）

| 分支 | 内容 | 规则 |
|---|---|---|
| `main` | **上游的纯镜像**，一个自己的提交都没有 | 只允许 fast-forward，**禁止**在上面写代码 |
| `custom` | 全部 fork 定制，基于 `main` | 日常开发在这里，升级时整体 rebase 到新的 `main` |

为什么这里 rebase 是对的：`custom` 上只有你自己的十几个提交，rebase 重放的是**你的提交**。
过去禁止 rebase，是因为当时定制代码直接压在 `main` 上，`git pull --rebase upstream main` 会去重放**上游那 280 个提交**——那是完全不同的两件事，不要混淆。

首次使用（仓库还没有 `custom` 分支）先跑一次初始化：

```bash
bash .Codex/skills/sync-upstream/scripts/bootstrap.sh
```

它会把当前工作区的未提交定制整理成 `custom` 分支的一个提交，并把 `main` 恢复成干净镜像。跑之前脚本会打印计划并要求确认。

## 同步流程

### 1. 前置检查

```bash
bash .Codex/skills/sync-upstream/scripts/check.sh
```

输出：落后上游多少提交、`custom` 有几个自己的提交、双方都改过的文件（潜在冲突点）、工作区是否干净、迁移编号是否会撞车。

工作区不干净就先 `git commit` 或 `git stash`，**不要**带着未提交改动开始 rebase。

### 2. 迁移编号预检（升级前必做）

```bash
bash .Codex/skills/sync-upstream/scripts/check-migrations.sh
```

见下方「迁移编号规则」。这一步在 rebase 之前做，因为改文件名要产生新提交。

### 3. 推进 main 到上游

```bash
git fetch upstream
git checkout main
git merge --ff-only upstream/main
git push origin main
```

`--ff-only` 是护栏：如果它失败，说明 `main` 上混进了本地提交，分支模型已经破了，先把那些提交 `cherry-pick` 到 `custom` 再重置 `main`，不要用 merge 绕过去。

### 4. Rebase 定制分支

```bash
git checkout custom
git rebase main
```

冲突逐个解决，`git add <file>` 后 `git rebase --continue`。全程想放弃：`git rebase --abort`。

`rerere` 已开启，同一个冲突第二次出现会自动套用上次的解法——但仍要 `git diff` 确认结果对。

### 5. 冲突处理规则

| 文件 | 策略 |
|---|---|
| `frontend/src/views/HomeView.vue` | 取本地（`git checkout --ours` 在 rebase 中是**上游侧**，实际要用 `--theirs`）。见下方「rebase 中 ours/theirs 是反的」 |
| `frontend/src/i18n/locales/*/landing.ts` | 手动合并：保留本地新增 key（`heroHeadline`/`poolBadge`/`pool`/`steps.code`/`comparison` 等），同时接收上游新增 key |
| `backend/ent/*`（生成代码） | 取上游版本，然后检查 `backend/ent/schema/` 下的本地定制是否需要重跑 `make -C backend generate` |
| `backend/migrations/*.sql` | **永远不要合并已有迁移文件的内容**——已应用的迁移改一个字节就会 checksum 校验失败。冲突只可能是新增文件，各留各的 |
| 其他 backend 业务文件 | 逐个 `git diff` 看双方意图后手动合并，不确定就展示给用户定夺 |

**rebase 中 ours/theirs 是反的**：rebase 时 `--ours` 指的是你正在重放到的基底（= 上游的 `main`），`--theirs` 才是你自己的提交。想保留自己的版本用 `--theirs`。搞不清就直接看文件内容判断，别靠记忆。

### 6. 验证（必做，失败就不要推）

```bash
cd backend && go build ./... && make test-unit
cd ../frontend && pnpm run typecheck
pnpm exec vitest run src/views/__tests__/HomeView.spec.ts src/i18n/__tests__/localesNoKeyCollision.spec.ts
```

`localesNoKeyCollision` 专门抓 i18n 合并事故，rebase 之后必跑。

### 7. 推送

```bash
git push --force-with-lease origin custom
```

`custom` 被 rebase 过，历史重写了，必须强推。用 `--force-with-lease` 而不是 `--force`：如果远端有别人推的新提交它会拒绝，而 `--force` 会直接覆盖掉。

**`main` 永远不强推。**

## 迁移编号规则（fork 最容易踩的坑）

迁移由 `backend/internal/repository/migrations_runner.go` 在启动时自动执行，按**文件名字符串排序**，在 `schema_migrations` 表里按 `filename` 记录 SHA256 checksum。这带来三条硬约束：

1. **已应用的迁移，内容不能改** —— checksum 对不上直接启动失败。
2. **已应用的迁移，文件名不能改** —— 换名字等于一条全新迁移，会被重新执行一遍。
3. 上游随时会占用下一个编号。上游现在到 `184_`，本 fork 的 `185_`~`188_` 会和上游未来的 `185_` 撞上。撞号不会立刻报错（`181_` 上游自己就有两个），但两条同号迁移的执行顺序由描述文字的字母序决定——这不是你能控制的依赖顺序。

**规则：fork 自己的迁移一律用 `9xx` 段**（`900_`、`901_`……）。字符串排序下 `9xx` 永远排在上游的 `1xx`/`2xx` 之后，既不撞号，也保证本地 schema 改动跑在上游之后。

改名的时机窗口很窄：**只能在这条迁移还没被任何环境应用过的时候改**。`check-migrations.sh` 会告诉你哪些能改、哪些已经锁死。已经上过生产的旧编号就留着，别动，只对新增的用 `9xx`。

改名之后，本地开发库会把它当新迁移重跑一遍——所以迁移必须是幂等的（`IF NOT EXISTS` / `UPDATE ... WHERE col IS NULL`）。数据回填类迁移重跑前要人工确认不会重复累加。

## 禁止事项

- **禁止** `git reset --hard upstream/main`（丢掉全部定制）
- **禁止** 在 `main` 上提交任何代码
- **禁止** `git push --force`（用 `--force-with-lease`）
- **禁止** 修改任何已应用过的迁移文件的内容或文件名
- **禁止** 在验证未通过时推送

## 中止与回退

| 场景 | 命令 |
|---|---|
| rebase 中途放弃 | `git rebase --abort` |
| rebase 已完成但想撤销（未推送） | `git reset --hard ORIG_HEAD` |
| rebase 已推送想找回旧版本 | `git reflog` 找到 rebase 前的 SHA，`git reset --hard <sha>` 后再 `--force-with-lease` |

`git reflog` 保留 90 天，rebase 出事基本都能捞回来——前提是别在慌乱中又跑了 `git gc --prune=now`。
