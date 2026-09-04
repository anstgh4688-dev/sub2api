import os
import json
import tempfile
import unittest
from unittest.mock import patch

import monitor


class MonitorTests(unittest.TestCase):
    def test_dingtalk_text_payload_is_sent(self):
        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b'{"errcode": 0, "errmsg": "ok"}'

        endpoint = "https://oapi.dingtalk.com/robot/send?access_token=redacted"
        environment = {"DINGTALK_WEBHOOK_URL": endpoint}
        with patch.dict(os.environ, environment, clear=False), patch.object(monitor, "urlopen", return_value=Response()) as opener:
            monitor.dingtalk_send("[监控告警]\n磁盘使用率：80%")

        request = opener.call_args.args[0]
        self.assertEqual(request.full_url, endpoint)
        self.assertEqual(
            json.loads(request.data.decode("utf-8")),
            {"msgtype": "text", "text": {"content": "[监控告警]\n磁盘使用率：80%"}},
        )

    def test_notify_dispatches_to_dingtalk(self):
        with patch.dict(os.environ, {"NOTIFY_CHANNEL": "dingtalk"}, clear=False), patch.object(monitor, "dingtalk_send") as sender:
            monitor.notify_send("hello")
        sender.assert_called_once_with("hello")

    def test_remaining_percent_and_reset_are_rendered(self):
        account = {
            "name": "codex-main",
            "quota": {
                "5小时额度": {"remaining_percent": 72, "reset_at": "16:05"},
                "7天额度": {"usedPercent": 59, "resetAt": "2026-09-03 10:00"},
            },
        }
        report = monitor.quota_report([account])
        self.assertIn("codex-main", report)
        self.assertIn("剩余 72%", report)
        self.assertIn("剩余 41%", report)
        self.assertIn("下次重置：16:05", report)

    def test_unknown_quota_is_not_faked_as_zero(self):
        report = monitor.quota_report([{"name": "unknown", "quota": {"raw": "not supplied"}}])
        self.assertIn("额度：读取失败", report)
        self.assertNotIn("剩余 0%", report)

    def test_missing_reset_is_reported_and_marks_overall_status_abnormal(self):
        report = monitor.quota_report([{"name": "partial", "quota": {"window": {"remaining_percent": 50}}}])
        self.assertIn("整体状态：存在异常", report)
        self.assertIn("下次重置：未返回", report)

    def test_signal_snapshot_is_parsed_as_quota_window(self):
        account = {
            "name": "signal-account",
            "quota": {
                "signals": {
                    "primary_window.used_percent": "28",
                    "primary_window.limit_window_seconds": "18000",
                    "primary_window.reset_at": "4102444800",
                }
            },
        }
        report = monitor.quota_report([account])
        self.assertIn("5小时额度：剩余 72%", report)
        self.assertIn("下次重置：2100-01-01", report)

    def test_codex_usage_payload_is_parsed_from_management_api_call(self):
        account = {"name": "codex-live", "provider": "codex", "auth_index": "auth-1"}
        payload = {
            "rate_limit": {
                "primary_window": {"used_percent": 28, "limit_window_seconds": 18000, "reset_at": 4102444800},
                "secondary_window": {"used_percent": 59, "limit_window_seconds": 604800, "reset_at": 4102448400},
            }
        }
        with patch.dict(os.environ, {"CPA_BASE_URL": "http://127.0.0.1:8317"}, clear=False), patch.object(monitor, "http_post_json", return_value={"status_code": 200, "body": json.dumps(payload)}):
            result = monitor.fetch_codex_quota("http://127.0.0.1:8317", "management-key", account)
        self.assertEqual(result, payload)
        report = monitor.quota_report([{**account, "quota": result}])
        self.assertIn("5小时额度：剩余 72%", report)
        self.assertIn("7天额度：剩余 41%", report)

    def test_additional_codex_limit_includes_limit_name(self):
        account = {
            "name": "codex-live",
            "quota": {
                "rate_limit": {
                    "primary_window": {
                        "used_percent": 35,
                        "limit_window_seconds": 604800,
                        "reset_at": 4102444800,
                    }
                },
                "additional_rate_limits": [
                    {
                        "limit_name": "GPT-5.3-Codex-Spark",
                        "rate_limit": {
                            "primary_window": {
                                "used_percent": 0,
                                "limit_window_seconds": 18000,
                                "reset_at": 4102448400,
                            },
                            "secondary_window": {
                                "used_percent": 0,
                                "limit_window_seconds": 604800,
                                "reset_at": 4102452000,
                            },
                        },
                    }
                ],
            },
        }
        report = monitor.quota_report([account])
        self.assertIn("7天额度：剩余 65%", report)
        self.assertIn("GPT-5.3-Codex-Spark 5小时额度：剩余 100%", report)
        self.assertIn("GPT-5.3-Codex-Spark 7天额度：剩余 100%", report)

    def test_email_is_redacted_and_secret_is_not_reported(self):
        secret = "management-key-that-must-not-leak"
        account = {"email": "abcdef@example.com", "quota": {"window": {"remaining_percent": 50}}}
        with patch.dict(os.environ, {"CPA_MANAGEMENT_KEY": secret}, clear=False):
            report = monitor.quota_report([account])
        self.assertIn("ab***@example.com", report)
        self.assertNotIn(secret, report)

    def test_split_message_keeps_telegram_limit(self):
        chunks = monitor.split_message("line\n" * 5000)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 3800 for chunk in chunks))

    def test_quota_reports_split_every_twenty_accounts(self):
        accounts = [
            {"name": f"account-{index}", "quota": {"5h": {"remaining_percent": 50}}}
            for index in range(21)
        ]
        reports = monitor.quota_reports(accounts)
        self.assertEqual(len(reports), 2)
        self.assertIn("[CPA账号额度报告 1/2]", reports[0])
        self.assertIn("账号数：21", reports[1])
        self.assertNotIn("account-20", reports[0])
        self.assertIn("account-20", reports[1])

    def test_quota_low_alerts_once_and_recovers(self):
        state = {"events": {}, "counters": {}, "network": {}}
        account = {
            "name": "codex-main",
            "quota": {"5h": {"remaining_percent": 15, "reset_at": "16:05"}},
        }
        environment = {"QUOTA_WARN_PERCENT": "20", "QUOTA_CRITICAL_PERCENT": "10"}
        with patch.dict(os.environ, environment, clear=False):
            alerts = monitor.quota_alerts([account], state)
            self.assertEqual(len(alerts), 1)
            self.assertIn("达到警告阈值", alerts[0])
            self.assertEqual(monitor.quota_alerts([account], state), [])
            recovered = monitor.quota_alerts(
                [{"name": "codex-main", "quota": {"5h": {"remaining_percent": 25, "reset_at": "16:05"}}}],
                state,
            )
        self.assertEqual(len(recovered), 1)
        self.assertTrue(recovered[0].startswith("[监控恢复]"))

    def test_state_write_is_private_and_atomic_result_exists(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"STATE_FILE": os.path.join(directory, "state.json")}, clear=False):
                monitor.write_state({"events": {}, "counters": {}, "network": {}})
                path = os.path.join(directory, "state.json")
                self.assertTrue(os.path.exists(path))
                self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)

    def test_health_alerts_after_three_failures_and_recovers_once(self):
        state = {"events": {}, "counters": {}, "network": {}}
        environment = {
            "DOCKER_CONTAINERS": "",
            "POSTGRES_CONTAINER": "",
            "REDIS_CONTAINER": "",
            "HEALTH_FAILURES": "3",
            "ALERT_SUSTAINED_MINUTES": "10",
        }
        with patch.dict(os.environ, environment, clear=False), patch.object(monitor, "disk_metrics", return_value=(10.0, 10.0)), patch.object(monitor, "cpu_percent", return_value=10.0), patch.object(monitor, "memory_percent", return_value=10.0), patch.object(monitor, "swap_percent", return_value=0.0), patch.object(monitor, "oom_kill_count", return_value=0), patch.object(monitor, "network_error_counters", return_value={"errors": 0, "drops": 0}), patch.object(monitor, "http_health_check", side_effect=monitor.MonitorError("down")) as health:
            self.assertEqual(monitor.host_and_app_checks(state), [])
            self.assertEqual(monitor.host_and_app_checks(state), [])
            alerts = monitor.host_and_app_checks(state)
            self.assertEqual(len(alerts), 3)
            self.assertEqual(health.call_count, 9)
        with patch.dict(os.environ, environment, clear=False), patch.object(monitor, "disk_metrics", return_value=(10.0, 10.0)), patch.object(monitor, "cpu_percent", return_value=10.0), patch.object(monitor, "memory_percent", return_value=10.0), patch.object(monitor, "swap_percent", return_value=0.0), patch.object(monitor, "oom_kill_count", return_value=0), patch.object(monitor, "network_error_counters", return_value={"errors": 0, "drops": 0}), patch.object(monitor, "http_health_check", return_value=0.1):
            recoveries = monitor.host_and_app_checks(state)
        self.assertEqual(len(recoveries), 3)
        self.assertTrue(all(message.startswith("[监控恢复]") for message in recoveries))

    def test_health_latency_alerts_and_recovers(self):
        state = {"events": {}, "counters": {}, "network": {}}
        environment = {
            "DOCKER_CONTAINERS": "",
            "POSTGRES_CONTAINER": "",
            "REDIS_CONTAINER": "",
            "HEALTH_LATENCY_WARN_SECONDS": "3",
            "HEALTH_LATENCY_CRITICAL_SECONDS": "10",
        }
        common = (
            patch.dict(os.environ, environment, clear=False),
            patch.object(monitor, "disk_metrics", return_value=(10.0, 10.0)),
            patch.object(monitor, "cpu_percent", return_value=10.0),
            patch.object(monitor, "memory_percent", return_value=10.0),
            patch.object(monitor, "swap_percent", return_value=0.0),
            patch.object(monitor, "oom_kill_count", return_value=0),
            patch.object(monitor, "network_error_counters", return_value={"errors": 0, "drops": 0}),
        )
        with common[0], common[1], common[2], common[3], common[4], common[5], common[6], patch.object(monitor, "http_health_check", side_effect=[3.5, 0.1, 0.1]):
            alerts = monitor.host_and_app_checks(state)
        self.assertEqual(len(alerts), 1)
        self.assertIn("应用健康接口响应慢：sub2api", alerts[0])
        with common[0], common[1], common[2], common[3], common[4], common[5], common[6], patch.object(monitor, "http_health_check", return_value=0.1):
            recoveries = monitor.host_and_app_checks(state)
        self.assertEqual(len(recoveries), 1)
        self.assertIn("应用健康接口响应已恢复：sub2api", recoveries[0])


if __name__ == "__main__":
    unittest.main()
