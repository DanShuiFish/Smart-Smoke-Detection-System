# Task 5: WebSocket 增加 broadcastAll 方法

## Status: DONE

## 完成内容

- 在 `AlarmWebSocket.java` 中添加了 `broadcastAll` 静态方法，用于向所有已连接的 WebSocket 客户端广播消息（不分角色/地址）

## Commit

- `f892b14` feat: AlarmWebSocket 新增 broadcastAll 全量广播方法

## 说明

已确认类上存在 `@Slf4j` 注解，`broadcastAll` 方法放置于现有 `broadcast` 方法与 `broadcastByDevice` 方法之间，保持了代码的逻辑分组。
