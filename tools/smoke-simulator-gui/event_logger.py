"""事件日志管理器 — 设备级 + 全局，环形缓冲，线程安全"""
from __future__ import annotations

import threading
from collections import deque
from datetime import datetime
from typing import Callable

LogFn = Callable[[str], None]

MAX_DEVICE_LOG = 200
MAX_GLOBAL_LOG = 500


class EventLogger:
    """线程安全的事件日志，支持设备级和全局两个维度"""

    def __init__(self, gui_callback: LogFn | None = None) -> None:
        self._lock = threading.Lock()
        self._device_logs: dict[str, deque[dict]] = {}
        self._global_logs: deque[dict] = deque(maxlen=MAX_GLOBAL_LOG)
        self._gui_callback = gui_callback

    def set_gui_callback(self, cb: LogFn) -> None:
        self._gui_callback = cb

    def _now(self) -> str:
        return datetime.now().strftime("%H:%M:%S")

    def device(self, code: str, level: str, message: str) -> None:
        """记录设备级日志 (level: ok/warn/error/info)"""
        entry = {"time": self._now(), "level": level, "msg": message}
        with self._lock:
            if code not in self._device_logs:
                self._device_logs[code] = deque(maxlen=MAX_DEVICE_LOG)
            self._device_logs[code].appendleft(entry)
        if self._gui_callback:
            self._gui_callback(f"[DEV:{code}] [{level.upper()}] {message}")

    def global_log(self, level: str, message: str) -> None:
        """记录全局事件日志"""
        entry = {"time": self._now(), "level": level, "msg": message}
        with self._lock:
            self._global_logs.appendleft(entry)
        if self._gui_callback:
            self._gui_callback(f"[GLOBAL] [{level.upper()}] {message}")

    def get_device_logs(self, code: str, limit: int = 50) -> list[dict]:
        """获取指定设备的最近 N 条日志"""
        with self._lock:
            dq = self._device_logs.get(code)
            if dq is None:
                return []
            return list(dq)[:limit]

    def get_global_logs(self, limit: int = 100) -> list[dict]:
        """获取全局最近 N 条日志"""
        with self._lock:
            return list(self._global_logs)[:limit]

    def device_log_count(self, code: str) -> int:
        with self._lock:
            dq = self._device_logs.get(code)
            return len(dq) if dq else 0

    def clear_device(self, code: str) -> None:
        with self._lock:
            self._device_logs.pop(code, None)

    def clear_global(self) -> None:
        with self._lock:
            self._global_logs.clear()
