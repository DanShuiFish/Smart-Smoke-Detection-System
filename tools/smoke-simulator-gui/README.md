# 智慧烟感模拟器 GUI

这是一个独立于主项目运行的 Python 桌面工具，使用 `tkinter` 构建，适合本地调试和课堂演示。

## 功能

- 图形化配置 MQTT 连接
- 预置默认设备，也支持新增、编辑、删除设备
- 支持正常模式、告警模式、离线模式
- 正常模式可在“随机值”和“自定义值”之间切换
- 运行日志实时显示

## 安装依赖

```bash
python -m pip install -r requirements.txt
```

## 运行方式

```bash
python app.py
```

如果你想直接用你电脑上的 Python，也可以这样运行：

```bash
E:\annicoda\python.exe app.py
```

## 打包成 exe

先安装 PyInstaller：

```bash
E:\annicoda\python.exe -m pip install pyinstaller
```

然后在当前目录双击：

```text
build_exe.bat
```

或者手动执行：

```bash
E:\annicoda\python.exe -m PyInstaller --noconfirm --clean --onefile --windowed --name SmokeSimulatorGUI --add-data "config.json;." --add-data "devices.json;." app.py
```

打包完成后，生成文件在：

```text
tools\smoke-simulator-gui\dist\SmokeSimulatorGUI.exe
```

## 文件说明

- `app.py`：图形界面入口
- `simulator_core.py`：MQTT 通信与模拟逻辑
- `config.json`：连接配置和默认参数
- `devices.json`：默认设备与自定义设备列表
