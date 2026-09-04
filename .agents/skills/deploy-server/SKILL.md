---
name: deploy-server
description: 把本 fork 的 sub2api 用 Docker Compose 部署/升级到服务器，复用服务器上已有的 Postgres 数据卷，包含备份、迁移安全检查、健康验证和回滚。Use when 用户要求部署、上线、发版、升级服务器、更新线上版本、docker compose 部署、接已有数据库、回滚线上版本。
---

# Deploy Server

把 `custom` 分支的代码构建成镜像并部署到服务器，**复用已有的 Postgres 数据**。

## 环境假设

| 项 | 值 |
|---|---|
| 部署方式 | 服务器上的 Docker Compose（`deploy/docker-compose.yml`） |
| 应用镜像 | `sub2api:latest`，**在服务器上**由 `deploy/build_image.sh` 构建（compose 里没有 build 段） |
| 代码来源 | 服务器上 clone 一份仓库在 `$REMOTE_DIR`，从 `origin` 拉 `custom` 分支 |
| 数据位置 | 命名卷 `postgres_data` / `redis_data` / `sub2api_data`，和 compose 项目同生命周期 |
| 迁移执行 | 应用启动时自动跑，见 `backend/internal/repository/migrations_runner.go` |
| 配置 | `deploy/.env`（含密码，权限 600，**不进 git**） |

所有脚本通过 SSH 在服务器上执行，需要先设好：

```bash
export SSH_HOST=<服务器IP>
export SSH_USER=<登录用户>          # 默认 root
export REMOTE_DIR=/opt/sub2api      # 服务器上仓库所在目录
```

## 第一条规则

> **永远不要在这个项目上跑 `docker compose down -v`。**

`-v` 会删掉命名卷，`postgres_data` 里的全部历史数据当场消失。停服务只用 `docker compose down`（不带 `-v`）或 `docker compose stop`。
`docker compose down` 之后卷还在，`up -d` 会原样接回去——这就是「接上以前的数据」的全部机制，不需要额外配置。

## 部署流程

### 1. 预检

```bash
bash .Codex/skills/deploy-server/scripts/preflight.sh
```

检查：SSH 通不通、compose 项目状态、`postgres_data` 卷存在且有数据、数据库连得上、当前 `schema_migrations` 记录数与最大编号、磁盘余量、当前跑的镜像 ID。

**重点看「本地待应用迁移」那一节**：它把仓库里的迁移文件和数据库里已记录的比对，列出这次部署会新跑哪些迁移。有数据回填类（`backfill`）的要提前想清楚回滚方案——DDL 能回滚，写进去的数据不能。

### 2. 备份

```bash
bash .Codex/skills/deploy-server/scripts/backup.sh
```

在服务器上 `pg_dump -Fc` 出一份压缩备份到 `$REMOTE_DIR/backups/`，并打印大小和恢复命令。**这一步不能跳过**，迁移是单向的。

备份只保留最近 10 份，更早的自动清理。

### 3. 构建镜像（在服务器上构建）

```bash
bash .Codex/skills/deploy-server/scripts/deploy.sh build
```

脚本会：确认当前在 `custom` 分支且工作区干净 → **本地**跑 `make test` → `git push origin custom` → 服务器 `git reset --hard origin/custom` → 校验服务器和本地是同一个 commit → 打印内存/磁盘余量 → 在服务器上跑 `deploy/build_image.sh` → 打上 `sub2api:<git-sha>` 和 `sub2api:latest` 双标签。

几个设计取舍：

- **测试在本地跑，构建在服务器跑**。服务器上重复跑测试只是白烧构建时间，镜像构建本身已经包含编译，编译不过自然会失败。
- **必须先 push**。服务器是从 `origin` 拉代码的,没推上去就构建的是旧代码。脚本会比对两边 commit,不一致直接终止。
- **打 SHA 标签是为了回滚**——`latest` 被覆盖后就找不回上一个版本了。

服务器构建的资源门槛要注意:前端 `pnpm build` + Go 编译同时进行,**2G 内存的机器大概率 OOM**。脚本会先打印 `free -m` 和 docker 盘余量,看着紧张就先加 swap:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

首次构建 5–15 分钟(拉基础镜像 + 装依赖),之后有层缓存会快很多。清理旧镜像**只用 `docker image prune`,不要用 `docker system prune --volumes`**。

### 4. 部署

```bash
bash .Codex/skills/deploy-server/scripts/deploy.sh up
```

执行：记录当前镜像 SHA（写进 `$REMOTE_DIR/.last-deployed`）→ `docker compose up -d`（**不带 `-v`**）→ 等 healthcheck → 拉一次 `/health` → 打印新的 `schema_migrations` 最大编号。

代码已经在 build 阶段同步到服务器了，这一步只负责起容器。

Postgres 和 Redis 容器不会被重建（compose 只重建镜像变了的服务），数据卷全程不动。

### 5. 验证

```bash
bash .Codex/skills/deploy-server/scripts/deploy.sh verify
```

检查容器健康状态、应用日志里有没有 migration 报错、`/health` 返回、迁移条数变化。

日志里出现 `checksum mismatch` 说明有人改了已应用的迁移文件——立刻回滚，不要试图在生产上手改 `schema_migrations`。

## 回滚

```bash
bash .Codex/skills/deploy-server/scripts/rollback.sh
```

回滚到 `.last-deployed` 里记的上一个镜像 SHA。

**但要清楚回滚的边界**：镜像能回退，**数据库迁移不会自动回退**。如果新版本跑了迁移：

- 只加表/加列的迁移 → 旧版本代码通常能正常跑（多出来的列它不认识而已），直接回滚镜像即可。
- 改了列类型 / 加了 NOT NULL 约束 / 删了东西 → 旧代码会崩，必须从备份恢复数据库：

  ```bash
  bash .Codex/skills/deploy-server/scripts/rollback.sh --with-db backups/<时间戳>.dump
  ```

  这会丢掉备份之后产生的所有业务数据（新用户、新订单、新用量记录）。所以预检那一步要认真看迁移清单。

## 首次接入已有数据库

如果数据是从别处迁过来的（不是这台机器上原生的卷）：

1. 先把 dump 文件传到服务器
2. 只起 postgres：`docker compose up -d postgres`
3. 建库并恢复：`docker compose exec -T postgres pg_restore -U sub2api -d sub2api --clean --if-exists < dump文件`
4. 确认 `schema_migrations` 表存在且有记录 —— 这决定了启动时会重跑哪些迁移
5. 再 `docker compose up -d` 起全部服务，应用会自动补跑缺失的迁移

第 4 步是关键：如果恢复的库里没有 `schema_migrations` 表，应用会从 `001_` 开始全部重跑一遍。对已有数据的库来说，只有当所有迁移都严格幂等时这才是安全的——不确定就先在一份备份副本上演练。

## 禁止事项

- **禁止** `docker compose down -v`（删数据卷）
- **禁止** `docker volume rm`、`docker system prune --volumes`
- **禁止** 跳过备份直接部署
- **禁止** 在生产数据库上手动 `DELETE FROM schema_migrations` 绕过 checksum 报错
- **禁止** 用 `latest` 单标签部署（回滚时找不到上一版）
- **禁止** 把 `deploy/.env` 提交进 git（它已在 .gitignore 里，服务器上 `git reset --hard` 不会动它）
- **禁止** `docker system prune --volumes` 清理构建缓存（用 `docker image prune`）

## 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动日志 `migration ... checksum mismatch` | 已应用的迁移文件被改过 | 回滚镜像；把该文件恢复成已发布版本，不要动数据库 |
| 容器起来但 `/health` 502 | 数据库连不上或迁移卡住 | `docker compose logs sub2api --tail=100` 看具体报错 |
| `up -d` 后数据没了 | 跑过 `down -v` 或换了 compose 项目名 | 从 `backups/` 恢复；确认 `docker volume ls` 里旧卷还在不在 |
| 迁移卡住不动 | 另一个实例持有迁移锁 | 确认没有第二个容器在跑；锁是 Postgres advisory lock，容器退出即释放 |
| 构建时被 Killed / OOM | 服务器内存不够跑前端构建 | 加 swap（见「构建镜像」一节），或临时停掉 sub2api 容器腾内存 |
| 服务器 commit 和本地不一致 | 忘了 push，或 push 到了别的分支 | 脚本会终止；`git push origin custom` 后重跑 |
