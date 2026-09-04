# 最小监控与 CPA 额度文字播报

这是一套只有一个 Python 脚本和两个 systemd timer 的监控。它不部署 Prometheus、Grafana、Loki，也不读取 CPA/CPAMP 数据库文件，不会自动重启或清理容器。

## 监控内容

- `monitor-health.timer`：每分钟检查磁盘使用率、inode、CPU、内存、网络错误/丢包、Docker 容器状态，以及 Sub2API、CPA、CPAMP 的本机健康接口。
- 健康检查同时记录三个应用接口响应时间；超过 3 秒警告、超过 10 秒严重。检查 PostgreSQL 的 `pg_isready` 和 Redis 的 `redis-cli ping`，并检测 Swap 使用率（默认 20% 警告）及 Linux OOM Kill 新增事件。
- `monitor-quota.timer`：每天北京时间 09:30 和 23:30 调用 CPA/CPAMP 的 `/v0/management/auth-files`，发送一份 CPA 全账号文字额度报告。报告始终发送；账号超过 20 个时自动拆分通知消息。
- 额度报告同时对剩余 20% 以下的窗口发送警告、10% 以下发送严重告警；同一账号窗口只告警一次，恢复后发送恢复消息。
- 同一健康故障只告警一次，恢复时发送一次恢复消息。CPU/内存需要连续 10 分钟超过 90%；应用健康连续失败 3 次；额度接口连续失败 3 次。额度报告本身不去重。

账号名称优先使用配置名称或标签；邮箱会脱敏。脚本不会把 Token、Cookie、API Key、Management Key 放入消息或日志。额度缺失/无法识别时明确显示“读取失败”，不会伪造为 `0%`。

## 安装

在目标 Linux Docker 主机上执行（需要 root）：

```sh
cd /path/to/sub2api/deploy/monitoring
sudo install -d -m 0755 /usr/local/libexec /var/lib/sub2api-monitor
sudo install -m 0755 monitor.py /usr/local/libexec/sub2api-monitor.py
sudo install -m 0644 monitor-health.service monitor-health.timer monitor-quota.service monitor-quota.timer /etc/systemd/system/
sudo install -m 0600 monitor.env.example /etc/sub2api-monitor.env
sudoedit /etc/sub2api-monitor.env
sudo systemctl daemon-reload
sudo systemctl enable --now monitor-health.timer monitor-quota.timer
```

先用 `docker ps --format '{{.Names}}'` 查看真实容器名，再修改 `DOCKER_CONTAINERS`。不存在的容器会产生一次告警，因此不要直接保留不适用的示例名。

手动验证当前通知渠道：

```sh
sudo /usr/bin/python3 /usr/local/libexec/sub2api-monitor.py --test-notify
```

通知渠道通过 `NOTIFY_CHANNEL` 选择，支持 `telegram`（默认）和 `dingtalk`。钉钉使用群自定义机器人 Webhook，配置 `DINGTALK_WEBHOOK_URL`；Webhook 地址包含访问凭据，只放在权限为 `600` 的环境文件中，不要提交到代码库或写入日志。钉钉消息使用纯文本格式，并沿用脚本的分段限制。

查看运行记录：

```sh
systemctl list-timers 'monitor-*'
journalctl -u monitor-health.service -n 50 --no-pager
journalctl -u monitor-quota.service -n 50 --no-pager
```

## 配置要点

`CPA_QUOTA_SOURCE=cpamp` 时，脚本使用 `CPAMP_BASE_URL` 和 `CPAMP_ADMIN_KEY`；设置为 `cpa` 时，使用 `CPA_BASE_URL` 和 `CPA_MANAGEMENT_KEY`。两把 Key 必须分开，不能混用。健康地址和管理地址默认都是 `127.0.0.1`，不要改成公网域名。

`POSTGRES_CONTAINER` 和 `REDIS_CONTAINER` 用于容器内服务探针；留空可以分别停用对应探针。健康响应时间阈值由 `HEALTH_LATENCY_WARN_SECONDS` 和 `HEALTH_LATENCY_CRITICAL_SECONDS` 控制，低额度阈值由 `QUOTA_WARN_PERCENT` 和 `QUOTA_CRITICAL_PERCENT` 控制。

如果 Codex 账号的 `/auth-files` 只有空的被动 quota 快照，脚本会对该账号通过同一管理接口的 `/api-call` 读取 `CPA_CODEX_USAGE_URL`（默认 ChatGPT Codex usage 地址），只发送 `auth_index` 和 `$TOKEN$` 占位符，不接触本地凭证文件。

脚本会拒绝非 `127.0.0.1`、`localhost` 或 `::1` 的健康/管理地址，避免把管理凭证发送到公网。

CPAMP Manager Server 代理 CPA 管理接口时使用 `Authorization: Bearer <CPAMP_ADMIN_KEY>`；直连 CPA 管理接口时使用 `Authorization: Bearer <CPA_MANAGEMENT_KEY>`。如果 CPA/CPAMP 版本返回的 quota 字段名称不同，报告会保留失败原因而不会猜测额度。

## 本地测试

```sh
python3 -m unittest discover -s . -p 'test_*.py' -v
python3 -m py_compile monitor.py
```
