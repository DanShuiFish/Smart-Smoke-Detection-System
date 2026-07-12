### Task 3: Bug 修复 — 3D 可视化设备点击限制

**Files:**
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

- [ ] **Step 1: 移除 `clickable` 硬编码**

找到 `rebuildVizScene` 函数内创建设备球体处 (~L1839)，将:
```javascript
clickable: (bldName === '1栋'),
```
替换为:
```javascript
clickable: true,
```

找到 `renderVizBlds` 和 `selectVizBld` 函数，在 `selectVizBld` 中 (L1806)，`rebuildVizScene` 调用前，确保参数传入正确。确认 `rebuildVizScene` 函数签名接受 `devices` 数组，且调用处 `rebuildVizScene(devicesForFloor)` 传入正确的设备列表。

- [ ] **Step 2: 验证楼栋切换时设备列表更新**

在 `selectVizBld` 末尾确保: 每次选楼栋时 `renderVizDevicePanel()` 重新渲染左侧设备面板。

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/static/fe2/dashboard-enhanced.js
git commit -m "fix: 3D 可视化所有楼栋设备可点击，楼栋切换时设备列表更新"
```

---

