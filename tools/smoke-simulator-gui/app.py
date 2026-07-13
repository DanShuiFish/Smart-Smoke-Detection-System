"""智慧烟感模拟器 GUI v2.1 — 可滚动中心面板 + 智能双向同步 + 选择稳定"""
from __future__ import annotations

import json
import sys
import tkinter as tk
from tkinter import messagebox, ttk
from pathlib import Path

from simulator_core import SimulatorConfig, SmokeSimulatorCore
from event_logger import EventLogger
from device_state import DeviceStateManager


if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS)  # type: ignore[attr-defined]
else:
    BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
DEVICES_PATH = BASE_DIR / "devices.json"


# ═══════════════════════════════════════════════════════════════════
# 可滚动框架（用于中间面板）
# ═══════════════════════════════════════════════════════════════════

class ScrollableFrame(ttk.Frame):
    """带垂直滚动条的容器，内部 widget 超出时自动滚动"""

    def __init__(self, parent, *args, **kwargs) -> None:
        super().__init__(parent, *args, **kwargs)
        self.canvas = tk.Canvas(self, highlightthickness=0, bg="#1e293b")
        self.scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.inner = ttk.Frame(self.canvas)

        self.inner.bind("<Configure>", lambda e: self.canvas.configure(
            scrollregion=self.canvas.bbox("all")))
        self.canvas_window = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")

        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.scrollbar.grid(row=0, column=1, sticky="ns")
        self.rowconfigure(0, weight=1)
        self.columnconfigure(0, weight=1)

        # 让 inner 宽度跟随 canvas
        self.canvas.bind("<Configure>", self._on_canvas_configure)
        # 鼠标滚轮支持
        self.canvas.bind("<Enter>", self._bind_mousewheel)
        self.canvas.bind("<Leave>", self._unbind_mousewheel)

    def _on_canvas_configure(self, event) -> None:
        self.canvas.itemconfig(self.canvas_window, width=event.width)

    def _bind_mousewheel(self, event) -> None:
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)

    def _unbind_mousewheel(self, event) -> None:
        self.canvas.unbind_all("<MouseWheel>")

    def _on_mousewheel(self, event) -> None:
        self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")


# ═══════════════════════════════════════════════════════════════════
# 设备编辑对话框
# ═══════════════════════════════════════════════════════════════════

class DeviceEditorDialog(tk.Toplevel):
    """新增/编辑设备弹窗"""

    def __init__(self, master: tk.Misc, title: str, device: dict | None = None) -> None:
        super().__init__(master)
        self.title(title)
        self.resizable(False, False)
        self.transient(master)
        self.grab_set()
        self.result: dict | None = None

        self.vars = {
            "device_code": tk.StringVar(value=device.get("device_code", "") if device else ""),
            "device_name": tk.StringVar(value=device.get("device_name", "") if device else ""),
            "building": tk.StringVar(value=device.get("building", "") if device else ""),
            "floor": tk.StringVar(value=device.get("floor", "") if device else ""),
            "room": tk.StringVar(value=device.get("room", "") if device else ""),
        }

        container = ttk.Frame(self, padding=12)
        container.grid(sticky="nsew")

        labels = [
            ("device_code", "设备编码 *"),
            ("device_name", "设备名称 *"),
            ("building", "楼栋"),
            ("floor", "楼层"),
            ("room", "房间"),
        ]
        for row, (key, text) in enumerate(labels):
            ttk.Label(container, text=text).grid(row=row, column=0, sticky="w", padx=(0, 8), pady=6)
            ttk.Entry(container, textvariable=self.vars[key], width=28).grid(row=row, column=1, sticky="ew", pady=6)

        btn_frame = ttk.Frame(container)
        btn_frame.grid(row=len(labels), column=0, columnspan=2, sticky="e", pady=(12, 0))
        ttk.Button(btn_frame, text="取消", command=self.destroy).pack(side="right", padx=(8, 0))
        ttk.Button(btn_frame, text="保存", command=self.on_save).pack(side="right")

        self.bind("<Return>", lambda _: self.on_save())
        self.bind("<Escape>", lambda _: self.destroy())

    def on_save(self) -> None:
        payload = {k: v.get().strip() for k, v in self.vars.items()}
        if not payload["device_code"]:
            messagebox.showwarning("提示", "设备编码不能为空", parent=self)
            return
        if not payload["device_name"]:
            messagebox.showwarning("提示", "设备名称不能为空", parent=self)
            return
        self.result = payload
        self.destroy()


# ═══════════════════════════════════════════════════════════════════
# 主窗口
# ═══════════════════════════════════════════════════════════════════

class SmokeSimulatorApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("智慧烟感模拟器 GUI v2.1")
        self.root.geometry("1400x860")
        self.root.minsize(1100, 700)

        # 核心引擎
        self.core = SmokeSimulatorCore(logger=self.on_core_log)
        self.logger = self.core.event_logger

        # 加载配置
        self.config_data = self._load_json(CONFIG_PATH)
        self.devices = self._load_json(DEVICES_PATH)

        # 标记：启动后自动同步后端设备
        self._initial_sync_done = False

        # 提取配置
        mqtt_cfg = self.config_data["mqtt"]
        backend_cfg = self.config_data.get("backend", {})
        defaults = self.config_data["defaults"]
        ui_cfg = self.config_data["ui"]

        # ── MQTT 变量 ──
        self.broker_var = tk.StringVar(value=mqtt_cfg["broker"])
        self.port_var = tk.StringVar(value=str(mqtt_cfg["port"]))
        self.username_var = tk.StringVar(value=mqtt_cfg["username"])
        self.password_var = tk.StringVar(value=mqtt_cfg["password"])

        # ── 后端变量 ──
        self.backend_url_var = tk.StringVar(value=backend_cfg.get("url", "http://localhost:8080"))
        self.backend_user_var = tk.StringVar(value=backend_cfg.get("username", "admin"))
        self.backend_pass_var = tk.StringVar(value=backend_cfg.get("password", "admin123"))

        # ── 状态变量 ──
        self.mqtt_status_var = tk.StringVar(value="未连接")
        self.ws_status_var = tk.StringVar(value="WebSocket: --")
        self.backend_status_var = tk.StringVar(value="后端: --")

        # ── 模式变量 ──
        self.use_random_var = tk.BooleanVar(value=defaults.get("use_random", True))
        self.mode_var = tk.StringVar(value=ui_cfg.get("last_mode", "normal"))

        # ── 参数变量 ──
        self.smoke_var = tk.StringVar(value=str(defaults.get("smoke", 0.02)))
        self.temp_var = tk.StringVar(value=str(defaults.get("temp", 25.0)))
        self.humi_var = tk.StringVar(value=str(defaults.get("humi", 45.0)))
        self.bat_var = tk.StringVar(value=str(defaults.get("bat", 95)))
        self.rssi_var = tk.StringVar(value=str(defaults.get("rssi", -40)))
        self.normal_interval_var = tk.StringVar(value=str(defaults.get("normal_interval", 5)))
        self.heartbeat_interval_var = tk.StringVar(value=str(defaults.get("heartbeat_interval", 10)))
        self.offline_timeout_var = tk.StringVar(value=str(defaults.get("offline_timeout", 35)))

        # ── 阈值变量 ──
        self.thr_smoke_high_var = tk.StringVar(value="0.30")
        self.thr_smoke_med_var = tk.StringVar(value="0.15")
        self.thr_temp_high_var = tk.StringVar(value="65")

        # ── 选择状态 ──
        self._device_check_vars: dict[str, tk.BooleanVar] = {}
        self._active_device_code: str = ""
        self.continuous_running = False
        self._refreshing_tree = False  # 防止刷新时触发 selection 事件
        self._busy = False  # 防止重复点击导致卡死

        # ── 每设备独立配置 ── {device_code: {smoke_high, smoke_med, temp_high, hb_interval, data_interval, smoke_slider, temp_slider, humi_slider}}
        self._device_configs: dict[str, dict] = {}

        # 全局日志不自动滚底（跟踪用户是否手动滚上去了）
        self._global_log_user_scrolled = False

        # ── UI 引用 ──
        self.device_tree: ttk.Treeview | None = None
        self.device_detail_var = tk.StringVar(value="未选择设备")
        self.global_log_text: tk.Text | None = None
        self.device_log_text: tk.Text | None = None
        self.center_inner: ttk.Frame | None = None  # 可滚动容器内部

        # ── 构建界面 ──
        self.build_ui()

        # 启动时先显示空状态，等待后端同步
        self.center_empty.configure(text="📡 正在连接后端并同步设备列表...\n\n请稍候")
        self._log_global("info", "正在连接后端...")

        # ── 定时刷新 ──
        self.root.after(500, self.periodic_refresh)
        self.root.after(1000, self.update_status_bar)

        # ── 自动连接后端并同步设备 ──
        self.root.after(300, self.try_connect_backend)

        # 不立即显示本地设备，等后端同步完成后再刷新
        # restore_last_selection 由 try_connect_backend 在同步完成后调用

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self._log_global("info", "图形界面 v2.1 已启动")

    # ═══════════════════════════════════════════════════════════════
    # 工具
    # ═══════════════════════════════════════════════════════════════

    @staticmethod
    def _load_json(path: Path):
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def _save_json(path: Path, data) -> None:
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def on_core_log(self, message: str) -> None:
        self._log_global("info", message)

    def _log_global(self, level: str, message: str) -> None:
        self.logger.global_log(level, message)
        self.root.after(0, self._flush_global_log)

    def _log_device(self, code: str, level: str, message: str) -> None:
        self.logger.device(code, level, message)
        self.root.after(0, self._flush_device_log)

    # ═══════════════════════════════════════════════════════════════
    # 构建 UI
    # ═══════════════════════════════════════════════════════════════

    def build_ui(self) -> None:
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)

        # ── 顶部连接栏（紧凑布局）──
        top_frame = ttk.Frame(self.root, padding=(8, 4))
        top_frame.grid(row=0, column=0, sticky="ew")
        for c in range(10):
            top_frame.columnconfigure(c, weight=1 if c in (1, 3, 5, 7) else 0)

        ttk.Label(top_frame, text="Broker").grid(row=0, column=0, sticky="w", padx=2)
        ttk.Entry(top_frame, textvariable=self.broker_var, width=14).grid(row=0, column=1, sticky="ew", padx=2)
        ttk.Label(top_frame, text="Port").grid(row=0, column=2, sticky="w", padx=2)
        ttk.Entry(top_frame, textvariable=self.port_var, width=5).grid(row=0, column=3, sticky="w", padx=2)
        ttk.Button(top_frame, text="测试连接", command=self.test_mqtt_connection).grid(row=0, column=4, padx=3)
        ttk.Button(top_frame, text="连接/断开", command=self.toggle_mqtt_connect).grid(row=0, column=5, padx=3)
        ttk.Label(top_frame, textvariable=self.mqtt_status_var, foreground="#1d4ed8",
                  font=("", 9)).grid(row=0, column=6, padx=4, sticky="w")

        ttk.Label(top_frame, text="后端").grid(row=1, column=0, sticky="w", padx=2, pady=(3, 0))
        ttk.Entry(top_frame, textvariable=self.backend_url_var, width=22).grid(row=1, column=1, columnspan=2, sticky="ew", padx=2, pady=(3, 0))
        ttk.Label(top_frame, textvariable=self.backend_status_var, foreground="#059669",
                  font=("", 9)).grid(row=1, column=3, padx=4, pady=(3, 0), sticky="w")
        ttk.Label(top_frame, textvariable=self.ws_status_var, foreground="#2563eb",
                  font=("", 9)).grid(row=1, column=4, columnspan=2, padx=4, pady=(3, 0), sticky="w")
        ttk.Button(top_frame, text="从后端同步设备", command=self.sync_devices_from_backend).grid(
            row=1, column=6, padx=2, pady=(3, 0), sticky="ew")
        ttk.Button(top_frame, text="🔄 刷新状态", command=self.refresh_device_status).grid(
            row=1, column=7, padx=2, pady=(3, 0), sticky="ew")

        # ── 三栏主体 ──
        main = ttk.Panedwindow(self.root, orient="horizontal")
        main.grid(row=1, column=0, sticky="nsew", padx=6, pady=(4, 0))
        self.root.rowconfigure(1, weight=1)

        left_panel = ttk.Frame(main, padding=2)
        center_panel = ttk.Frame(main, padding=2)
        right_panel = ttk.Frame(main, padding=2)
        main.add(left_panel, weight=20)
        main.add(center_panel, weight=50)
        main.add(right_panel, weight=22)

        self._build_left_panel(left_panel)
        self._build_center_panel(center_panel)
        self._build_right_panel(right_panel)

        # ── 状态栏 ──
        status_bar = ttk.Frame(self.root, padding=(10, 3))
        status_bar.grid(row=2, column=0, sticky="ew")
        self.sb_total_var = tk.StringVar(value="设备: 0")
        self.sb_online_var = tk.StringVar(value="在线: 0")
        self.sb_offline_var = tk.StringVar(value="离线: 0")
        self.sb_sync_var = tk.StringVar(value="刷新: --")
        ttk.Label(status_bar, textvariable=self.sb_total_var, font=("", 9)).pack(side="left", padx=(0, 12))
        ttk.Label(status_bar, textvariable=self.sb_online_var, font=("", 9), foreground="#22c55e").pack(side="left", padx=(0, 12))
        ttk.Label(status_bar, textvariable=self.sb_offline_var, font=("", 9), foreground="#ef4444").pack(side="left", padx=(0, 12))
        ttk.Label(status_bar, textvariable=self.sb_sync_var, font=("", 9), foreground="#64748b").pack(side="left")

    # ── 左侧：设备清单 ──

    def _build_left_panel(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(3, weight=1)

        hdr = ttk.Frame(parent)
        hdr.grid(row=0, column=0, sticky="ew", pady=(0, 2))
        ttk.Label(hdr, text="📡 设备清单", font=("", 10, "bold")).pack(side="left")
        ttk.Button(hdr, text="+ 新增", command=self.open_add_device).pack(side="right")

        self.dev_search_var = tk.StringVar()
        search_frame = ttk.Frame(parent)
        search_frame.grid(row=1, column=0, sticky="ew", pady=(0, 2))
        ttk.Entry(search_frame, textvariable=self.dev_search_var).pack(side="left", fill="x", expand=True)
        self.dev_search_var.trace_add("write", lambda *a: self._safe_refresh_tree())

        toolbar = ttk.Frame(parent)
        toolbar.grid(row=2, column=0, sticky="ew", pady=(0, 2))
        ttk.Button(toolbar, text="全选", command=self.select_all_devices).pack(side="left", padx=(0, 3))
        ttk.Button(toolbar, text="清除", command=self.deselect_all_devices).pack(side="left", padx=(0, 3))
        self.sel_count_var = tk.StringVar(value="已选: 0")
        ttk.Label(toolbar, textvariable=self.sel_count_var, font=("", 8), foreground="#64748b").pack(side="right")

        tree_frame = ttk.Frame(parent)
        tree_frame.grid(row=3, column=0, sticky="nsew")
        parent.rowconfigure(3, weight=1)
        tree_frame.columnconfigure(0, weight=1)
        tree_frame.rowconfigure(0, weight=1)

        self.device_tree = ttk.Treeview(
            tree_frame, columns=("check", "code", "name"),
            show="headings", height=14,
        )
        self.device_tree.heading("check", text="☑")
        self.device_tree.heading("code", text="编码")
        self.device_tree.heading("name", text="名称")
        self.device_tree.column("check", width=30, anchor="center")
        self.device_tree.column("code", width=95, anchor="center")
        self.device_tree.column("name", width=110, anchor="w")
        self.device_tree.grid(row=0, column=0, sticky="nsew")
        self.device_tree.bind("<<TreeviewSelect>>", self.on_device_select)
        self.device_tree.bind("<Button-1>", self.on_tree_click)

        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.device_tree.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.device_tree.configure(yscrollcommand=scrollbar.set)

        btn_row = ttk.Frame(parent)
        btn_row.grid(row=4, column=0, sticky="ew", pady=(2, 0))
        ttk.Button(btn_row, text="编辑", command=self.open_edit_device).pack(side="left", padx=(0, 3))
        ttk.Button(btn_row, text="删除", command=self.delete_device).pack(side="left")

    # ── 中间：可滚动设备控制面板 ──

    def _build_center_panel(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(0, weight=1)

        # 空状态提示
        self.center_empty = ttk.Label(parent, text="📡 选择一台设备开始模拟\n\n"
                                      "点击左侧设备清单中的设备查看独立控制面板",
                                      font=("", 11), foreground="#64748b", justify="center")
        self.center_empty.grid(row=0, column=0, sticky="n", pady=40)

        # 可滚动容器（选中设备后才显示）
        self.center_scroll = ScrollableFrame(parent)
        self.center_inner = self.center_scroll.inner
        self.center_inner.columnconfigure(0, weight=1)

        # ── 设备信息卡片 ──
        self.info_card = ttk.LabelFrame(self.center_inner, text="📋 设备信息", padding=8)
        self.dev_info_var = tk.StringVar(value="未选择设备")
        ttk.Label(self.info_card, textvariable=self.dev_info_var, font=("", 9), justify="left").grid(sticky="w")

        # ── 数据模拟卡片 ──
        self.sim_card = ttk.LabelFrame(self.center_inner, text="🎮 数据模拟", padding=8)

        preset_frame = ttk.Frame(self.sim_card)
        preset_frame.grid(row=0, column=0, columnspan=3, sticky="ew", pady=(0, 6))
        presets = [
            ("🟢 正常", 0.03, 25, 50),
            ("🟡 轻度", 0.18, 62, 30),
            ("🔴 火警", 0.35, 68, 20),
            ("🚨 严重", 0.60, 85, 15),
        ]
        for i, (label, s, t, h) in enumerate(presets):
            ttk.Button(preset_frame, text=label,
                       command=lambda sv=s, tv=t, hv=h: self.apply_preset(sv, tv, hv)).pack(side="left", padx=(0, 4))

        self.smoke_slider_var = tk.IntVar(value=35)
        self.temp_slider_var = tk.IntVar(value=68)
        self.smoke_label_var = tk.StringVar(value="0.35 火警")
        self.temp_label_var = tk.StringVar(value="68°C")

        r = 1
        ttk.Label(self.sim_card, text="烟雾", width=5).grid(row=r, column=0, sticky="w")
        ttk.Scale(self.sim_card, from_=0, to=100, variable=self.smoke_slider_var,
                  command=self._on_smoke_slider).grid(row=r, column=1, sticky="ew", padx=4)
        ttk.Label(self.sim_card, textvariable=self.smoke_label_var, width=11, anchor="e",
                  font=("", 9, "bold"), foreground="#22c55e").grid(row=r, column=2, padx=(4, 0))
        self.sim_card.columnconfigure(1, weight=1)

        r = 2
        ttk.Label(self.sim_card, text="温度", width=5).grid(row=r, column=0, sticky="w", pady=3)
        ttk.Scale(self.sim_card, from_=0, to=100, variable=self.temp_slider_var,
                  command=self._on_temp_slider).grid(row=r, column=1, sticky="ew", padx=4, pady=3)
        ttk.Label(self.sim_card, textvariable=self.temp_label_var, width=11, anchor="e",
                  font=("", 9, "bold"), foreground="#22c55e").grid(row=r, column=2, padx=(4, 0), pady=3)

        r = 3
        ttk.Label(self.sim_card, text="湿度", width=5).grid(row=r, column=0, sticky="w")
        self.humi_slider_var = tk.IntVar(value=20)
        ttk.Scale(self.sim_card, from_=0, to=100, variable=self.humi_slider_var).grid(row=r, column=1, sticky="ew", padx=4)
        self.humi_label_var = tk.StringVar(value="20%")
        ttk.Label(self.sim_card, textvariable=self.humi_label_var, width=11, anchor="e",
                  font=("", 9, "bold"), foreground="#22c55e").grid(row=r, column=2, padx=(4, 0))

        btn_row = ttk.Frame(self.sim_card)
        btn_row.grid(row=4, column=0, columnspan=3, sticky="ew", pady=(8, 0))
        ttk.Button(btn_row, text="📤 发送一次", command=self.send_current_once).pack(side="left", padx=(0, 6))
        self.batch_cnt_var = tk.StringVar(value="批量(0)")
        ttk.Button(btn_row, textvariable=self.batch_cnt_var, command=self.batch_send_selected).pack(side="left", padx=(0, 6))
        self.continuous_btn_var = tk.StringVar(value="🔄 连续发送")
        ttk.Button(btn_row, textvariable=self.continuous_btn_var, command=self.toggle_continuous).pack(side="left")

        # ── 设备仿真卡片（心跳 + 数据同时自动发送）──
        self.hb_card = ttk.LabelFrame(self.center_inner, text="💓 设备仿真（心跳 + 数据自动上报）", padding=8)
        self.hb_card.columnconfigure(1, weight=1)

        hb_top = ttk.Frame(self.hb_card)
        hb_top.grid(row=0, column=0, columnspan=3, sticky="ew")
        ttk.Label(hb_top, text="心跳间隔(s)").pack(side="left", padx=(0, 4))
        self.hb_interval_var = tk.StringVar(value="10")
        ttk.Entry(hb_top, textvariable=self.hb_interval_var, width=5).pack(side="left")
        ttk.Label(hb_top, text="  数据间隔(s)").pack(side="left", padx=(8, 4))
        self.data_interval_var = tk.StringVar(value="5")
        ttk.Entry(hb_top, textvariable=self.data_interval_var, width=5).pack(side="left")
        self.hb_status_var = tk.StringVar(value="○ 仿真已停止")
        ttk.Label(hb_top, textvariable=self.hb_status_var, font=("", 9), foreground="#64748b").pack(side="right")

        btn_hb_row = ttk.Frame(self.hb_card)
        btn_hb_row.grid(row=1, column=0, columnspan=3, sticky="ew", pady=(6, 0))
        self.hb_start_btn_var = tk.StringVar(value="▶ 启动仿真")
        self.hb_start_btn = ttk.Button(btn_hb_row, textvariable=self.hb_start_btn_var, command=self.start_heartbeat)
        self.hb_start_btn.pack(side="left", padx=(0, 6))
        self.hb_stop_btn = ttk.Button(btn_hb_row, text="⏹ 停止仿真", command=self.stop_heartbeat)
        self.hb_stop_btn.pack(side="left")

        # ── 阈值卡片 ──
        self.thr_card = ttk.LabelFrame(self.center_inner, text="⚙ 阈值配置", padding=8)

        thr_grid = ttk.Frame(self.thr_card)
        thr_grid.grid(row=0, column=0, sticky="ew")
        ttk.Label(thr_grid, text="烟雾HIGH").grid(row=0, column=0, sticky="w", padx=(0, 4), pady=2)
        ttk.Entry(thr_grid, textvariable=self.thr_smoke_high_var, width=7).grid(row=0, column=1, padx=4, pady=2)
        ttk.Label(thr_grid, text="mg/m³").grid(row=0, column=2, sticky="w", pady=2)
        ttk.Label(thr_grid, text="  烟雾MED").grid(row=0, column=3, sticky="w", padx=(8, 4), pady=2)
        ttk.Entry(thr_grid, textvariable=self.thr_smoke_med_var, width=7).grid(row=0, column=4, padx=4, pady=2)
        ttk.Label(thr_grid, text="mg/m³").grid(row=0, column=5, sticky="w", pady=2)
        ttk.Label(thr_grid, text="  温度HIGH").grid(row=0, column=6, sticky="w", padx=(8, 4), pady=2)
        ttk.Entry(thr_grid, textvariable=self.thr_temp_high_var, width=7).grid(row=0, column=7, padx=4, pady=2)
        ttk.Label(thr_grid, text="°C").grid(row=0, column=8, sticky="w", pady=2)

        ttk.Button(self.thr_card, text="💾 保存阈值到数据库", command=self.save_thresholds).grid(
            row=1, column=0, sticky="ew", pady=(6, 0))

        # ── 设备日志卡片 ──
        self.dev_log_card = ttk.LabelFrame(self.center_inner, text="📜 设备日志", padding=8)
        self.dev_log_card.columnconfigure(0, weight=1)
        self.dev_log_card.rowconfigure(0, weight=1)

        self.device_log_text = tk.Text(self.dev_log_card, wrap="word", state="disabled", height=5,
                                       font=("Cascadia Code", 9), bg="#0f172a", fg="#e2e8f0")
        self.device_log_text.grid(row=0, column=0, sticky="nsew")
        dev_scroll = ttk.Scrollbar(self.dev_log_card, orient="vertical", command=self.device_log_text.yview)
        dev_scroll.grid(row=0, column=1, sticky="ns")
        self.device_log_text.configure(yscrollcommand=dev_scroll.set)

        # 在 center_inner 内排列卡片
        self.info_card.grid(row=0, column=0, sticky="ew", pady=(0, 6))
        self.sim_card.grid(row=1, column=0, sticky="ew", pady=(0, 6))
        self.hb_card.grid(row=2, column=0, sticky="ew", pady=(0, 6))
        self.thr_card.grid(row=3, column=0, sticky="ew", pady=(0, 6))
        self.dev_log_card.grid(row=4, column=0, sticky="nsew", pady=(0, 6))
        self.center_inner.rowconfigure(4, weight=1)

    # ── 右侧：全局事件 ──

    def _build_right_panel(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(1, weight=1)

        hdr = ttk.Frame(parent)
        hdr.grid(row=0, column=0, sticky="ew", pady=(0, 2))
        ttk.Label(hdr, text="📢 全局事件", font=("", 10, "bold")).pack(side="left")
        ttk.Button(hdr, text="清空", command=self._clear_global_log).pack(side="right")

        self.global_log_text = tk.Text(parent, wrap="word", state="disabled",
                                       font=("Cascadia Code", 9), bg="#0f172a", fg="#e2e8f0")
        self.global_log_text.grid(row=1, column=0, sticky="nsew")
        gl_scroll = ttk.Scrollbar(parent, orient="vertical", command=self.global_log_text.yview)
        gl_scroll.grid(row=1, column=1, sticky="ns")
        self.global_log_text.configure(yscrollcommand=gl_scroll.set)

        for tag, color in [("ok", "#22c55e"), ("warn", "#f59e0b"), ("error", "#ef4444"),
                           ("info", "#94a3b8"), ("debug", "#64748b")]:
            self.global_log_text.tag_configure(tag, foreground=color)

    # ═══════════════════════════════════════════════════════════════
    # 设备列表渲染（修复选择跳变问题）
    # ═══════════════════════════════════════════════════════════════

    def _safe_refresh_tree(self) -> None:
        """安全刷新：保留选择状态和选中设备"""
        if self.device_tree is None:
            return
        self._refreshing_tree = True

        # 保存选择
        sel = self.device_tree.selection()
        saved_sel = sel[0] if sel else self._active_device_code
        # 保存勾选状态
        saved_checks = {code: var.get() for code, var in self._device_check_vars.items()}

        try:
            self.refresh_device_tree()
        finally:
            # 恢复选择
            if saved_sel and any(d["device_code"] == saved_sel for d in self.devices):
                self.device_tree.selection_set(saved_sel)
                self.device_tree.focus(saved_sel)
            # 恢复勾选
            for code, val in saved_checks.items():
                if code in self._device_check_vars:
                    self._device_check_vars[code].set(val)

            self._refreshing_tree = False
        self._update_sel_count()

    def refresh_device_tree(self) -> None:
        if self.device_tree is None:
            return

        for item in self.device_tree.get_children():
            self.device_tree.delete(item)

        query = (self.dev_search_var.get() or "").lower()
        for device in self.devices:
            code = device["device_code"]
            name = device.get("device_name", code)
            if query and query not in code.lower() and query not in name.lower():
                continue

            if code not in self._device_check_vars:
                self._device_check_vars[code] = tk.BooleanVar(value=False)

            state = self.core.state_manager.get(code)
            online = state.online if state else False
            checked = "☑" if self._device_check_vars[code].get() else "☐"
            prefix = "●" if online else "○"
            display_code = f"{prefix} {code}"

            self.device_tree.insert(
                "", "end", iid=code,
                values=(checked, display_code, name),
                tags=("online" if online else "offline",),
            )

        self.device_tree.tag_configure("online", foreground="#22c55e")
        self.device_tree.tag_configure("offline", foreground="#ef4444")
        self._update_sel_count()

    def _update_sel_count(self) -> None:
        count = sum(1 for v in self._device_check_vars.values() if v.get())
        self.sel_count_var.set(f"已选: {count}")
        self.batch_cnt_var.set(f"批量({count})")
        # 更新仿真按钮文字
        if count > 1:
            self.hb_start_btn_var.set(f"▶ 启动仿真({count}台)")
        else:
            self.hb_start_btn_var.set("▶ 启动仿真")

    def restore_last_selection(self) -> None:
        if not self.devices or self.device_tree is None:
            return
        codes = [d["device_code"] for d in self.devices]
        last = self.config_data.get("ui", {}).get("last_device_code", "")
        code = last if last in codes else self.devices[0]["device_code"]
        self._active_device_code = code
        self.device_tree.selection_set(code)
        self.device_tree.focus(code)
        self._show_device_detail(code)
        self._show_center_panel()

    def on_device_select(self, event=None) -> None:
        if self.device_tree is None or self._refreshing_tree:
            return
        sel = self.device_tree.selection()
        if not sel:
            return
        code = sel[0]
        if code == self._active_device_code:
            return  # 同一设备，不重复刷新

        # 保存当前设备的配置
        self._save_device_config(self._active_device_code)

        # 切换到新设备
        self._active_device_code = code
        self._load_device_config(code)
        self._show_device_detail(code)
        self._show_center_panel()

        # 从后端拉取该设备的阈值
        self._run_in_thread(lambda: self._fetch_thresholds_for_device(code), "")

    def _save_device_config(self, code: str) -> None:
        """保存当前设备的独立配置"""
        if not code:
            return
        self._device_configs[code] = {
            "smoke_high": self.thr_smoke_high_var.get(),
            "smoke_med": self.thr_smoke_med_var.get(),
            "temp_high": self.thr_temp_high_var.get(),
            "hb_interval": self.hb_interval_var.get(),
            "data_interval": self.data_interval_var.get(),
            "smoke_slider": self.smoke_slider_var.get(),
            "temp_slider": self.temp_slider_var.get(),
            "humi_slider": self.humi_slider_var.get(),
        }

    def _load_device_config(self, code: str) -> None:
        """加载设备的独立配置，没有则用默认值"""
        cfg = self._device_configs.get(code, {})
        self.thr_smoke_high_var.set(cfg.get("smoke_high", "0.30"))
        self.thr_smoke_med_var.set(cfg.get("smoke_med", "0.15"))
        self.thr_temp_high_var.set(cfg.get("temp_high", "65"))
        self.hb_interval_var.set(cfg.get("hb_interval", "10"))
        self.data_interval_var.set(cfg.get("data_interval", "5"))
        self.smoke_slider_var.set(int(cfg.get("smoke_slider", 35)))
        self.temp_slider_var.set(int(cfg.get("temp_slider", 68)))
        self.humi_slider_var.set(int(cfg.get("humi_slider", 20)))
        self._on_smoke_slider()
        self._on_temp_slider()
        self.humi_label_var.set(f"{self.humi_slider_var.get()}%")

    def _fetch_thresholds_for_device(self, code: str) -> None:
        """通过 SimulationController 接口拉取设备阈值"""
        try:
            if self.core.rest_client is None or not self.core.rest_client.online:
                self._init_rest_client()
            rc = self.core.rest_client
            if rc is None or not rc.online:
                return
            data = rc.fetch_device_threshold(code)
            if not data:
                return
            sh = data.get("smokeHigh")
            sm = data.get("smokeMedium")
            th = data.get("tempHigh")
            if sh is not None:
                self.root.after(0, lambda: self.thr_smoke_high_var.set(str(sh)))
            if sm is not None:
                self.root.after(0, lambda: self.thr_smoke_med_var.set(str(sm)))
            if th is not None:
                self.root.after(0, lambda: self.thr_temp_high_var.set(str(th)))
        except Exception:
            pass

    def on_tree_click(self, event) -> None:
        if self.device_tree is None:
            return
        region = self.device_tree.identify_region(event.x, event.y)
        if region != "cell":
            return
        column = self.device_tree.identify_column(event.x)
        if column != "#1":
            return
        item = self.device_tree.identify_row(event.y)
        if not item:
            return
        var = self._device_check_vars.get(item)
        if var is not None:
            var.set(not var.get())
            self._safe_refresh_tree()

    def _show_center_panel(self) -> None:
        self.center_empty.grid_remove()
        self.center_scroll.grid(row=0, column=0, sticky="nsew")

    def _show_device_detail(self, code: str) -> None:
        dev = self._find_device(code)
        if not dev:
            self.dev_info_var.set("未选择设备")
            return
        state = self.core.state_manager.get(code)
        online_str = "● 在线" if (state and state.online) else "○ 离线"
        last_hb = state.last_heartbeat_ts if state else 0
        import datetime
        last_hb_str = datetime.datetime.fromtimestamp(last_hb).strftime("%H:%M:%S") if last_hb else "--"

        self.dev_info_var.set(
            f"编码: {dev['device_code']}    名称: {dev.get('device_name', '--')}    状态: {online_str}\n"
            f"位置: {dev.get('building', '')} / {dev.get('floor', '')} / {dev.get('room', '')}\n"
            f"电量: {(state and state.battery) or '--'}%    信号: {(state and state.rssi) or '--'} dBm    "
            f"最后心跳: {last_hb_str}    超时阈值: {dev.get('heartbeat_timeout', 30)}s"
        )

        hb_running = state.heartbeat_running if state else False
        data_running = state.data_running if state else False
        if hb_running and data_running:
            int_hb = self.hb_interval_var.get() or "10"
            int_dt = self.data_interval_var.get() or "5"
            self.hb_status_var.set(f"● 仿真运行中 (心跳{int_hb}s + 数据{int_dt}s)")
        elif hb_running:
            self.hb_status_var.set("● 心跳运行中")
        else:
            self.hb_status_var.set("○ 仿真已停止")
        if hb_running:
            self.hb_start_btn.configure(state="disabled")
            self.hb_stop_btn.configure(state="normal")
        else:
            self.hb_start_btn.configure(state="normal")
            self.hb_stop_btn.configure(state="disabled")

        self._flush_device_log()

    def _find_device(self, code: str) -> dict | None:
        for d in self.devices:
            if d["device_code"] == code:
                return d
        return None

    # ── 勾选 ──

    def select_all_devices(self) -> None:
        for code in self._device_check_vars:
            self._device_check_vars[code].set(True)
        self._safe_refresh_tree()

    def deselect_all_devices(self) -> None:
        for code in self._device_check_vars:
            self._device_check_vars[code].set(False)
        self._safe_refresh_tree()

    def _get_checked_codes(self) -> list[str]:
        return [code for code, var in self._device_check_vars.items() if var.get()]

    # ═══════════════════════════════════════════════════════════════
    # 预设 & 滑块
    # ═══════════════════════════════════════════════════════════════

    def apply_preset(self, smoke: float, temp: int, humi: int) -> None:
        self.smoke_slider_var.set(int(smoke * 100))
        self.temp_slider_var.set(temp)
        self.humi_slider_var.set(humi)
        self._on_smoke_slider()
        self._on_temp_slider()
        self.humi_label_var.set(f"{humi}%")

    def _on_smoke_slider(self, *args) -> None:
        val = self.smoke_slider_var.get() / 100
        label = " 正常" if val < 0.15 else " 轻度" if val < 0.30 else " 火警"
        self.smoke_label_var.set(f"{val:.2f} {label}")

    def _on_temp_slider(self, *args) -> None:
        self.temp_label_var.set(f"{self.temp_slider_var.get()}°C")

    def _get_data_params(self) -> dict:
        return {
            "smoke": self.smoke_slider_var.get() / 100,
            "temp": self.temp_slider_var.get(),
            "humi": self.humi_slider_var.get(),
        }

    def _run_in_thread(self, fn, error_msg="操作失败") -> None:
        """在后台线程执行阻塞操作，防止 GUI 卡死"""
        import threading
        if self._busy:
            return
        self._busy = True

        def worker() -> None:
            try:
                fn()
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("错误", f"{error_msg}: {e}"))
            finally:
                self._busy = False

        threading.Thread(target=worker, daemon=True).start()

    # ═══════════════════════════════════════════════════════════════
    # 发送数据（异步版，不阻塞 GUI）
    # ═══════════════════════════════════════════════════════════════

    def _ensure_mqtt(self, config: SimulatorConfig) -> bool:
        """确保 MQTT 已连接，最多等待 5 秒"""
        if self.core.connected:
            return True
        self.root.after(0, lambda: self.mqtt_status_var.set("连接中..."))
        ok = self.core.connect(config, timeout=5.0)
        self.root.after(0, lambda: self.mqtt_status_var.set(
            "已连接" if ok else "未连接"))
        return ok

    def _do_send_once(self) -> None:
        code = self._active_device_code
        if not code:
            self.root.after(0, lambda: messagebox.showwarning("提示", "请先选择设备"))
            return
        config = self._build_config()
        need_disconnect = not self.core.connected
        if need_disconnect and not self._ensure_mqtt(config):
            self.root.after(0, lambda: messagebox.showerror("发送失败", "MQTT 连接失败"))
            return
        p = self._get_data_params()
        self.core.publish(f"smoke/{code}/data",
                          self.core._build_data_payload(code, p["smoke"], p["temp"], p["humi"], 95))
        self._log_device(code, "ok", f"发送: smoke={p['smoke']:.2f} temp={p['temp']}°C humi={p['humi']}%")
        if need_disconnect:
            self.core.disconnect()

    def send_current_once(self) -> None:
        self._run_in_thread(self._do_send_once, "发送失败")

    def _do_batch_send(self) -> None:
        codes = self._get_checked_codes()
        if not codes:
            self.root.after(0, lambda: messagebox.showwarning("提示", "请先勾选设备"))
            return
        config = self._build_config()
        need_disconnect = not self.core.connected
        if need_disconnect and not self._ensure_mqtt(config):
            self.root.after(0, lambda: messagebox.showerror("发送失败", "MQTT 连接失败"))
            return
        p = self._get_data_params()
        count = self.core.batch_send(codes, config)
        self._log_global("ok", f"批量发送完成: {count}/{len(codes)}")
        if need_disconnect:
            self.core.disconnect()

    def batch_send_selected(self) -> None:
        self._run_in_thread(self._do_batch_send, "批量发送失败")

    def _do_toggle_continuous(self) -> None:
        if self.continuous_running:
            self.core.stop_continuous()
            self.continuous_running = False
            self.root.after(0, lambda: self.continuous_btn_var.set("🔄 连续发送"))
            self.core.disconnect()
            self.root.after(0, lambda: self.mqtt_status_var.set("未连接"))
            self._log_global("info", "连续发送已停止")
            return
        codes = self._get_checked_codes() or ([self._active_device_code] if self._active_device_code else [])
        if not codes:
            self.root.after(0, lambda: messagebox.showwarning("提示", "请勾选或选择设备"))
            return
        config = self._build_config()
        if self.core.start_continuous(codes, config):
            self.continuous_running = True
            self.root.after(0, lambda: self.continuous_btn_var.set("⏹ 停止连续"))
            self.root.after(0, lambda: self.mqtt_status_var.set("已连接 (连续发送中)"))
            self._log_global("ok", f"连续发送已启动: {len(codes)} 台设备")

    def toggle_continuous(self) -> None:
        self._run_in_thread(self._do_toggle_continuous, "连续发送操作失败")

    # ═══════════════════════════════════════════════════════════════
    # 心跳控制
    # ═══════════════════════════════════════════════════════════════

    def _sync_heartbeat_start_rest(self, code: str) -> bool:
        """通过 REST API 即时通知后端设备上线"""
        try:
            if self.core.rest_client is None or not self.core.rest_client.online:
                self._init_rest_client()
            rc = self.core.rest_client
            if rc and rc.online:
                return rc.heartbeat_start(code)
        except Exception:
            pass
        return False

    def _sync_heartbeat_stop_rest(self, code: str) -> bool:
        """通过 REST API 即时通知后端设备离线"""
        try:
            if self.core.rest_client is None or not self.core.rest_client.online:
                self._init_rest_client()
            rc = self.core.rest_client
            if rc and rc.online:
                return rc.heartbeat_stop(code)
        except Exception:
            pass
        return False

    def _sync_heartbeat_send_rest(self, code: str, bat: int, rssi: int) -> bool:
        """通过 REST API 发送心跳（额外通道，增强可靠性）"""
        try:
            rc = self.core.rest_client
            if rc and rc.online:
                return rc.heartbeat_send(code, bat, rssi)
        except Exception:
            pass
        return False

    def _do_start_heartbeat(self) -> None:
        # 优先用勾选的设备，否则用当前选中的设备
        codes = self._get_checked_codes()
        if not codes:
            code = self._active_device_code
            if not code:
                return
            codes = [code]

        # 诊断日志
        self._log_global("info", f"准备启动仿真 — 已勾选: {self._get_checked_codes()}, 当前选中: {self._active_device_code}")
        self._log_global("info", f"最终启动设备列表: {codes} ({len(codes)}台)")

        config = self._build_config()
        config.heartbeat_interval = int(self.hb_interval_var.get() or 10)
        config.normal_interval = int(self.data_interval_var.get() or 5)

        # 1. 通过 REST 即时通知每台设备上线
        rest_ok_count = 0
        for c in codes:
            if self._sync_heartbeat_start_rest(c):
                self._sync_heartbeat_send_rest(c, 95, -40)
                rest_ok_count += 1
        if rest_ok_count > 0:
            self._log_global("ok", f"REST 通知: {rest_ok_count}/{len(codes)} 台 → 前端实时可见")
        else:
            self._log_global("info", "后端不可达，仅 MQTT 同步")

        # 2. 启动多设备 MQTT 心跳 + 数据双循环
        ok = self.core.start_normal(codes, config)
        if ok:
            device_list = ", ".join(codes)
            self._log_global("ok",
                f"仿真已启动 [{device_list}] 共{len(codes)}台, 心跳{config.heartbeat_interval}s, 数据{config.normal_interval}s")
            self.root.after(0, lambda: self.mqtt_status_var.set(f"仿真中({len(codes)}台)"))
            self.root.after(0, self._safe_refresh_tree)
            if self._active_device_code:
                self._show_device_detail(self._active_device_code)
        else:
            self.root.after(0, lambda: messagebox.showerror("启动失败", "MQTT 连接失败"))

    def start_heartbeat(self) -> None:
        self._run_in_thread(self._do_start_heartbeat, "启动仿真失败")

    def _do_stop_heartbeat(self) -> None:
        # 获取所有正在仿真的设备
        states = self.core.state_manager.get_all()
        running_codes = [c for c, s in states.items() if s.heartbeat_running or s.data_running]
        if not running_codes:
            return

        # 1. 停止所有 MQTT 循环
        self.core.stop_running()

        # 2. 通过 REST 通知每台设备离线
        for c in running_codes:
            self._sync_heartbeat_stop_rest(c)
        self._log_global("warn", f"仿真已停止: {len(running_codes)} 台设备")

        self.root.after(0, lambda: self.mqtt_status_var.set(
            "已连接" if self.core.connected else "未连接"))
        self.root.after(0, self._safe_refresh_tree)
        if self._active_device_code:
            self._show_device_detail(self._active_device_code)

    def stop_heartbeat(self) -> None:
        self._run_in_thread(self._do_stop_heartbeat, "停止仿真失败")

    # ═══════════════════════════════════════════════════════════════
    # 阈值保存
    # ═══════════════════════════════════════════════════════════════

    def save_thresholds(self) -> None:
        """通过 SimulationController 保存阈值到数据库"""
        code = self._active_device_code
        if not code:
            return

        if self.core.rest_client is None or not self.core.rest_client.online:
            self._init_rest_client()
        rc = self.core.rest_client
        if rc is None or not rc.online:
            messagebox.showwarning("提示", "后端不可达，无法保存阈值。\n请先点击「从后端同步设备」连接后端。")
            return

        sH = float(self.thr_smoke_high_var.get() or 0.30)
        sM = float(self.thr_smoke_med_var.get() or 0.15)
        tH = float(self.thr_temp_high_var.get() or 65)

        # 直接通过 SimulationController 保存（绕过有 bug 的 AlertThresholdController）
        ok = rc.save_device_threshold(code, sH, sM, tH)
        if ok:
            self._save_device_config(code)  # 持久化到本地
            self._log_device(code, "ok", f"阈值已保存到数据库: S_H={sH} S_M={sM} T_H={tH}")
            self._log_global("ok", f"{code} 阈值已更新 → 前端将自动刷新")
            messagebox.showinfo("保存成功",
                f"设备 {code} 的阈值已保存到数据库！\n"
                f"烟雾 HIGH={sH}  MED={sM}  温度 HIGH={tH}°C")
        else:
            messagebox.showerror("保存失败", "无法写入数据库，请检查后端和网络")

    # ═══════════════════════════════════════════════════════════════
    # 设备 CRUD（增加后端双向同步）
    # ═══════════════════════════════════════════════════════════════

    def open_add_device(self) -> None:
        dlg = DeviceEditorDialog(self.root, "新增设备")
        self.root.wait_window(dlg)
        if dlg.result is None:
            return

        if self._find_device(dlg.result["device_code"]):
            messagebox.showwarning("提示", "设备编码已存在")
            return

        next_id = max((d.get("device_id", 0) for d in self.devices), default=0) + 1
        new_dev = {"device_id": next_id, **dlg.result}
        self.devices.append(new_dev)
        self._save_json(DEVICES_PATH, self.devices)

        self.core.state_manager.register_device(new_dev)
        self.refresh_device_tree()
        self._select_device_code(new_dev["device_code"])
        self._log_global("ok", f"新增设备: {new_dev['device_code']}")

        # 同步到后端（即时写库 + WebSocket 通知前端）
        backend_synced = False
        if self.core.rest_client and self.core.rest_client.online:
            backend_synced = self.core.rest_client.create_device({
                "deviceId": new_dev["device_code"],
                "deviceName": new_dev["device_name"],
                "locationBuilding": new_dev.get("building", ""),
                "locationFloor": new_dev.get("floor", ""),
                "locationRoom": new_dev.get("room", ""),
                "status": "ONLINE", "battery": 100, "signalStrength": 90, "heartbeatTimeout": 30,
            })
        if backend_synced:
            self._log_global("ok", f"已同步到数据库 → 前端实时可见")
        else:
            self._log_global("info", "后端不可达，设备仅保存在本地；发送心跳后自动注册")

    def open_edit_device(self) -> None:
        if self.device_tree is None:
            return
        sel = self.device_tree.selection()
        if not sel:
            messagebox.showwarning("提示", "请先在设备列表点击一行")
            return
        cur = self._find_device(sel[0])
        if not cur:
            return

        dlg = DeviceEditorDialog(self.root, "编辑设备", cur)
        self.root.wait_window(dlg)
        if dlg.result is None:
            return

        dup = self._find_device(dlg.result["device_code"])
        if dup and dup["device_id"] != cur["device_id"]:
            messagebox.showwarning("提示", "设备编码冲突")
            return

        for i, d in enumerate(self.devices):
            if d["device_id"] == cur["device_id"]:
                self.devices[i] = {"device_id": cur["device_id"], **dlg.result}
                break
        self._save_json(DEVICES_PATH, self.devices)
        self.core.state_manager.register_device(self.devices[i])
        self._safe_refresh_tree()
        self._select_device_code(dlg.result["device_code"])
        self._log_global("ok", f"设备已更新: {dlg.result['device_code']}")

        # 同步到后端
        if self.core.rest_client and self.core.rest_client.online:
            # 查找后端设备 ID
            backend_devices = self.core.rest_client.fetch_devices() or []
            backend_id = None
            for bd in backend_devices:
                if (bd.get("deviceCode") or bd.get("device_code", "")) == dlg.result["device_code"]:
                    backend_id = bd.get("id")
                    break
            if backend_id:
                self.core.rest_client.update_device(backend_id, {
                    "deviceId": dlg.result["device_code"],
                    "deviceName": dlg.result["device_name"],
                    "locationBuilding": dlg.result.get("building", ""),
                    "locationFloor": dlg.result.get("floor", ""),
                    "locationRoom": dlg.result.get("room", ""),
                })

    def delete_device(self) -> None:
        if self.device_tree is None:
            return
        sel = self.device_tree.selection()
        if not sel:
            messagebox.showwarning("提示", "请先在设备列表点击一行")
            return
        cur = self._find_device(sel[0])
        if not cur:
            return

        code = cur['device_code']
        ok = messagebox.askyesno("删除设备",
            f"确定删除 {code} 吗？\n\n"
            "删除操作将：\n"
            "1. 从本地设备清单移除\n"
            "2. 同步删除后端数据库（逻辑删除）\n"
            "3. 前端将不再显示该设备")
        if not ok:
            return

        # 1. 本地删除
        self.devices = [d for d in self.devices if d["device_id"] != cur["device_id"]]
        self._save_json(DEVICES_PATH, self.devices)
        self.core.state_manager.unregister_device(code)
        self._device_check_vars.pop(code, None)
        self.refresh_device_tree()
        self.restore_last_selection()

        # 2. 后端同步删除
        backend_deleted = False
        if self.core.rest_client and self.core.rest_client.online:
            backend_devices = self.core.rest_client.fetch_devices() or []
            for bd in backend_devices:
                if (bd.get("deviceCode") or bd.get("device_code", "")) == code:
                    backend_id = bd.get("id")
                    if self.core.rest_client.delete_device(backend_id):
                        backend_deleted = True
                    break

        if backend_deleted:
            self._log_global("warn", f"设备已从本地和后端数据库删除: {code}")
        else:
            self._log_global("warn", f"设备已从本地删除: {code}" +
                             (" (后端不可达，未同步删除)" if not backend_deleted else ""))

    def _select_device_code(self, code: str) -> None:
        if self.device_tree is None:
            return
        self._active_device_code = code
        self.device_tree.selection_set(code)
        self.device_tree.focus(code)
        self._show_device_detail(code)
        self._show_center_panel()

    # ═══════════════════════════════════════════════════════════════
    # 后端同步（修复：双向同步 + 清理已删除设备）
    # ═══════════════════════════════════════════════════════════════

    def _init_rest_client(self) -> None:
        if self.core.rest_client is None:
            self.core.init_rest(
                self.backend_url_var.get().strip(),
                self.backend_user_var.get().strip(),
                self.backend_pass_var.get(),
            )
        self.core.rest_client.login()

    def try_connect_backend(self) -> None:
        self._init_rest_client()
        rc = self.core.rest_client
        if rc and rc.online:
            self.backend_status_var.set("后端: ✅ 已连接")
            self._try_connect_ws()
            # 首次启动自动同步后端设备列表
            if not self._initial_sync_done:
                self._initial_sync_done = True
                self._log_global("info", "正在自动同步后端设备...")
                self._do_sync_devices()
                self._log_global("ok", f"启动完成 — 已加载 {len(self.devices)} 台设备")
                self.root.after(0, self.refresh_device_tree)
                self.root.after(0, self.restore_last_selection)
                self.root.after(0, lambda: self.center_empty.configure(
                    text="📡 选择一台设备开始模拟\n\n点击左侧设备清单中的设备查看独立控制面板"))
        else:
            self.backend_status_var.set("后端: ❌ 离线")
            if not self._initial_sync_done:
                self._initial_sync_done = True
                self._log_global("warn", "后端不可达，使用本地设备列表")
                self.root.after(0, self.refresh_device_tree)
                self.root.after(0, self.restore_last_selection)
                self.root.after(0, lambda: self.center_empty.configure(
                    text="📡 选择一台设备开始模拟\n\n点击左侧设备清单中的设备查看独立控制面板"))

    def _try_connect_ws(self) -> None:
        if self.core.ws_client is None:
            token = (self.core.rest_client and self.core.rest_client.token) or ""
            self.core.init_ws(self.backend_url_var.get().strip(), "/ws/alarm", token=token)
            ws = self.core.ws_client
            ws.on_event(self._on_ws_event)
            ws.start()
            self.ws_status_var.set("WebSocket: 连接中...")
            self.root.after(2000, self._check_ws_status)

    def _check_ws_status(self) -> None:
        if self.core.ws_client and self.core.ws_client.connected:
            self.ws_status_var.set("WebSocket: ✅ 已连接")
        else:
            self.ws_status_var.set("WebSocket: 🔴 断开")

    def _on_ws_event(self, event_type: str, payload: dict) -> None:
        if event_type == "ws_connected":
            self.ws_status_var.set("WebSocket: ✅ 已连接")
            self._log_global("ok", "WebSocket 已连接")
        elif event_type == "ws_disconnected":
            self.ws_status_var.set("WebSocket: 🔴 断开")
            self._log_global("warn", "WebSocket 已断开")
        elif event_type == "alarm":
            msg = f"告警: {payload.get('deviceName', '?')} {payload.get('alarmType', '')} [{payload.get('alarmLevel', '')}]"
            self._log_global("warn", msg)
        elif event_type == "device_online":
            code = payload.get("deviceId", "")
            self._log_global("ok", f"{payload.get('deviceName', code)} 恢复在线")
            self.core.state_manager.update_local_status(code, True)
            self._safe_refresh_tree()
        elif event_type == "device_offline":
            code = payload.get("deviceId", "")
            self._log_global("error", f"{payload.get('deviceName', code)} 离线告警")
            self.core.state_manager.update_local_status(code, False)
            self._safe_refresh_tree()
        elif event_type == "broadcast":
            self._log_global("warn", f"广播: {payload.get('message', '')}")
        elif event_type == "data_changed":
            self._log_global("info", f"数据变更: {payload.get('deviceId', '')} {payload.get('action', '')}")
        elif event_type == "config_changed":
            # 其他端修改了阈值，自动刷新当前设备
            code = self._active_device_code
            if code:
                self._run_in_thread(lambda: self._fetch_thresholds_for_device(code), "")
        else:
            # 尝试解析 kind 字段
            kind = payload.get("kind", "")
            if kind == "device_config_changed" or "threshold" in str(payload.get("action", "")):
                code = self._active_device_code
                if code:
                    self._run_in_thread(lambda: self._fetch_thresholds_for_device(code), "")

    def sync_devices_from_backend(self) -> None:
        """手动同步按钮"""
        self._init_rest_client()
        rc = self.core.rest_client
        if rc is None or not rc.online:
            messagebox.showwarning("提示", "后端不可达，无法同步")
            self.backend_status_var.set("后端: ❌ 离线")
            return
        self._do_sync_devices()
        messagebox.showinfo("同步完成", f"已从后端同步 {len(self.devices)} 台设备")

    def _do_sync_devices(self) -> bool:
        """执行同步逻辑，返回是否成功。自动启动时静默调用"""
        rc = self.core.rest_client
        if rc is None or not rc.online:
            return False

        backend_devices = rc.fetch_devices()
        if not backend_devices:
            return False

        # 构建后端设备映射
        backend_map: dict[str, dict] = {}
        for bd in backend_devices:
            code = bd.get("deviceCode") or bd.get("device_code", "")
            if not code:
                continue
            backend_map[code] = {
                "device_id": bd.get("id", 0),
                "device_code": code,
                "device_name": bd.get("name") or bd.get("deviceName", code),
                "building": bd.get("building") or bd.get("locationBuilding", ""),
                "floor": bd.get("floor") or bd.get("locationFloor", ""),
                "room": bd.get("room") or bd.get("locationRoom", ""),
            }

        local_codes = {d["device_code"] for d in self.devices}
        backend_codes = set(backend_map.keys())

        # 清理已在数据库中删除的设备
        removed = local_codes - backend_codes
        if removed:
            self.devices = [d for d in self.devices if d["device_code"] not in removed]
            for code in removed:
                self.core.state_manager.unregister_device(code)
                self._device_check_vars.pop(code, None)

        # 更新/新增
        added, updated = 0, 0
        for code, mapped in backend_map.items():
            existing = self._find_device(code)
            if existing:
                existing.update(mapped)
                updated += 1
            else:
                self.devices.append(mapped)
                added += 1
            self.core.state_manager.register_device(mapped)

        self._save_json(DEVICES_PATH, self.devices)
        self.backend_status_var.set("后端: ✅ 已连接")
        return True

    # ═══════════════════════════════════════════════════════════════
    # MQTT 连接
    # ═══════════════════════════════════════════════════════════════

    def _do_test_mqtt(self) -> None:
        config = self._build_config()
        self.core.stop_running()
        self.core._stop_event.clear()
        ok = self.core.connect(config, timeout=6.0)
        if ok:
            self.root.after(0, lambda: messagebox.showinfo("测试连接", "MQTT 连接成功!"))
            self.core.disconnect()
        else:
            self.root.after(0, lambda: messagebox.showerror("测试连接", "MQTT 连接失败，请查看日志"))
        self.root.after(0, lambda: self.mqtt_status_var.set("未连接"))

    def test_mqtt_connection(self) -> None:
        self._run_in_thread(self._do_test_mqtt, "测试连接异常")

    def _do_toggle_mqtt(self) -> None:
        if self.core.connected:
            self.core.stop_running()
            self.root.after(0, lambda: self.mqtt_status_var.set("未连接"))
            self._log_global("info", "MQTT 已手动断开")
        else:
            config = self._build_config()
            if self.core.connect(config, timeout=6.0):
                self.root.after(0, lambda: self.mqtt_status_var.set("已连接"))
                self._log_global("ok", "MQTT 已连接")
            else:
                self.root.after(0, lambda: messagebox.showerror("连接失败", "MQTT 连接失败"))

    def toggle_mqtt_connect(self) -> None:
        self._run_in_thread(self._do_toggle_mqtt, "MQTT 操作失败")

    def _build_config(self) -> SimulatorConfig:
        return SimulatorConfig(
            broker=self.broker_var.get().strip(),
            port=int(self.port_var.get().strip() or "1883"),
            client_id="smoke-simulator-gui",
            username=self.username_var.get().strip(),
            password=self.password_var.get(),
            use_random=self.use_random_var.get(),
            smoke=float(self.smoke_var.get().strip() or "0.02"),
            temp=float(self.temp_var.get().strip() or "25"),
            humi=float(self.humi_var.get().strip() or "45"),
            bat=int(self.bat_var.get().strip() or "95"),
            rssi=int(self.rssi_var.get().strip() or "-40"),
            normal_interval=int(self.normal_interval_var.get().strip() or "5"),
            heartbeat_interval=int(self.heartbeat_interval_var.get().strip() or "10"),
            offline_timeout=int(self.offline_timeout_var.get().strip() or "35"),
        )

    # ═══════════════════════════════════════════════════════════════
    # 日志刷新
    # ═══════════════════════════════════════════════════════════════

    def _flush_global_log(self) -> None:
        if self.global_log_text is None:
            return
        # 检测用户是否手动滚上去了
        was_at_bottom = (self.global_log_text.yview()[1] >= 0.95)

        logs = self.logger.get_global_logs(100)
        self.global_log_text.configure(state="normal")
        self.global_log_text.delete("1.0", "end")
        for entry in logs:
            line = f"[{entry['time']}] {entry['msg']}\n"
            self.global_log_text.insert("end", line, (entry.get("level", "info"),))

        # 只有之前就在底部时，才自动滚到底
        if was_at_bottom:
            self.global_log_text.see("end")
        self.global_log_text.configure(state="disabled")

    def _flush_device_log(self) -> None:
        if self.device_log_text is None or not self._active_device_code:
            return
        logs = self.logger.get_device_logs(self._active_device_code, 50)
        self.device_log_text.configure(state="normal")
        self.device_log_text.delete("1.0", "end")
        for entry in logs:
            line = f"[{entry['time']}] {entry['msg']}\n"
            self.device_log_text.insert("end", line, (entry.get("level", "info"),))
        self.device_log_text.see("end")
        self.device_log_text.configure(state="disabled")

    def _clear_global_log(self) -> None:
        self.logger.clear_global()
        if self.global_log_text:
            self.global_log_text.configure(state="normal")
            self.global_log_text.delete("1.0", "end")
            self.global_log_text.configure(state="disabled")

    # ═══════════════════════════════════════════════════════════════
    # 周期刷新
    # ═══════════════════════════════════════════════════════════════

    def refresh_device_status(self) -> None:
        """手动刷新：从后端拉取最新设备状态"""
        self._run_in_thread(self._do_refresh_status, "刷新失败")

    def _do_refresh_status(self) -> None:
        rc = self.core.rest_client
        if rc is None or not rc.online:
            self._init_rest_client()
            rc = self.core.rest_client
        if rc is None or not rc.online:
            self._log_global("info", "后端不可达，使用本地状态")
            return

        devices = rc.fetch_devices()
        if not devices:
            return
        # 用后端最新状态更新本地
        for bd in devices:
            code = bd.get("deviceCode") or bd.get("device_code", "")
            if not code:
                continue
            status = (bd.get("status") or "OFFLINE").upper()
            self.core.state_manager.update_local_status(code, status == "ONLINE")
            state = self.core.state_manager.get(code)
            if state:
                if bd.get("battery") is not None:
                    state.battery = bd["battery"]
                if bd.get("signalStrength") is not None:
                    state.rssi = bd["signalStrength"]
        self._log_global("info", f"状态已刷新 ({len(devices)} 台设备)")

    # 自动刷新计数器
    _auto_refresh_counter = 0

    def periodic_refresh(self) -> None:
        """周期刷新：UI + 每10秒自动从后端拉状态"""
        if self._active_device_code:
            self._show_device_detail(self._active_device_code)
        self._safe_refresh_tree()
        self._flush_global_log()
        self._flush_device_log()

        # 每 10 秒自动刷新后端状态（6 次 × 1.5s = 9s ≈ 10s）
        self._auto_refresh_counter += 1
        if self._auto_refresh_counter >= 6:
            self._auto_refresh_counter = 0
            self._run_in_thread(self._do_refresh_status, "")

        if self.core.ws_client:
            self.ws_status_var.set(
                "WebSocket: ✅ 已连接" if self.core.ws_client.connected else "WebSocket: 🔴 断开")
        if not self.core.connected and not self.continuous_running:
            self.mqtt_status_var.set("未连接")

        self.root.after(1500, self.periodic_refresh)

    def update_status_bar(self) -> None:
        states = self.core.state_manager.get_all()
        total = len(self.devices)
        online = sum(1 for s in states.values() if s.online)
        for dev in self.devices:
            state = states.get(dev["device_code"])
            if state and state.online:
                pass  # already counted

        self.sb_total_var.set(f"设备: {total}")
        self.sb_online_var.set(f"在线: {online}")
        self.sb_offline_var.set(f"离线: {total - online}")
        import datetime
        self.sb_sync_var.set(f"刷新: {datetime.datetime.now().strftime('%H:%M:%S')}")
        self.root.after(2000, self.update_status_bar)

    def toggle_random_inputs(self) -> None:
        pass

    # ═══════════════════════════════════════════════════════════════
    # 关闭
    # ═══════════════════════════════════════════════════════════════

    def save_runtime_config(self) -> None:
        self.config_data["mqtt"] = {
            "broker": self.broker_var.get().strip(),
            "port": int(self.port_var.get().strip() or "1883"),
            "client_id": "smoke-simulator-gui",
            "username": self.username_var.get().strip(),
            "password": self.password_var.get(),
        }
        self.config_data["backend"] = {
            "url": self.backend_url_var.get().strip(),
            "username": self.backend_user_var.get().strip(),
            "password": self.backend_pass_var.get(),
            "ws_path": "/ws/alarm",
        }
        self.config_data["defaults"] = {
            "use_random": self.use_random_var.get(),
            "smoke": float(self.smoke_var.get().strip() or "0.02"),
            "temp": float(self.temp_var.get().strip() or "25"),
            "humi": float(self.humi_var.get().strip() or "45"),
            "bat": int(self.bat_var.get().strip() or "95"),
            "rssi": int(self.rssi_var.get().strip() or "-40"),
            "normal_interval": int(self.normal_interval_var.get().strip() or "5"),
            "heartbeat_interval": int(self.heartbeat_interval_var.get().strip() or "10"),
            "offline_timeout": int(self.offline_timeout_var.get().strip() or "35"),
        }
        self.config_data["ui"] = {
            "last_device_code": self._active_device_code or "",
            "last_mode": self.mode_var.get(),
        }
        self._save_json(CONFIG_PATH, self.config_data)

    def on_close(self) -> None:
        try:
            self.save_runtime_config()
        except Exception:
            pass
        self.core.stop_running()
        if self.core.ws_client:
            self.core.ws_client.stop()
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    style = ttk.Style()
    if "vista" in style.theme_names():
        style.theme_use("vista")
    SmokeSimulatorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
