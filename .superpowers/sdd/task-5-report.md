# Task 5 Report: JS — 修复管理端告警详情显示 AI 复核数据

## 改动的文件

- **`src/main/resources/static/fe2/dashboard-enhanced.js`**

## 改动内容

将 `showAlarmDetail()` 函数从同步本地查找（7 个字段）完整替换为异步 API 调用版本（17+ 个字段，含 AI 复核区域）：

1. **调用方式**: 从 `state.alarmsPage.records` 本地查找改为 `await apiRequest("/alarms/" + id)` 异步请求
2. **字段数量**: 从 7 个扩展为 17 个基础字段 + AI 复核区域（最多 6 个附加行）
3. **AI 复核**: 当 `item.aiReview` 存在时，显示分隔线 "── AI复核结果 ──"、AI 判定、置信度、人工复核状态、人工结果、图像路径；不存在时显示 "── AI复核 ── 未触发视觉复核"
4. **错误处理**: 增加了 `try/catch`，失败时调用 `showGlobalAlert()` 提示
5. **变量声明**: 全部使用 `var`

## 验证

- [x] 函数签名已变为 `async function showAlarmDetail(id)`
- [x] 使用 `apiRequest("/alarms/" + id)` 异步调用
- [x] 显示 17 个基础字段（含烟雾浓度、阈值、视觉复核标志等）
- [x] AI 复核区域根据 `aiReview` 是否存在动态展示
- [x] 使用 `formatReviewResult()` / `formatManualReview()` 等工具函数
- [x] 错误时调用 `showGlobalAlert()`
