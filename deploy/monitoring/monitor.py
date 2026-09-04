#!/usr/bin/env python3
"""Minimal host, application and CPA quota monitor.

The script intentionally uses only Python's standard library.  It never reads
CPA/CPAMP database files and never restarts or mutates a monitored service.
"""

from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


DEFAULTS = {
    "STATE_FILE": "/var/lib/sub2api-monitor/state.json",
    "HOST_FILESYSTEM": "/",
    "SUB2API_HEALTH_URL": "http://127.0.0.1:8080/health",
    "CPA_HEALTH_URL": "http://127.0.0.1:8317/healthz",
    "CPAMP_HEALTH_URL": "http://127.0.0.1:18317/health",
    "CPA_CODEX_USAGE_URL": "https://chatgpt.com/backend-api/wham/usage",
    "DOCKER_CONTAINERS": "sub2api,sub2api-postgres,sub2api-redis,cliproxyapi-cli-proxy-api-1,cliproxyapi-cpa-manager-plus-1",
    "HTTP_TIMEOUT_SECONDS": "10",
    "HEALTH_LATENCY_WARN_SECONDS": "3",
    "HEALTH_LATENCY_CRITICAL_SECONDS": "10",
    "CPU_ALERT_PERCENT": "90",
    "MEMORY_ALERT_PERCENT": "90",
    "SWAP_ALERT_PERCENT": "20",
    "DISK_WARN_PERCENT": "80",
    "DISK_CRITICAL_PERCENT": "90",
    "ALERT_SUSTAINED_MINUTES": "10",
    "HEALTH_FAILURES": "3",
    "QUOTA_WARN_PERCENT": "20",
    "QUOTA_CRITICAL_PERCENT": "10",
    "QUOTA_FAILURES": "3",
    "POSTGRES_CONTAINER": "sub2api-postgres",
    "REDIS_CONTAINER": "sub2api-redis",
}


class MonitorError(RuntimeError):
    """An expected operational failure safe to show without secret details."""


def load_env_file(path: str) -> None:
    """Load simple KEY=VALUE lines for manual invocation.

    systemd normally loads the EnvironmentFile.  This small parser makes the
    same script usable from a shell without evaluating arbitrary shell code.
    """

    env_path = Path(path)
    if not env_path.exists():
        raise MonitorError(f"环境文件不存在：{path}")
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        os.environ[key] = value


def cfg(name: str) -> str:
    return os.environ.get(name, DEFAULTS.get(name, ""))


def cfg_int(name: str) -> int:
    try:
        return int(cfg(name))
    except ValueError as exc:
        raise MonitorError(f"配置项 {name} 必须是整数") from exc


def cfg_float(name: str) -> float:
    try:
        return float(cfg(name))
    except ValueError as exc:
        raise MonitorError(f"配置项 {name} 必须是数字") from exc


def require_config(*names: str) -> None:
    missing = [name for name in names if not os.environ.get(name, "").strip()]
    if missing:
        raise MonitorError("缺少配置项：" + ", ".join(missing))


def require_local_url(url: str, label: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise MonitorError(f"{label} 必须指向本机地址")


def timestamp() -> str:
    return dt.datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")


def read_state() -> dict[str, Any]:
    path = Path(cfg("STATE_FILE"))
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(state, dict):
            raise ValueError("根节点不是对象")
    except FileNotFoundError:
        state = {}
    except (json.JSONDecodeError, ValueError) as exc:
        raise MonitorError(f"状态文件损坏：{path}") from exc
    state.setdefault("events", {})
    state.setdefault("counters", {})
    state.setdefault("network", {})
    return state


def write_state(state: dict[str, Any]) -> None:
    path = Path(cfg("STATE_FILE"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o750)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


@contextmanager
def state_lock() -> Iterable[None]:
    """Prevent health and quota timers from overwriting each other's state."""

    lock_path = Path(cfg("STATE_FILE") + ".lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path.parent.chmod(0o750)
    with lock_path.open("a", encoding="utf-8") as handle:
        os.chmod(lock_path, 0o600)
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def split_message(text: str, limit: int = 3800) -> list[str]:
    """Split on line boundaries while keeping notification messages short."""

    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    current = ""
    for line in text.splitlines(keepends=True):
        if len(line) > limit:
            if current:
                chunks.append(current.rstrip("\n"))
                current = ""
            for start in range(0, len(line), limit):
                chunks.append(line[start : start + limit].rstrip("\n"))
            continue
        if current and len(current) + len(line) > limit:
            chunks.append(current.rstrip("\n"))
            current = ""
        current += line
    if current:
        chunks.append(current.rstrip("\n"))
    return chunks or [""]


def telegram_send(text: str) -> None:
    require_config("TG_BOT_TOKEN", "TG_CHAT_ID")
    endpoint = f"https://api.telegram.org/bot{os.environ['TG_BOT_TOKEN']}/sendMessage"
    for chunk in split_message(text):
        body = urlencode(
            {
                "chat_id": os.environ["TG_CHAT_ID"],
                "text": chunk,
                "disable_web_page_preview": "true",
            }
        ).encode("utf-8")
        request = Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=cfg_float("HTTP_TIMEOUT_SECONDS")) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise MonitorError(f"Telegram 发送失败（HTTP {exc.code}）") from exc
        except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise MonitorError("Telegram 发送失败（网络或响应错误）") from exc
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise MonitorError("Telegram 发送失败（接口返回失败）")


def dingtalk_send(text: str) -> None:
    require_config("DINGTALK_WEBHOOK_URL")
    endpoint = os.environ["DINGTALK_WEBHOOK_URL"].strip()
    parsed = urlparse(endpoint)
    if parsed.scheme != "https" or not parsed.hostname:
        raise MonitorError("DINGTALK_WEBHOOK_URL 必须使用 HTTPS 地址")
    for chunk in split_message(text):
        body = json.dumps(
            {"msgtype": "text", "text": {"content": chunk}},
            ensure_ascii=False,
        ).encode("utf-8")
        request = Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=cfg_float("HTTP_TIMEOUT_SECONDS")) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise MonitorError(f"钉钉发送失败（HTTP {exc.code}）") from exc
        except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise MonitorError("钉钉发送失败（网络或响应错误）") from exc
        if not isinstance(result, dict) or result.get("errcode") != 0:
            raise MonitorError("钉钉发送失败（接口返回失败）")


def require_notifier_config() -> None:
    channel = cfg("NOTIFY_CHANNEL").strip().lower() or "telegram"
    if channel == "telegram":
        require_config("TG_BOT_TOKEN", "TG_CHAT_ID")
    elif channel == "dingtalk":
        require_config("DINGTALK_WEBHOOK_URL")
    else:
        raise MonitorError("NOTIFY_CHANNEL 必须是 telegram 或 dingtalk")


def notify_send(text: str) -> None:
    channel = cfg("NOTIFY_CHANNEL").strip().lower() or "telegram"
    if channel == "telegram":
        telegram_send(text)
    elif channel == "dingtalk":
        dingtalk_send(text)
    else:
        raise MonitorError("NOTIFY_CHANNEL 必须是 telegram 或 dingtalk")


def http_get_json(url: str, token: str | None = None) -> Any:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, headers=headers, method="GET")
    try:
        with urlopen(request, timeout=cfg_float("HTTP_TIMEOUT_SECONDS")) as response:
            if not 200 <= response.status < 300:
                raise MonitorError(f"接口返回 HTTP {response.status}")
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise MonitorError(f"接口返回 HTTP {exc.code}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise MonitorError("接口连接失败或超时") from exc
    except json.JSONDecodeError as exc:
        raise MonitorError("接口返回的不是有效 JSON") from exc


def http_health_check(url: str) -> float:
    """Treat any 2xx response as healthy; the body may be text or JSON."""

    request = Request(url, headers={"Accept": "*/*"}, method="GET")
    started = time.monotonic()
    try:
        with urlopen(request, timeout=cfg_float("HTTP_TIMEOUT_SECONDS")) as response:
            if not 200 <= response.status < 300:
                raise MonitorError(f"健康接口返回 HTTP {response.status}")
            response.read(1024)
    except HTTPError as exc:
        raise MonitorError(f"健康接口返回 HTTP {exc.code}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise MonitorError("健康接口连接失败或超时") from exc
    return time.monotonic() - started


def http_post_json(url: str, token: str, payload: dict[str, Any]) -> Any:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=cfg_float("HTTP_TIMEOUT_SECONDS")) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise MonitorError(f"管理接口返回 HTTP {exc.code}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise MonitorError("管理接口连接失败或超时") from exc
    except json.JSONDecodeError as exc:
        raise MonitorError("管理接口返回的不是有效 JSON") from exc


def update_level(
    state: dict[str, Any],
    key: str,
    level: str,
    alert_text: str,
    recovery_text: str,
) -> list[str]:
    events = state["events"]
    previous = events.get(key, "normal")
    events[key] = level
    if level == previous:
        return []
    if level == "normal":
        return [f"[监控恢复]\n时间：{timestamp()}\n{recovery_text}"] if previous != "normal" else []
    if previous == "critical" and level == "warning":
        return []
    return [f"[监控告警]\n时间：{timestamp()}\n{alert_text}"]


def disk_metrics(path: str) -> tuple[float, float]:
    usage = shutil.disk_usage(path)
    disk_percent = usage.used / usage.total * 100 if usage.total else 0.0
    stat = os.statvfs(path)
    inode_total = stat.f_files
    inode_used = inode_total - stat.f_ffree
    inode_percent = inode_used / inode_total * 100 if inode_total else 0.0
    return disk_percent, inode_percent


def memory_percent() -> float:
    values: dict[str, int] = {}
    with open("/proc/meminfo", encoding="utf-8") as handle:
        for line in handle:
            key, _, value = line.partition(":")
            if key in {"MemTotal", "MemAvailable"}:
                values[key] = int(value.strip().split()[0])
    total = values.get("MemTotal", 0)
    available = values.get("MemAvailable", 0)
    if not total:
        raise MonitorError("无法读取内存信息")
    return (total - available) / total * 100


def swap_percent() -> float | None:
    values: dict[str, int] = {}
    try:
        with open("/proc/meminfo", encoding="utf-8") as handle:
            for line in handle:
                key, _, value = line.partition(":")
                if key in {"SwapTotal", "SwapFree"}:
                    values[key] = int(value.strip().split()[0])
    except (FileNotFoundError, OSError, ValueError) as exc:
        raise MonitorError("无法读取 Swap 使用率") from exc
    total = values.get("SwapTotal", 0)
    if not total:
        return None
    free = values.get("SwapFree", 0)
    return max(0.0, min(100.0, (total - free) / total * 100))


def oom_kill_count() -> int:
    try:
        with open("/proc/vmstat", encoding="utf-8") as handle:
            for line in handle:
                key, _, value = line.partition(" ")
                if key == "oom_kill":
                    return int(value.strip())
    except (FileNotFoundError, OSError, ValueError) as exc:
        raise MonitorError("无法读取 OOM Kill 计数") from exc
    raise MonitorError("系统未提供 OOM Kill 计数")


def cpu_percent(state: dict[str, Any]) -> float | None:
    try:
        with open("/proc/stat", encoding="utf-8") as handle:
            fields = handle.readline().split()
        if not fields or fields[0] != "cpu":
            raise ValueError
        values = [int(value) for value in fields[1:]]
    except (FileNotFoundError, OSError, ValueError) as exc:
        raise MonitorError("无法读取 CPU 使用率") from exc
    total = sum(values)
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    previous = state.get("cpu")
    state["cpu"] = {"total": total, "idle": idle}
    if not isinstance(previous, dict):
        return None
    total_delta = total - int(previous.get("total", total))
    idle_delta = idle - int(previous.get("idle", idle))
    if total_delta <= 0:
        return None
    return max(0.0, min(100.0, (total_delta - idle_delta) / total_delta * 100))


def network_error_counters() -> dict[str, int]:
    counters = {"errors": 0, "drops": 0}
    try:
        with open("/proc/net/dev", encoding="utf-8") as handle:
            for line in handle:
                if ":" not in line:
                    continue
                interface, data = line.split(":", 1)
                if interface.strip() == "lo":
                    continue
                fields = data.split()
                if len(fields) >= 12:
                    counters["errors"] += int(fields[2]) + int(fields[10])
                    counters["drops"] += int(fields[3]) + int(fields[11])
    except (FileNotFoundError, ValueError, OSError) as exc:
        raise MonitorError("无法读取网络接口统计") from exc
    return counters


def docker_state(name: str) -> tuple[str, int] | None:
    try:
        completed = subprocess.run(
            ["docker", "inspect", "--format", "{{json .State}}|{{.RestartCount}}", name],
            capture_output=True,
            text=True,
            timeout=cfg_float("HTTP_TIMEOUT_SECONDS"),
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        return None
    try:
        state_json, restart_text = completed.stdout.strip().rsplit("|", 1)
        value = json.loads(state_json)
        status = str(value.get("Status", "unknown"))
        health = value.get("Health") or {}
        health_status = str(health.get("Status", ""))
        if health_status == "unhealthy":
            status = f"{status}/{health_status}"
        return status, int(restart_text)
    except (ValueError, TypeError, AttributeError):
        return None


def docker_exec_probe(name: str, command: tuple[str, ...], expected_output: str | None = None) -> None:
    try:
        completed = subprocess.run(
            ["docker", "exec", name, *command],
            capture_output=True,
            text=True,
            timeout=cfg_float("HTTP_TIMEOUT_SECONDS"),
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise MonitorError("容器内服务探针执行失败或超时") from exc
    if completed.returncode != 0:
        raise MonitorError("容器内服务探针返回失败")
    if expected_output and expected_output not in completed.stdout:
        raise MonitorError("容器内服务探针未返回预期结果")


def host_and_app_checks(state: dict[str, Any]) -> list[str]:
    messages: list[str] = []
    host = socket.gethostname()

    try:
        disk, inode = disk_metrics(cfg("HOST_FILESYSTEM"))
        disk_level = "critical" if disk >= cfg_float("DISK_CRITICAL_PERCENT") else "warning" if disk >= cfg_float("DISK_WARN_PERCENT") else "normal"
        disk_level_text = {"warning": "警告", "critical": "严重"}.get(disk_level, "正常")
        messages += update_level(
            state,
            "disk",
            disk_level,
            f"主机：{host}\n磁盘使用率：{disk:.1f}%（达到{disk_level_text}阈值）",
            f"主机：{host}\n磁盘使用率已恢复：{disk:.1f}%",
        )
        inode_level = "critical" if inode >= cfg_float("DISK_CRITICAL_PERCENT") else "warning" if inode >= cfg_float("DISK_WARN_PERCENT") else "normal"
        inode_level_text = {"warning": "警告", "critical": "严重"}.get(inode_level, "正常")
        messages += update_level(
            state,
            "inode",
            inode_level,
            f"主机：{host}\ninode 使用率：{inode:.1f}%（达到{inode_level_text}阈值）",
            f"主机：{host}\ninode 使用率已恢复：{inode:.1f}%",
        )
    except (MonitorError, OSError) as exc:
        messages += update_level(state, "disk_check", "error", f"主机：{host}\n磁盘检查失败：{exc}", f"主机：{host}\n磁盘检查已恢复")

    metric_checks = (
        ("cpu", lambda: cpu_percent(state), cfg_float("CPU_ALERT_PERCENT")),
        ("memory", memory_percent, cfg_float("MEMORY_ALERT_PERCENT")),
    )
    for metric_name, collector, threshold in metric_checks:
        label = "CPU" if metric_name == "cpu" else "内存"
        try:
            value = collector()
        except MonitorError as exc:
            messages += update_level(state, f"{metric_name}_check", "error", f"主机：{host}\n{label}检查失败：{exc}", f"主机：{host}\n{label}检查已恢复")
            continue
        if value is None:
            continue
        counter_key = f"{metric_name}_high_count"
        if value >= threshold:
            state["counters"][counter_key] = int(state["counters"].get(counter_key, 0)) + 1
        else:
            state["counters"][counter_key] = 0
        sustained = state["counters"][counter_key] >= cfg_int("ALERT_SUSTAINED_MINUTES")
        messages += update_level(
            state,
            metric_name,
            "high" if sustained else "normal",
            f"主机：{host}\n{label}使用率：{value:.1f}%\n已连续达到阈值 {state['counters'][counter_key]} 分钟",
            f"主机：{host}\n{label}使用率已恢复：{value:.1f}%",
        )

    try:
        swap = swap_percent()
        if swap is None:
            state["counters"]["swap_high_count"] = 0
            messages += update_level(
                state,
                "swap",
                "normal",
                "",
                f"主机：{host}\nSwap 使用率已恢复：未启用 Swap",
            )
        else:
            swap_level = "warning" if swap >= cfg_float("SWAP_ALERT_PERCENT") else "normal"
            messages += update_level(
                state,
                "swap",
                swap_level,
                f"主机：{host}\nSwap 使用率：{swap:.1f}%（达到警告阈值）",
                f"主机：{host}\nSwap 使用率已恢复：{swap:.1f}%",
            )
    except MonitorError as exc:
        messages += update_level(
            state,
            "swap_check",
            "error",
            f"主机：{host}\nSwap 检查失败：{exc}",
            f"主机：{host}\nSwap 检查已恢复",
        )

    try:
        current_oom = oom_kill_count()
        previous_oom = state["counters"].get("oom_kill_total")
        delta = max(0, current_oom - int(previous_oom)) if previous_oom is not None else 0
        state["counters"]["oom_kill_total"] = current_oom
        messages += update_level(
            state,
            "oom_kill",
            "error" if delta else "normal",
            f"主机：{host}\n检测到 OOM Kill：最近新增 {delta} 次（累计 {current_oom} 次）",
            f"主机：{host}\nOOM Kill 已停止新增（累计 {current_oom} 次）",
        )
    except MonitorError as exc:
        messages += update_level(
            state,
            "oom_check",
            "error",
            f"主机：{host}\nOOM 检查失败：{exc}",
            f"主机：{host}\nOOM 检查已恢复",
        )

    try:
        network = network_error_counters()
        previous_network = state["network"]
        delta = (network["errors"] - int(previous_network.get("errors", network["errors"]))) + (network["drops"] - int(previous_network.get("drops", network["drops"])))
        state["network"] = network
        if delta > 0:
            state["counters"]["network_bad_count"] = int(state["counters"].get("network_bad_count", 0)) + 1
        else:
            state["counters"]["network_bad_count"] = 0
        network_bad = state["counters"]["network_bad_count"] >= cfg_int("HEALTH_FAILURES")
        messages += update_level(
            state,
            "network",
            "error" if network_bad else "normal",
            f"主机：{host}\n网络接口错误/丢包持续增加（最近一次累计增量：{delta}）",
            f"主机：{host}\n网络接口错误/丢包已恢复（当前错误：{network['errors']}，丢包：{network['drops']}）",
        )
    except MonitorError as exc:
        messages += update_level(state, "network_check", "error", f"主机：{host}\n网络检查失败：{exc}", f"主机：{host}\n网络检查已恢复")

    for name in [item.strip() for item in cfg("DOCKER_CONTAINERS").split(",") if item.strip()]:
        inspected = docker_state(name)
        if inspected is None:
            messages += update_level(state, f"container:{name}", "error", f"主机：{host}\nDocker 容器无法检查或不存在：{name}", f"主机：{host}\nDocker 容器检查已恢复：{name}")
            continue
        status, restart_count = inspected
        healthy = status == "running"
        messages += update_level(state, f"container:{name}", "normal" if healthy else "error", f"主机：{host}\nDocker 容器异常：{name}\n状态：{status}", f"主机：{host}\nDocker 容器已恢复：{name}")
        restart_key = f"restart:{name}"
        previous_restart = int(state["counters"].get(restart_key, restart_count))
        restart_delta = restart_count - previous_restart
        state["counters"][restart_key] = restart_count
        messages += update_level(state, f"container-restart:{name}", "error" if restart_delta > 0 else "normal", f"主机：{host}\nDocker 容器发生重启：{name}\n重启次数：{restart_count}", f"主机：{host}\nDocker 容器重启次数已稳定：{name}")

    for service_name, config_name, command, expected_output in (
        ("PostgreSQL", "POSTGRES_CONTAINER", ("pg_isready",), None),
        ("Redis", "REDIS_CONTAINER", ("redis-cli", "ping"), "PONG"),
    ):
        container = cfg(config_name).strip()
        if not container:
            continue
        service_key = f"service:{service_name.lower()}"
        inspected = docker_state(container)
        if inspected is None:
            messages += update_level(
                state,
                service_key,
                "error",
                f"主机：{host}\n{service_name} 服务探针失败：容器无法检查：{container}",
                f"主机：{host}\n{service_name} 服务探针已恢复",
            )
            continue
        status, _ = inspected
        if status != "running":
            messages += update_level(
                state,
                service_key,
                "error",
                f"主机：{host}\n{service_name} 服务不可用：容器状态 {status}",
                f"主机：{host}\n{service_name} 服务探针已恢复",
            )
            continue
        try:
            docker_exec_probe(container, command, expected_output)
        except MonitorError as exc:
            messages += update_level(
                state,
                service_key,
                "error",
                f"主机：{host}\n{service_name} 服务探针失败：{exc}",
                f"主机：{host}\n{service_name} 服务探针已恢复",
            )
        else:
            messages += update_level(
                state,
                service_key,
                "normal",
                "",
                f"主机：{host}\n{service_name} 服务探针已恢复",
            )

    for key, url in (
        ("sub2api", cfg("SUB2API_HEALTH_URL")),
        ("cpa", cfg("CPA_HEALTH_URL")),
        ("cpamp", cfg("CPAMP_HEALTH_URL")),
    ):
        try:
            require_local_url(url, f"{key} 健康地址")
            elapsed = http_health_check(url)
            state["counters"][f"health_failures:{key}"] = 0
            messages += update_level(state, f"health:{key}", "normal", "", f"主机：{host}\n应用已恢复：{key}")
            latency_level = (
                "critical"
                if elapsed >= cfg_float("HEALTH_LATENCY_CRITICAL_SECONDS")
                else "warning"
                if elapsed >= cfg_float("HEALTH_LATENCY_WARN_SECONDS")
                else "normal"
            )
            latency_text = "严重" if latency_level == "critical" else "警告"
            messages += update_level(
                state,
                f"health-latency:{key}",
                latency_level,
                f"主机：{host}\n应用健康接口响应慢：{key}\n响应耗时：{elapsed:.2f} 秒（达到{latency_text}阈值）",
                f"主机：{host}\n应用健康接口响应已恢复：{key}\n响应耗时：{elapsed:.2f} 秒",
            )
        except MonitorError as exc:
            failure_key = f"health_failures:{key}"
            state["counters"][failure_key] = int(state["counters"].get(failure_key, 0)) + 1
            failed = state["counters"][failure_key] >= cfg_int("HEALTH_FAILURES")
            messages += update_level(state, f"health:{key}", "error" if failed else "normal", f"主机：{host}\n应用健康检查失败：{key}\n连续失败：{state['counters'][failure_key]} 次\n原因：{exc}", f"主机：{host}\n应用已恢复：{key}")

    return messages


def redact_name(account: dict[str, Any]) -> str:
    for field in ("name", "label", "email", "id"):
        value = str(account.get(field, "")).strip()
        if not value:
            continue
        if field in {"name", "email"} and "@" in value:
            local, domain = value.split("@", 1)
            value = (local[:2] + "***" if len(local) > 2 else "***") + "@" + domain
        elif field == "id" and len(value) > 12:
            value = value[:4] + "***" + value[-4:]
        return value
    return "未命名账号"


def number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
        if match:
            try:
                return float(match.group(0))
            except ValueError:
                return None
    return None


def format_reset(value: Any) -> str | None:
    """Render common ISO-8601 or Unix-second/millisecond reset values."""

    if value in (None, ""):
        return None
    parsed = None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        parsed = float(value)
    elif isinstance(value, str) and re.fullmatch(r"\s*\d+(?:\.\d+)?\s*", value):
        parsed = float(value.strip())
    if parsed is not None and parsed > 0:
        seconds = parsed / 1000 if parsed > 1_000_000_000_000 else parsed
        try:
            return dt.datetime.fromtimestamp(seconds).astimezone().strftime("%Y-%m-%d %H:%M:%S")
        except (OverflowError, OSError, ValueError):
            return str(value)
    return str(value)


def window_label(label: str, duration: Any) -> str:
    seconds = number(duration)
    if seconds is not None:
        if abs(seconds - 18_000) < 60:
            return "5小时额度"
        if abs(seconds - 604_800) < 300:
            return "7天额度"
        if abs(seconds - 2_628_000) < 86_400:
            return "30天额度"
    return label


def contextual_window_label(quota: Any, path: str, label: str, duration: Any) -> str:
    """Keep model-specific Codex windows distinguishable from account windows."""

    normalized = window_label(label, duration)
    match = re.match(r"additional_rate_limits/(\d+)/", path)
    if not match or not isinstance(quota, dict):
        return normalized
    limits = quota.get("additional_rate_limits")
    if not isinstance(limits, list):
        return normalized
    index = int(match.group(1))
    if index >= len(limits) or not isinstance(limits[index], dict):
        return normalized
    limit_name = str(limits[index].get("limit_name") or "").strip()
    return f"{limit_name} {normalized}" if limit_name else normalized


def flatten_quota(value: Any, path: str = "") -> Iterable[tuple[str, dict[str, Any]]]:
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            child_path = f"{path}/{key}" if path else str(key)
            yield from flatten_quota(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from flatten_quota(child, f"{path}/{index}" if path else str(index))


def quota_windows(account: dict[str, Any]) -> list[tuple[str, float | None, str | None]]:
    quota = account.get("quota")
    if quota is None or quota == {}:
        quota = account.get("model_quotas")
    windows: list[tuple[str, float | None, str | None]] = []
    seen: set[tuple[str, str]] = set()
    signal_windows: dict[str, dict[str, Any]] = {}
    if isinstance(quota, dict) and isinstance(quota.get("signals"), dict):
        for raw_key, raw_value in quota["signals"].items():
            key = str(raw_key)
            field = next(
                (
                    candidate
                    for candidate in (
                        "remaining_percent",
                        "used_percent",
                        "limit_window_seconds",
                        "reset_at",
                        "reset_after_seconds",
                    )
                    if key.lower().endswith(candidate)
                ),
                None,
            )
            if field:
                prefix = key[: -len(field)].rstrip("._/-") or "额度"
                signal_windows.setdefault(prefix, {})[field] = raw_value
    for path, item in flatten_quota(quota):
        duration = item.get("limit_window_seconds") or item.get("limitWindowSeconds") or item.get("duration")
        label = contextual_window_label(
            quota,
            path,
            str(item.get("window") or item.get("window_name") or item.get("label") or item.get("name") or path or "额度"),
            duration,
        )
        remaining: float | None = None
        for key in ("remaining_percent", "remainingPercent", "remaining_percentage", "remainingPercentage"):
            remaining = number(item.get(key))
            if remaining is not None:
                break
        if remaining is None:
            for key in ("used_percent", "usedPercent", "utilization", "utilizationPercent", "used_percentage", "usedPercentage"):
                used = number(item.get(key))
                if used is not None and 0 <= used <= 100:
                    remaining = 100 - used
                    break
        if remaining is None:
            fraction = number(item.get("remaining_fraction") or item.get("remainingFraction"))
            if fraction is not None and 0 <= fraction <= 1:
                remaining = fraction * 100
        if remaining is None:
            used = next((number(item.get(key)) for key in ("used", "usage", "consumed") if number(item.get(key)) is not None), None)
            limit = next((number(item.get(key)) for key in ("limit", "total", "quota", "maximum") if number(item.get(key)) is not None), None)
            if used is not None and limit and limit > 0:
                remaining = (limit - used) / limit * 100
        reset: str | None = None
        for key in ("reset_at", "resetAt", "resets_at", "resetsAt", "reset_time", "resetTime", "next_reset_at", "nextResetAt"):
            if item.get(key) not in (None, ""):
                reset = format_reset(item[key])
                break
        if reset is None and item.get("reset_after_seconds") is not None:
            after = number(item.get("reset_after_seconds"))
            if after is not None and after > 0:
                reset = format_reset(time.time() + after)
        if remaining is not None or reset is not None:
            remaining = max(0.0, min(100.0, remaining)) if remaining is not None else None
            identity = (label, reset or "")
            if identity not in seen:
                seen.add(identity)
                windows.append((label, remaining, reset))
    for label, item in signal_windows.items():
        synthetic = dict(item)
        duration = synthetic.get("limit_window_seconds")
        normalized_label = window_label(label, duration)
        remaining = number(synthetic.get("remaining_percent"))
        if remaining is None:
            used = number(synthetic.get("used_percent"))
            if used is not None and 0 <= used <= 100:
                remaining = 100 - used
        reset = format_reset(synthetic.get("reset_at"))
        if reset is None:
            after = number(synthetic.get("reset_after_seconds"))
            if after is not None and after > 0:
                reset = format_reset(time.time() + after)
        if remaining is not None or reset is not None:
            remaining = max(0.0, min(100.0, remaining)) if remaining is not None else None
            identity = (normalized_label, reset or "")
            if identity not in seen:
                seen.add(identity)
                windows.append((normalized_label, remaining, reset))
    if not windows and account.get("model_quotas") is not None and quota is not account.get("model_quotas"):
        fallback = dict(account)
        fallback["quota"] = account.get("model_quotas")
        fallback.pop("model_quotas", None)
        return quota_windows(fallback)
    return windows


def fetch_codex_quota(base_url: str, token: str, account: dict[str, Any]) -> dict[str, Any]:
    auth_index = str(account.get("auth_index") or account.get("authIndex") or "").strip()
    if not auth_index:
        raise MonitorError("Codex 账号缺少 auth_index")
    usage_url = cfg("CPA_CODEX_USAGE_URL").strip()
    parsed = urlparse(usage_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise MonitorError("CPA_CODEX_USAGE_URL 不是有效地址")
    headers = {"Authorization": "Bearer $TOKEN$", "Accept": "application/json"}
    account_id = account.get("chatgpt_account_id") or account.get("account_id")
    if not account_id and isinstance(account.get("id_token"), dict):
        account_id = account["id_token"].get("chatgpt_account_id")
    if account_id:
        headers["ChatGPT-Account-Id"] = str(account_id)
    response = http_post_json(
        base_url.rstrip("/") + "/v0/management/api-call",
        token,
        {
            "auth_index": auth_index,
            "method": "GET",
            "url": usage_url,
            "header": headers,
        },
    )
    if not isinstance(response, dict):
        raise MonitorError("Codex 额度代理未返回对象")
    status = number(response.get("status_code"))
    if status is None or not 200 <= status < 300:
        code = int(status) if status is not None else "未知"
        raise MonitorError(f"Codex 上游额度接口返回 HTTP {code}")
    body = response.get("body")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError as exc:
            raise MonitorError("Codex 上游额度响应不是有效 JSON") from exc
    if not isinstance(body, dict):
        raise MonitorError("Codex 上游额度响应不是对象")
    return body


def quota_report(
    accounts: list[dict[str, Any]],
    error: str | None = None,
    *,
    total_accounts: int | None = None,
    overall_status: str | None = None,
    start_index: int = 1,
    title: str = "[CPA账号额度报告]",
) -> str:
    status = overall_status or ("正常" if error is None and all(quota_is_complete(account) for account in accounts) else "存在异常")
    count = len(accounts) if total_accounts is None else total_accounts
    count_text = "读取失败" if error else str(count)
    lines = [title, f"时间：{timestamp()}", f"账号数：{count_text}", f"整体状态：{status}"]
    if error:
        lines += ["", "额度：读取失败", f"原因：{error}"]
        return "\n".join(lines)
    for index, account in enumerate(accounts, start_index):
        lines += ["", f"{index}. {redact_name(account)}"]
        if account.get("disabled") is True:
            lines.append("   状态：已禁用")
        elif account.get("unavailable") is True:
            lines.append("   状态：不可用")
        windows = quota_windows(account)
        if not windows:
            lines.append("   额度：读取失败")
            lines.append(f"   原因：{account.get('quota_error') or '上游未返回可识别的额度数据'}")
            continue
        for label, remaining, reset in windows:
            if remaining is None:
                lines.append(f"   {label}：读取失败")
                lines.append("   原因：上游未返回剩余百分比")
                continue
            remaining_text = f"剩余 {remaining:.0f}%"
            reset_text = reset or "未返回"
            lines.append(f"   {label}：{remaining_text}")
            lines.append(f"   下次重置：{reset_text}")
    return "\n".join(lines)


def quota_is_complete(account: dict[str, Any]) -> bool:
    windows = quota_windows(account)
    return bool(windows) and all(remaining is not None and reset is not None for _, remaining, reset in windows)


def quota_alerts(accounts: list[dict[str, Any]], state: dict[str, Any]) -> list[str]:
    warn_percent = cfg_float("QUOTA_WARN_PERCENT")
    critical_percent = cfg_float("QUOTA_CRITICAL_PERCENT")
    if critical_percent > warn_percent:
        raise MonitorError("QUOTA_CRITICAL_PERCENT 不能高于 QUOTA_WARN_PERCENT")
    messages: list[str] = []
    for account in accounts:
        account_identity = str(account.get("auth_index") or account.get("authIndex") or redact_name(account))
        account_digest = hashlib.sha256(account_identity.encode("utf-8")).hexdigest()[:16]
        account_name = redact_name(account)
        for label, remaining, _reset in quota_windows(account):
            if remaining is None:
                continue
            level = "critical" if remaining <= critical_percent else "warning" if remaining <= warn_percent else "normal"
            severity = "严重" if level == "critical" else "警告"
            messages += update_level(
                state,
                f"quota-low:{account_digest}:{label}",
                level,
                f"CPA 账号额度偏低：{account_name}\n{label}：剩余 {remaining:.0f}%（达到{severity}阈值）",
                f"CPA 账号额度已恢复：{account_name}\n{label}：剩余 {remaining:.0f}%",
            )
    return messages


def quota_reports(accounts: list[dict[str, Any]], per_message: int = 20) -> list[str]:
    if not accounts:
        return [quota_report([])]
    groups = [accounts[start : start + per_message] for start in range(0, len(accounts), per_message)]
    overall_status = "正常" if all(quota_is_complete(account) for account in accounts) else "存在异常"
    reports: list[str] = []
    for part, group in enumerate(groups, 1):
        title = f"[CPA账号额度报告 {part}/{len(groups)}]" if len(groups) > 1 else "[CPA账号额度报告]"
        reports.append(
            quota_report(
                group,
                total_accounts=len(accounts),
                overall_status=overall_status,
                start_index=(part - 1) * per_message + 1,
                title=title,
            )
        )
    return reports


def quota_run(state: dict[str, Any]) -> list[str]:
    try:
        source = cfg("CPA_QUOTA_SOURCE").strip().lower()
        if source == "cpamp":
            require_config("CPAMP_ADMIN_KEY")
            base_url, token = cfg("CPAMP_BASE_URL"), os.environ["CPAMP_ADMIN_KEY"]
        elif source == "cpa":
            require_config("CPA_MANAGEMENT_KEY")
            base_url, token = cfg("CPA_BASE_URL"), os.environ["CPA_MANAGEMENT_KEY"]
        else:
            raise MonitorError("CPA_QUOTA_SOURCE 必须是 cpamp 或 cpa")
        require_local_url(base_url, "CPA/CPAMP 管理地址")
        url = base_url.rstrip("/") + "/v0/management/auth-files"
        payload = http_get_json(url, token)
        accounts = payload.get("files") if isinstance(payload, dict) else None
        if not isinstance(accounts, list):
            raise MonitorError("额度接口未返回 files 列表")
        accounts = [item for item in accounts if isinstance(item, dict)]
        enriched_accounts: list[dict[str, Any]] = []
        for account in accounts:
            enriched = dict(account)
            provider = str(account.get("provider") or account.get("type") or "").strip().lower()
            if provider in {"codex", "openai-codex"} and not quota_windows(account):
                try:
                    enriched["quota"] = fetch_codex_quota(base_url, token, account)
                except MonitorError as exc:
                    enriched["quota_error"] = str(exc)
            enriched_accounts.append(enriched)
        accounts = enriched_accounts
        messages = quota_alerts(accounts, state) + quota_reports(accounts)
        failed_accounts = sum(1 for account in accounts if not quota_is_complete(account))
        was_failed = state["events"].get("quota", "normal") == "error"
        if failed_accounts:
            failures = int(state["counters"].get("quota_failures", 0)) + 1
            state["counters"]["quota_failures"] = failures
            if failures >= cfg_int("QUOTA_FAILURES") and not was_failed:
                state["events"]["quota"] = "error"
                messages.append(f"[监控告警]\n时间：{timestamp()}\nCPA 账号额度读取连续失败：{failures} 次\n失败账号数：{failed_accounts}")
        else:
            state["counters"]["quota_failures"] = 0
            state["events"]["quota"] = "normal"
            if was_failed:
                messages.append(f"[监控恢复]\n时间：{timestamp()}\nCPA 额度读取已恢复")
        return messages
    except MonitorError as exc:
        failures = int(state["counters"].get("quota_failures", 0)) + 1
        state["counters"]["quota_failures"] = failures
        report = quota_report([], str(exc))
        messages = [report]
        if failures >= cfg_int("QUOTA_FAILURES") and state["events"].get("quota", "normal") != "error":
            state["events"]["quota"] = "error"
            messages.append(f"[监控告警]\n时间：{timestamp()}\nCPA 额度读取连续失败：{failures} 次\n原因：{exc}")
        return messages


def run_health() -> int:
    require_notifier_config()
    with state_lock():
        state = read_state()
        messages = host_and_app_checks(state)
        for message in messages:
            notify_send(message)
        write_state(state)
    return 0


def run_quota() -> int:
    require_notifier_config()
    with state_lock():
        state = read_state()
        messages = quota_run(state)
        for message in messages:
            notify_send(message)
        write_state(state)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sub2API/CPA 最小监控")
    parser.add_argument("--env-file", help="手动运行时读取的 KEY=VALUE 环境文件")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--health", action="store_true", help="执行主机、Docker 和应用健康检查")
    mode.add_argument("--quota", action="store_true", help="读取并发送 CPA 全账号额度报告")
    mode.add_argument("--test-telegram", action="store_true", help="发送 Telegram 测试消息")
    mode.add_argument("--test-notify", action="store_true", help="按 NOTIFY_CHANNEL 发送测试消息")
    args = parser.parse_args()
    try:
        if args.env_file:
            load_env_file(args.env_file)
        if args.test_telegram:
            telegram_send(f"Sub2API 监控 Telegram 测试消息\n时间：{timestamp()}")
            print("Telegram 测试消息已发送")
            return 0
        if args.test_notify:
            notify_send(f"Sub2API 监控测试消息\n时间：{timestamp()}")
            print(f"{cfg('NOTIFY_CHANNEL').strip().lower() or 'telegram'} 测试消息已发送")
            return 0
        return run_health() if args.health else run_quota()
    except MonitorError as exc:
        print(f"监控执行失败：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
