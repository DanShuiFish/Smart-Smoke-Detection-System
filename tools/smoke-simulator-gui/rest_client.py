"""REST API 客户端 — 设备 CRUD 同步、阈值保存/读取、设备列表拉取"""
from __future__ import annotations

import threading
from typing import Callable

import requests

LogFn = Callable[[str], None]


class RestClient:
    """与后端 Spring Boot REST API 交互（可选，后端在线时才用）"""

    def __init__(self, base_url: str, username: str = "admin", password: str = "admin123",
                 logger: LogFn | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.token: str | None = None
        self._lock = threading.Lock()
        self.online = False

        self._log = logger or (lambda _: None)

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = "Bearer " + self.token
        return h

    def login(self) -> bool:
        """登录获取 token"""
        try:
            resp = requests.post(
                f"{self.base_url}/api/v1/auth/login",
                json={"username": self.username, "password": self.password},
                headers={"Content-Type": "application/json"},
                timeout=5,
            )
            if resp.status_code == 200:
                data = resp.json()
                code = data.get("code")
                inner = data.get("data", {})
                if code == 200 and inner:
                    self.token = inner.get("token") or inner.get("tokenValue") or inner.get("satoken")
                    if self.token:
                        self.online = True
                        self._log(f"后端登录成功 (用户: {self.username})")
                        return True
            self._log(f"后端登录失败: HTTP {resp.status_code}")
            return False
        except requests.ConnectionError:
            self._log("后端不可达 (ConnectionError)，离线模式运行")
            self.online = False
            return False
        except Exception as e:
            self._log(f"后端登录异常: {e}")
            self.online = False
            return False

    def _get(self, path: str) -> dict | list | None:
        if not self.online:
            return None
        try:
            resp = requests.get(f"{self.base_url}{path}", headers=self._headers(), timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == 200:
                    return data.get("data")
            if resp.status_code == 401:
                # Token 过期，尝试重新登录
                self._log("Token 过期，尝试重新登录...")
                if self.login():
                    return self._get(path)  # 重试一次
            return None
        except requests.ConnectionError:
            self.online = False
            self._log("后端连接断开")
            return None
        except Exception as e:
            self._log(f"GET {path} 异常: {e}")
            return None

    def _post(self, path: str, body: dict) -> bool:
        if not self.online:
            return False
        try:
            resp = requests.post(f"{self.base_url}{path}", json=body, headers=self._headers(), timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("code") == 200
            if resp.status_code == 401:
                self._log("Token 过期，重新登录后重试...")
                if self.login():
                    return self._post(path, body)
            self._log(f"POST {path} 失败: HTTP {resp.status_code}")
            return False
        except requests.ConnectionError:
            self.online = False
            self._log("后端连接断开")
            return False
        except Exception as e:
            self._log(f"POST {path} 异常: {e}")
            return False

    def _post_with_body(self, path: str, body: dict) -> dict | None:
        """POST 请求，返回响应 data 字段（dict）或 None"""
        if not self.online:
            return None
        try:
            resp = requests.post(f"{self.base_url}{path}", json=body, headers=self._headers(), timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == 200:
                    return data.get("data")
            return None
        except Exception:
            return None

    def _put(self, path: str, body: dict) -> bool:
        if not self.online:
            return False
        try:
            resp = requests.put(f"{self.base_url}{path}", json=body, headers=self._headers(), timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("code") == 200
            if resp.status_code == 401:
                self._log("Token 过期，重新登录后重试...")
                if self.login():
                    return self._put(path, body)
            self._log(f"PUT {path} 失败: HTTP {resp.status_code}")
            return False
        except requests.ConnectionError:
            self.online = False
            self._log("后端连接断开")
            return False
        except Exception as e:
            self._log(f"PUT {path} 异常: {e}")
            return False

    def _delete(self, path: str) -> bool:
        if not self.online:
            return False
        try:
            resp = requests.delete(f"{self.base_url}{path}", headers=self._headers(), timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("code") == 200
            if resp.status_code == 401:
                self._log("Token 过期，重新登录后重试...")
                if self.login():
                    return self._delete(path)
            # 404 也算正常（资源已不存在）
            if resp.status_code == 404:
                return True
            self._log(f"DELETE {path} 失败: HTTP {resp.status_code}")
            return False
        except requests.ConnectionError:
            self.online = False
            self._log("后端连接断开")
            return False
        except Exception as e:
            self._log(f"DELETE {path} 异常: {e}")
            return False

    # ── 设备列表 ──

    def fetch_devices(self) -> list[dict] | None:
        """从后端拉取所有设备（通过 simulation/status）"""
        return self._get("/api/v1/simulation/status")  # type: ignore[return-value]

    def create_device(self, payload: dict) -> bool:
        """在后端创建设备"""
        return self._post("/api/v1/devices", payload)

    def update_device(self, device_id: int, payload: dict) -> bool:
        """更新后端设备信息"""
        return self._put(f"/api/v1/devices/{device_id}", payload)

    def delete_device(self, device_id: int) -> bool:
        """删除后端设备"""
        return self._delete(f"/api/v1/devices/{device_id}")

    # ── 阈值（走 Simulation 接口，因为 AlertThresholdController 有 bug）──

    def fetch_thresholds(self, page_size: int = 500) -> list[dict]:
        """拉取所有阈值（优先用 AlertThresholdController，失败则返回空）"""
        # AlertThresholdController 有 500 bug，直接返回空，等后续修复
        # 改为按设备逐个查询 Simulation 接口
        return []

    def fetch_device_threshold(self, device_code: str) -> dict | None:
        """通过 SimulationController 获取设备阈值"""
        data = self._get(f"/api/v1/simulation/device/threshold?deviceCode={device_code}")
        return data if isinstance(data, dict) else None

    def save_device_threshold(self, device_code: str, smoke_high: float,
                              smoke_med: float, temp_high: float) -> bool:
        """通过 SimulationController 保存设备阈值"""
        return self._post("/api/v1/simulation/device/threshold", {
            "deviceCode": device_code,
            "smokeHigh": smoke_high,
            "smokeMedium": smoke_med,
            "tempHigh": temp_high,
        })

    def delete_threshold(self, threshold_id: int) -> bool:
        """删除阈值"""
        return self._delete(f"/api/v1/thresholds/{threshold_id}")

    # ── 心跳 ──

    def heartbeat_start(self, device_code: str) -> bool:
        """通知后端模拟器心跳启动"""
        return self._post("/api/v1/simulation/heartbeat/start", {"deviceCode": device_code})

    def heartbeat_stop(self, device_code: str) -> dict | None:
        """通知后端模拟器心跳停止，返回 {offlineAfterSeconds, ...} 或 None"""
        return self._post_with_body("/api/v1/simulation/heartbeat/stop", {"deviceCode": device_code})

    def heartbeat_ttl(self, device_code: str) -> int | None:
        """查询设备 Redis 心跳 Key 剩余 TTL（秒），Key 不存在返回 0"""
        data = self._get(f"/api/v1/simulation/heartbeat/ttl?deviceCode={device_code}")
        if isinstance(data, dict):
            return data.get("ttl")
        return None

    def heartbeat_send(self, device_code: str, bat: int, rssi: int) -> bool:
        """调后端心跳接口"""
        return self._post("/api/v1/simulation/heartbeat", {"deviceCode": device_code, "bat": bat, "rssi": rssi})

    # ── 在线检测 ──

    def health_check(self) -> bool:
        """快速检测后端是否可达"""
        try:
            resp = requests.get(f"{self.base_url}/api/v1/health", timeout=3)
            return resp.status_code == 200
        except Exception:
            return False
