# Task 3 实施报告

## 状态: DONE

## 提交

- `735e9eb` — `fix: 3D 可视化所有楼栋设备可点击，楼栋切换时设备列表更新`

## 改动文件

`src/main/resources/static/fe2/dashboard-enhanced.js`

## 改动内容

### Step 1: 移除 clickable 硬编码

在 `rebuildVizScene` 函数（第 1839 行）中，将：
```javascript
var isClickable=(bldName==='1栋');
```
替换为：
```javascript
var isClickable=true;
```

该变量作用于第 1861 行的 `mesh.userData.clickable`，三渲中点击时会检查 `ud.clickable`（第 1788 行）。修改后所有楼栋的设备球体均可点击。

### Step 2: 验证楼栋切换时设备列表更新

- `selectVizBld()`（第 1804 行）在第 1806 行已调用 `renderVizDevicePanel()`
- `selectVizFlr()`（第 1828 行）也调用 `renderVizDevicePanel()`
- 楼栋切换后，左侧设备面板随楼层选择正确刷新，无需额外改动。
