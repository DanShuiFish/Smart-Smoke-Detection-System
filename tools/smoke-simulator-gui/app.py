from __future__ import annotations

import json
import queue
from pathlib import Path
import sys
import tkinter as tk
from tkinter import messagebox, ttk

from simulator_core import SimulatorConfig, SmokeSimulatorCore


if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS)  # type: ignore[attr-defined]
else:
    BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
DEVICES_PATH = BASE_DIR / "devices.json"


class DeviceEditorDialog(tk.Toplevel):
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

        labels = [
            ("device_code", "设备编码"),
            ("device_name", "设备名称"),
            ("building", "楼栋"),
            ("floor", "楼层"),
            ("room", "房间"),
        ]

        container = ttk.Frame(self, padding=12)
        container.grid(sticky="nsew")

        for row, (key, text) in enumerate(labels):
            ttk.Label(container, text=text).grid(row=row, column=0, sticky="w", padx=(0, 8), pady=6)
            ttk.Entry(container, textvariable=self.vars[key], width=28).grid(row=row, column=1, sticky="ew", pady=6)

        button_row = ttk.Frame(container)
        button_row.grid(row=len(labels), column=0, columnspan=2, sticky="e", pady=(12, 0))
        ttk.Button(button_row, text="取消", command=self.destroy).pack(side="right", padx=(8, 0))
        ttk.Button(button_row, text="保存", command=self.on_save).pack(side="right")

        self.bind("<Return>", lambda _: self.on_save())
        self.bind("<Escape>", lambda _: self.destroy())

    def on_save(self) -> None:
        payload = {key: var.get().strip() for key, var in self.vars.items()}
        if not payload["device_code"]:
            messagebox.showwarning("提示", "设备编码不能为空", parent=self)
            return
        if not payload["device_name"]:
            messagebox.showwarning("提示", "设备名称不能为空", parent=self)
            return
        self.result = payload
        self.destroy()


class SmokeSimulatorApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("智慧烟感模拟器 GUI")
        self.root.geometry("1320x820")
        self.root.minsize(1200, 760)

        self.log_queue: queue.SimpleQueue[str] = queue.SimpleQueue()
        self.core = SmokeSimulatorCore(self.enqueue_log)
        self.config_data = self.load_json(CONFIG_PATH)
        self.devices = self.load_json(DEVICES_PATH)

        mqtt_cfg = self.config_data["mqtt"]
        defaults = self.config_data["defaults"]
        ui_cfg = self.config_data["ui"]

        self.broker_var = tk.StringVar(value=mqtt_cfg["broker"])
        self.port_var = tk.StringVar(value=str(mqtt_cfg["port"]))
        self.client_id_var = tk.StringVar(value=mqtt_cfg["client_id"])
        self.username_var = tk.StringVar(value=mqtt_cfg["username"])
        self.password_var = tk.StringVar(value=mqtt_cfg["password"])

        self.use_random_var = tk.BooleanVar(value=defaults["use_random"])
        self.mode_var = tk.StringVar(value=ui_cfg["last_mode"])
        self.status_var = tk.StringVar(value="未连接")
        self.broadcast_notify_var = tk.StringVar(value="")
        self.selected_device_code_var = tk.StringVar(value=ui_cfg["last_device_code"])
        self._device_check_vars: dict[str, tk.BooleanVar] = {}  # device_code → 勾选状态

        self.smoke_var = tk.StringVar(value=str(defaults["smoke"]))
        self.temp_var = tk.StringVar(value=str(defaults["temp"]))
        self.humi_var = tk.StringVar(value=str(defaults["humi"]))
        self.bat_var = tk.StringVar(value=str(defaults["bat"]))
        self.rssi_var = tk.StringVar(value=str(defaults["rssi"]))
        self.normal_interval_var = tk.StringVar(value=str(defaults["normal_interval"]))
        self.heartbeat_interval_var = tk.StringVar(value=str(defaults["heartbeat_interval"]))
        self.offline_timeout_var = tk.StringVar(value=str(defaults["offline_timeout"]))

        self.param_entries: list[ttk.Entry] = []
        self.device_tree: ttk.Treeview | None = None
        self.device_detail_var = tk.StringVar(value="未选择设备")
        self.log_text: tk.Text | None = None

        self.build_ui()
        self.refresh_device_tree()
        self.restore_last_selection()
        self.toggle_random_inputs()
        self.root.after(150, self.flush_logs)
        self.enqueue_log("图形界面已启动")
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def load_json(self, path: Path):
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def save_json(self, path: Path, data) -> None:
        with path.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)

    def enqueue_log(self, message: str) -> None:
        self.log_queue.put(message)

    def flush_logs(self) -> None:
        if self.log_text is not None:
            while not self.log_queue.empty():
                message = self.log_queue.get()
                self.log_text.configure(state="normal")
                self.log_text.insert("end", message + "\n")
                self.log_text.see("end")
                self.log_text.configure(state="disabled")

                if "收到广播指令" in message:
                    # Extract device code and show notification
                    parts = message.split("收到广播指令")[1].strip() if "收到广播指令" in message else ""
                    self.broadcast_notify_var.set(f"收到广播: {parts}")
                    self.root.after(4000, lambda: self.broadcast_notify_var.set(""))

                if "已连接" in message:
                    self.status_var.set("已连接")
                elif "连接失败" in message or "连接超时" in message or "已断开" in message or "连接异常" in message:
                    self.status_var.set("未连接")

        self.root.after(150, self.flush_logs)

    def build_ui(self) -> None:
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(1, weight=1)

        header = ttk.LabelFrame(self.root, text="MQTT 连接设置", padding=10)
        header.grid(row=0, column=0, sticky="ew", padx=12, pady=(12, 8))
        for column in range(12):
            header.columnconfigure(column, weight=1 if column in (1, 3, 5, 7, 9) else 0)

        fields = [
            ("Broker", self.broker_var, 0, 20, None),
            ("Port", self.port_var, 2, 8, None),
            ("Client ID", self.client_id_var, 4, 22, None),
            ("用户名", self.username_var, 6, 14, None),
            ("密码", self.password_var, 8, 14, "*"),
        ]
        for label_text, variable, column, width, show in fields:
            ttk.Label(header, text=label_text).grid(row=0, column=column, sticky="w", padx=4, pady=4)
            ttk.Entry(header, textvariable=variable, width=width, show=show).grid(
                row=0, column=column + 1, sticky="ew", padx=4, pady=4
            )

        ttk.Button(header, text="测试连接", command=self.test_connection).grid(row=0, column=10, padx=8, pady=4)
        ttk.Label(header, textvariable=self.status_var, foreground="#1d4ed8").grid(
            row=0, column=11, sticky="w", padx=6, pady=4
        )
        # Broadcast notification bar
        self.broadcast_notify_label = ttk.Label(
            header,
            textvariable=self.broadcast_notify_var,
            foreground="#dc2626",
            font=("", 9, "bold"),
            anchor="center",
            padding=4,
        )
        self.broadcast_notify_label.grid(row=1, column=0, columnspan=12, sticky="ew", padx=4, pady=(0, 4))

        content = ttk.Panedwindow(self.root, orient="horizontal")
        content.grid(row=1, column=0, sticky="nsew", padx=12, pady=(0, 12))

        left_panel = ttk.Frame(content, padding=6)
        right_panel = ttk.Frame(content, padding=6)
        content.add(left_panel, weight=3)
        content.add(right_panel, weight=5)

        left_panel.columnconfigure(0, weight=1)
        left_panel.rowconfigure(1, weight=1)

        device_frame = ttk.LabelFrame(left_panel, text="设备管理", padding=10)
        device_frame.grid(row=0, column=0, sticky="nsew")
        device_frame.columnconfigure(0, weight=1)
        device_frame.rowconfigure(0, weight=1)

        self.device_tree = ttk.Treeview(
            device_frame,
            columns=("check", "code", "name", "location"),
            show="headings",
            height=14,
        )
        self.device_tree.heading("check", text="☑")
        self.device_tree.heading("code", text="设备编码")
        self.device_tree.heading("name", text="设备名称")
        self.device_tree.heading("location", text="位置")
        self.device_tree.column("check", width=40, anchor="center")
        self.device_tree.column("code", width=110, anchor="center")
        self.device_tree.column("name", width=180, anchor="w")
        self.device_tree.column("location", width=160, anchor="w")
        self.device_tree.grid(row=0, column=0, sticky="nsew")
        self.device_tree.bind("<<TreeviewSelect>>", self.on_device_select)
        self.device_tree.bind("<Button-1>", self.on_tree_click)

        device_buttons = ttk.Frame(device_frame)
        device_buttons.grid(row=1, column=0, sticky="ew", pady=(10, 0))
        for idx, (text, command) in enumerate(
            [
                ("全选", self.select_all_devices),
                ("取消全选", self.deselect_all_devices),
                ("新增设备", self.open_add_device),
                ("编辑设备", self.open_edit_device),
                ("删除设备", self.delete_device),
            ]
        ):
            ttk.Button(device_buttons, text=text, command=command).grid(row=0, column=idx, padx=(0, 8), sticky="ew")
            device_buttons.columnconfigure(idx, weight=1)

        detail_frame = ttk.LabelFrame(left_panel, text="当前设备", padding=10)
        detail_frame.grid(row=1, column=0, sticky="nsew", pady=(10, 0))
        ttk.Label(detail_frame, textvariable=self.device_detail_var, justify="left").pack(anchor="w")

        right_panel.columnconfigure(0, weight=1)
        right_panel.rowconfigure(1, weight=1)

        control_frame = ttk.LabelFrame(right_panel, text="模式与参数", padding=10)
        control_frame.grid(row=0, column=0, sticky="ew")
        control_frame.columnconfigure(0, weight=1)
        control_frame.columnconfigure(1, weight=1)
        control_frame.columnconfigure(2, weight=1)
        control_frame.columnconfigure(3, weight=1)

        mode_frame = ttk.Frame(control_frame)
        mode_frame.grid(row=0, column=0, columnspan=4, sticky="ew", pady=(0, 10))
        ttk.Radiobutton(mode_frame, text="正常模式", variable=self.mode_var, value="normal").pack(side="left", padx=(0, 16))
        ttk.Radiobutton(mode_frame, text="告警模式", variable=self.mode_var, value="alert").pack(side="left", padx=(0, 16))
        ttk.Radiobutton(mode_frame, text="离线模式", variable=self.mode_var, value="offline").pack(side="left")

        ttk.Button(control_frame, text="启动模式", command=self.start_mode).grid(row=1, column=0, sticky="ew", padx=4, pady=6)
        ttk.Button(control_frame, text="发送一次", command=self.send_once).grid(row=1, column=1, sticky="ew", padx=4, pady=6)
        ttk.Button(control_frame, text="停止", command=self.stop_mode).grid(row=1, column=2, sticky="ew", padx=4, pady=6)

        ttk.Checkbutton(
            control_frame,
            text="正常模式使用随机值（不勾选时使用下方自定义值）",
            variable=self.use_random_var,
            command=self.toggle_random_inputs,
        ).grid(row=2, column=0, columnspan=4, sticky="w", padx=4, pady=(8, 10))

        field_frame = ttk.Frame(control_frame)
        field_frame.grid(row=3, column=0, columnspan=4, sticky="ew")
        for column in range(4):
            field_frame.columnconfigure(column, weight=1)

        field_specs = [
            ("烟雾值", self.smoke_var),
            ("温度", self.temp_var),
            ("湿度", self.humi_var),
            ("电量", self.bat_var),
            ("RSSI", self.rssi_var),
            ("正常发送间隔(秒)", self.normal_interval_var),
            ("心跳间隔(秒)", self.heartbeat_interval_var),
            ("离线时长(秒)", self.offline_timeout_var),
        ]

        for index, (label_text, variable) in enumerate(field_specs):
            row = index // 2
            col = (index % 2) * 2
            ttk.Label(field_frame, text=label_text).grid(row=row, column=col, sticky="w", padx=4, pady=6)
            entry = ttk.Entry(field_frame, textvariable=variable, width=16)
            entry.grid(row=row, column=col + 1, sticky="ew", padx=4, pady=6)
            self.param_entries.append(entry)

        tip = (
            "说明：\n"
            "1. 正常模式勾选随机值时，会按默认随机范围发数据。\n"
            "2. 正常模式取消随机值后，会使用你手动输入的烟雾、温度、湿度、电量、RSSI。\n"
            "3. 告警模式默认发高危告警值；若取消随机值，也可用当前输入值做演示。\n"
            "4. 离线模式会先发一次心跳，再停止发送并倒计时。"
        )
        ttk.Label(control_frame, text=tip, justify="left", foreground="#475569").grid(
            row=4, column=0, columnspan=4, sticky="w", padx=4, pady=(10, 0)
        )

        log_frame = ttk.LabelFrame(right_panel, text="运行日志", padding=10)
        log_frame.grid(row=1, column=0, sticky="nsew", pady=(10, 0))
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)

        self.log_text = tk.Text(log_frame, wrap="word", state="disabled")
        self.log_text.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.log_text.configure(yscrollcommand=scrollbar.set)

    def refresh_device_tree(self) -> None:
        if self.device_tree is None:
            return

        for item in self.device_tree.get_children():
            self.device_tree.delete(item)

        for device in self.devices:
            code = device["device_code"]
            if code not in self._device_check_vars:
                self._device_check_vars[code] = tk.BooleanVar(value=False)
            checked = "☑" if self._device_check_vars[code].get() else "☐"
            location = f"{device['building']} / {device['floor']} / {device['room']}"
            self.device_tree.insert(
                "",
                "end",
                iid=code,
                values=(checked, code, device["device_name"], location),
            )

    def restore_last_selection(self) -> None:
        if not self.devices or self.device_tree is None:
            self.device_detail_var.set("暂无设备，请先新增设备")
            return

        codes = [item["device_code"] for item in self.devices]
        code = self.selected_device_code_var.get()
        if code not in codes:
            code = self.devices[0]["device_code"]
            self.selected_device_code_var.set(code)

        self.device_tree.selection_set(code)
        self.device_tree.focus(code)
        self._show_device_detail(code)

    def _show_device_detail(self, code: str) -> None:
        device = self.find_device_by_code(code)
        if not device:
            self.device_detail_var.set("未选择设备")
            return
        self.device_detail_var.set(
            f"设备编码：{device['device_code']}\n"
            f"设备名称：{device['device_name']}\n"
            f"楼栋楼层：{device['building']} / {device['floor']}\n"
            f"房间位置：{device['room']}"
        )

    def on_device_select(self, event=None) -> None:
        if self.device_tree is None:
            return
        selected = self.device_tree.selection()
        if not selected:
            self.device_detail_var.set("未选择设备")
            return
        code = selected[0]
        self.selected_device_code_var.set(code)
        self._show_device_detail(code)

    def on_tree_click(self, event) -> None:
        """点击第一列（勾选框）切换选中状态"""
        if self.device_tree is None:
            return
        region = self.device_tree.identify_region(event.x, event.y)
        if region != "cell":
            return
        column = self.device_tree.identify_column(event.x)
        if column != "#1":  # 第一列是勾选框
            return
        item = self.device_tree.identify_row(event.y)
        if not item:
            return
        var = self._device_check_vars.get(item)
        if var is not None:
            var.set(not var.get())
        self.refresh_device_tree()
        # 恢复选中行
        if item:
            self.device_tree.selection_set(item)

    def get_selected_devices(self) -> list[dict]:
        """返回所有勾选的设备"""
        codes = {
            code for code, var in self._device_check_vars.items() if var.get()
        }
        return [d for d in self.devices if d["device_code"] in codes]

    def select_all_devices(self) -> None:
        for var in self._device_check_vars.values():
            var.set(True)
        self.refresh_device_tree()

    def deselect_all_devices(self) -> None:
        for var in self._device_check_vars.values():
            var.set(False)
        self.refresh_device_tree()
        if self.device_tree is None:
            return None

        selected = self.device_tree.selection()
        if not selected:
            return None
        code = selected[0]
        for device in self.devices:
            if device["device_code"] == code:
                return device
        return None

    def toggle_random_inputs(self) -> None:
        state = "disabled" if self.use_random_var.get() else "normal"
        for entry in self.param_entries[:5]:
            entry.configure(state=state)

    def build_runtime_config(self) -> SimulatorConfig:
        try:
            broker = self.broker_var.get().strip()
            port = int(self.port_var.get().strip())
            client_id = self.client_id_var.get().strip()
            if not broker:
                raise ValueError("Broker 不能为空")
            if not client_id:
                raise ValueError("Client ID 不能为空")

            return SimulatorConfig(
                broker=broker,
                port=port,
                client_id=client_id,
                username=self.username_var.get().strip(),
                password=self.password_var.get(),
                use_random=self.use_random_var.get(),
                smoke=float(self.smoke_var.get().strip()),
                temp=float(self.temp_var.get().strip()),
                humi=float(self.humi_var.get().strip()),
                bat=int(self.bat_var.get().strip()),
                rssi=int(self.rssi_var.get().strip()),
                normal_interval=int(self.normal_interval_var.get().strip()),
                heartbeat_interval=int(self.heartbeat_interval_var.get().strip()),
                offline_timeout=int(self.offline_timeout_var.get().strip()),
            )
        except ValueError as exc:
            raise ValueError(f"参数格式不正确：{exc}") from exc

    def test_connection(self) -> None:
        try:
            config = self.build_runtime_config()
            self.core.stop_running()
            self.core.stop_event.clear()
            ok = self.core.connect(config)
            if ok:
                messagebox.showinfo("测试连接", "MQTT 连接成功")
            else:
                messagebox.showerror("测试连接", "MQTT 连接失败，请查看日志")
            self.core.disconnect()
            self.status_var.set("未连接")
        except Exception as exc:
            messagebox.showerror("测试连接", str(exc))

    def start_mode(self) -> None:
        devices = self.get_selected_devices()
        if not devices:
            messagebox.showwarning("提示", "请先勾选至少一台设备")
            return

        try:
            config = self.build_runtime_config()
            mode = self.mode_var.get()
            if mode == "normal":
                ok = self.core.start_multi_normal(devices, config)
            elif mode == "offline":
                ok = self.core.start_offline(devices[0], config)
            else:
                self.core.stop_running()
                self.core.stop_event.clear()
                ok = self.core.connect(config)
                if ok:
                    for device in devices:
                        ok = self.core.send_alert_once(device, config)
                    self.core.disconnect()
                    self.status_var.set("未连接")

            if not ok:
                messagebox.showerror("执行失败", "操作没有成功，请查看日志")
        except Exception as exc:
            messagebox.showerror("执行失败", str(exc))

    def send_once(self) -> None:
        devices = self.get_selected_devices()
        if not devices:
            messagebox.showwarning("提示", "请先勾选至少一台设备")
            return

        try:
            config = self.build_runtime_config()
            # 如果已经在正常运行中，复用现有连接；否则新建连接
            if self.core.connected:
                need_disconnect = False
            else:
                self.core.stop_event.clear()
                if not self.core.connect(config):
                    messagebox.showerror("发送失败", "MQTT 连接失败，请查看日志")
                    return
                need_disconnect = True

            mode = self.mode_var.get()
            ok = True
            for device in devices:
                if mode == "alert":
                    ok = self.core.send_alert_once(device, config) and ok
                else:
                    ok = self.core.send_normal_once(device, config) and ok
                    ok = self.core.send_heartbeat_once(device, config) and ok

            if need_disconnect:
                self.core.disconnect()
                self.status_var.set("未连接")
            if not ok:
                messagebox.showerror("发送失败", "消息发送失败，请查看日志")
        except Exception as exc:
            messagebox.showerror("发送失败", str(exc))

    def stop_mode(self) -> None:
        self.core.stop_running()
        self.status_var.set("未连接")

    def open_add_device(self) -> None:
        dialog = DeviceEditorDialog(self.root, "新增设备")
        self.root.wait_window(dialog)
        if dialog.result is None:
            return

        if self.find_device_by_code(dialog.result["device_code"]):
            messagebox.showwarning("提示", "设备编码已存在，请换一个编码")
            return

        next_id = max((item["device_id"] for item in self.devices), default=0) + 1
        payload = {"device_id": next_id, **dialog.result}
        self.devices.append(payload)
        self.save_json(DEVICES_PATH, self.devices)
        self.refresh_device_tree()
        self.select_device(payload["device_code"])

    def open_edit_device(self) -> None:
        # 取 Treeview 选中的行（非勾选）
        if self.device_tree is None:
            return
        selected = self.device_tree.selection()
        if not selected:
            messagebox.showwarning("提示", "请先在设备列表点击一行")
            return
        current = self.find_device_by_code(selected[0])
        if not current:
            return

        dialog = DeviceEditorDialog(self.root, "编辑设备", current)
        self.root.wait_window(dialog)
        if dialog.result is None:
            return

        same_code_device = self.find_device_by_code(dialog.result["device_code"])
        if same_code_device and same_code_device["device_id"] != current["device_id"]:
            messagebox.showwarning("提示", "设备编码已存在，请换一个编码")
            return

        for index, device in enumerate(self.devices):
            if device["device_id"] == current["device_id"]:
                self.devices[index] = {"device_id": current["device_id"], **dialog.result}
                break

        self.save_json(DEVICES_PATH, self.devices)
        self.refresh_device_tree()
        self.select_device(dialog.result["device_code"])

    def delete_device(self) -> None:
        if self.device_tree is None:
            return
        selected = self.device_tree.selection()
        if not selected:
            messagebox.showwarning("提示", "请先在设备列表点击一行")
            return
        current = self.find_device_by_code(selected[0])
        if not current:
            return

        confirmed = messagebox.askyesno("删除设备", f"确定删除设备 {current['device_code']} 吗？")
        if not confirmed:
            return

        self.devices = [item for item in self.devices if item["device_id"] != current["device_id"]]
        self.save_json(DEVICES_PATH, self.devices)
        self.refresh_device_tree()
        self.restore_last_selection()

    def find_device_by_code(self, code: str) -> dict | None:
        for device in self.devices:
            if device["device_code"] == code:
                return device
        return None

    def select_device(self, code: str) -> None:
        if self.device_tree is None:
            return
        self.selected_device_code_var.set(code)
        self.device_tree.selection_set(code)
        self.device_tree.focus(code)
        self.on_device_select()

    def save_runtime_config(self) -> None:
        self.config_data["mqtt"] = {
            "broker": self.broker_var.get().strip(),
            "port": int(self.port_var.get().strip()),
            "client_id": self.client_id_var.get().strip(),
            "username": self.username_var.get().strip(),
            "password": self.password_var.get(),
        }
        self.config_data["defaults"] = {
            "use_random": self.use_random_var.get(),
            "smoke": float(self.smoke_var.get().strip()),
            "temp": float(self.temp_var.get().strip()),
            "humi": float(self.humi_var.get().strip()),
            "bat": int(self.bat_var.get().strip()),
            "rssi": int(self.rssi_var.get().strip()),
            "normal_interval": int(self.normal_interval_var.get().strip()),
            "heartbeat_interval": int(self.heartbeat_interval_var.get().strip()),
            "offline_timeout": int(self.offline_timeout_var.get().strip()),
        }
        self.config_data["ui"] = {
            "last_device_code": self.selected_device_code_var.get(),
            "last_mode": self.mode_var.get(),
        }
        self.save_json(CONFIG_PATH, self.config_data)

    def on_close(self) -> None:
        try:
            self.save_runtime_config()
        except Exception as exc:
            messagebox.showwarning("提示", f"配置保存失败：{exc}")
        finally:
            self.core.stop_running()
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
