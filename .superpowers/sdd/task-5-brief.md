### Task 5: WebSocket 增加 `broadcastAll` 方法

**Files:**
- Modify: `src/main/java/com/smartsmoke/websocket/AlarmWebSocket.java`

- [ ] **Step 1: 添加 broadcastAll 静态方法**

在 `AlarmWebSocket` 类中添加:

```java
/**
 * 向所有已连接的客户端广播消息（不分角色/地址）
 */
public static void broadcastAll(String message) {
    for (Session session : SESSION_USER.keySet()) {
        if (session.isOpen()) {
            try {
                session.getBasicRemote().sendText(message);
            } catch (Exception e) {
                log.error("broadcastAll 发送失败: {}", e.getMessage());
            }
        }
    }
}
```

确保该类有 `@Slf4j` 注解（检查类头）。

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/smartsmoke/websocket/AlarmWebSocket.java
git commit -m "feat: AlarmWebSocket 新增 broadcastAll 全量广播方法"
```

---

