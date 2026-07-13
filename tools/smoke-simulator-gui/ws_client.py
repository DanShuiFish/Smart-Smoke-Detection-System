"""WebSocket 客户端 — 连接后端 /ws/alarm，实时接收告警和事件通知"""
from __future__ import annotations

import json
import threading
import time
from typing import Callable

try:
    import websocket
except ImportError:
    websocket = None  # type: ignore[assignment]

LogFn = Callable[[str], None]
EventHandler = Callable[[str, dict], None]  # (event_type, payload)


class WsClient:
    """WebSocket 客户端，自动重连"""

    def __init__(self, base_url: str, ws_path: str = "/ws/alarm",
                 token: str = "", logger: LogFn | None = None) -> None:
        if base_url.startswith("http://"):
            self.ws_url = base_url.replace("http://", "ws://") + ws_path
        elif base_url.startswith("https://"):
            self.ws_url = base_url.replace("https://", "wss://") + ws_path
        else:
            self.ws_url = f"ws://{base_url}{ws_path}"

        self._token = token
        self._ws: websocket.WebSocketApp | None = None
        self._thread: threading.Thread | None = None
        self._running = False
        self._connected = False
        self._lock = threading.Lock()

        self._log = logger or (lambda _: None)
        self._event_handlers: list[EventHandler] = []

    @property
    def connected(self) -> bool:
        return self._connected

    def set_token(self, token: str) -> None:
        self._token = token

    def on_event(self, handler: EventHandler) -> None:
        """注册事件回调 handler(event_type, payload)"""
        self._event_handlers.append(handler)

    def start(self) -> None:
        if websocket is None:
            self._log("websocket-client 未安装，WebSocket 功能不可用")
            return
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._ws:
            try:
                self._ws.close()
            except Exception:
                pass
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None
        self._connected = False

    def _run_loop(self) -> None:
        while self._running:
            try:
                url = self.ws_url
                if self._token:
                    url += f"?satoken={self._token}"
                self._ws = websocket.WebSocketApp(
                    url,
                    on_open=self._on_open,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close,
                )
                # ping_interval=20s 匹配后端超时配置，减少断连
                self._ws.run_forever(ping_interval=20, ping_timeout=8)
            except Exception as e:
                self._log(f"WebSocket 异常: {e}")

            # 只有意外断开才重连，手动 stop 不重连
            if self._running:
                time.sleep(3)
            else:
                break

    def _on_open(self, ws) -> None:
        with self._lock:
            self._connected = True
        self._log("WebSocket 已连接")
        self._dispatch("ws_connected", {})

    def _on_message(self, ws, message: str) -> None:
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            return

        kind = payload.get("kind", "")
        if kind == "alarm":
            self._dispatch("alarm", payload)
        elif kind == "device_online":
            self._dispatch("device_online", payload)
        elif kind == "device_offline":
            self._dispatch("device_offline", payload)
        elif kind == "data_changed":
            self._dispatch("data_changed", payload)
        elif kind == "broadcast":
            self._dispatch("broadcast", payload)
        else:
            # 旧格式兼容: alarmType / alarmTypeText
            alarm_type = payload.get("alarmType", "")
            if alarm_type:
                self._dispatch("alarm", payload)

    def _on_error(self, ws, error) -> None:
        self._log(f"WebSocket 错误: {error}")

    def _on_close(self, ws, close_status_code, close_msg) -> None:
        with self._lock:
            was_connected = self._connected
            self._connected = False
        if was_connected:
            self._dispatch("ws_disconnected", {})
        self._log(f"WebSocket 已关闭 (code={close_status_code})")

    def _dispatch(self, event_type: str, payload: dict) -> None:
        for handler in self._event_handlers:
            try:
                handler(event_type, payload)
            except Exception:
                pass
