### Task 1: Bug 修复 — 后台日志清理

**Files:**
- Modify: `src/main/resources/application.yml`

- [ ] **Step 1: 修改日志级别和移除 SQL 日志**

将 `com.smartsmoke` 的日志级别从 `debug` 改为 `warn`，删除 MyBatis SQL 日志实现。

`application.yml` 中找到:
```yaml
logging:
  level:
    com.smartsmoke: debug
```
替换为:
```yaml
logging:
  level:
    com.smartsmoke: warn
```

找到 `mybatis-plus.configuration.log-impl: org.apache.ibatis.logging.slf4j.Slf4jImpl` 并删除该行（保留其他 mybatis-plus 配置不变）。

- [ ] **Step 2: 验证**

启动后端，确认控制台不再打印 DEBUG 日志和 SQL 语句，仅保留 WARN/ERROR 级别输出。

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/application.yml
git commit -m "fix: 关闭 DEBUG 日志和 MyBatis SQL 日志输出"
```

---

