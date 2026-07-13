package com.smartsmoke.config;

import cn.hutool.crypto.digest.BCrypt;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.*;

/**
 * 幂等数据库初始化。
 * 每次启动仅检查最小数据集（用户/设备/阈值/配置）是否存在，
 * 缺失则自动补齐；已有数据不做任何修改或删除。
 * <p>
 * 设备状态、阈值配置等用户修改在重启后完整保留。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements ApplicationRunner {

    private final DataSource dataSource;
    private final UserMapper userMapper;
    private final DeviceMapper deviceMapper;

    @Override
    public void run(ApplicationArguments args) {
        try (Connection conn = dataSource.getConnection(); Statement stmt = conn.createStatement()) {

            // Step 0: ALTER TABLE 补齐列（安全，每次启动都执行）
            safeAlter(stmt, "sys_user", "resident_building", "VARCHAR(32) NULL COMMENT '居民住址-楼栋'");
            safeAlter(stmt, "sys_user", "resident_floor",   "VARCHAR(32) NULL COMMENT '居民住址-楼层'");
            safeAlter(stmt, "sys_user", "resident_room",    "VARCHAR(32) NULL COMMENT '居民住址-房间'");
            try { stmt.execute("ALTER TABLE broadcast_record MODIFY COLUMN alarm_id BIGINT NULL COMMENT '告警ID(区域广播可为空)'"); }
            catch (Exception e) { log.warn("ALTER broadcast_record.alarm_id 失败(可能已修改): {}", e.getMessage()); }

            // Step 1: 检查是否已初始化过 — 有哨兵配置则跳过种子数据创建
            if (isAlreadySeeded(stmt)) {
                log.info("数据库已初始化，跳过种子数据创建。当前: {} 用户, {} 设备",
                        userMapper.selectCount(null),
                        deviceMapper.selectCount(null));
                return;
            }

            // Step 2: 首次启动 — 创建种子数据
            ensureUsers();
            ensureDevices();
            ensureThresholds(stmt);
            ensureConfigs(stmt);

            // Step 3: 写入哨兵标记，后续启动自动跳过
            try {
                stmt.execute("INSERT INTO system_config (config_key, config_value, description) " +
                        "VALUES ('init.seeded', 'true', '数据库种子数据已初始化标记')");
            } catch (Exception e) {
                log.warn("写入哨兵标记失败(可能已存在): {}", e.getMessage());
            }

            log.info("数据库首次初始化完成: {} 用户, {} 设备",
                    userMapper.selectCount(null),
                    deviceMapper.selectCount(null));

        } catch (Exception e) {
            log.error("数据库初始化失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 通过 system_config 表中的 init.seeded 哨兵判断是否已完成首次初始化。
     */
    private boolean isAlreadySeeded(Statement stmt) {
        try {
            ResultSet rs = stmt.executeQuery(
                    "SELECT config_value FROM system_config WHERE config_key = 'init.seeded'");
            boolean seeded = rs.next() && "true".equalsIgnoreCase(rs.getString("config_value"));
            rs.close();
            return seeded;
        } catch (Exception e) {
            // 表可能还不存在，视为未初始化
            return false;
        }
    }

    private void ensureUsers() {
        upsertUser("admin",    "admin123", "管理员", null,              "ADMIN");
        upsertUser("zhangsan", "123456",   "张三",   arr("1栋","3层","301"), "RESIDENT");
        upsertUser("lisi",     "123456",   "李四",   arr("2栋","3层","302"), "RESIDENT");
    }

    private void ensureDevices() {
        // 仅当设备完全不存在时才创建种子数据（按 device_id 判断，不强制覆盖状态）
        ensureDeviceIfMissing("SMOKE-001", "1栋3层301-A", "1栋","3层","301", 85, 90, 90);
        ensureDeviceIfMissing("SMOKE-002", "1栋3层302-A", "1栋","3层","302", 72, 78, 90);
        ensureDeviceIfMissing("SMOKE-003", "1栋5层501-A", "1栋","5层","501", 90, 95, 90);
        ensureDeviceIfMissing("SMOKE-004", "2栋3层301-A", "2栋","3层","301", 80, 88, 90);
        ensureDeviceIfMissing("SMOKE-005", "2栋3层302-A", "2栋","3层","302", 65, 72, 90);
        ensureDeviceIfMissing("SMOKE-006", "2栋5层501-A", "2栋","5层","501", 92, 96, 90);
    }

    private void ensureThresholds(Statement stmt) throws Exception {
        try (ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM alert_threshold")) {
            if (rs.next() && rs.getInt(1) > 0) return;
        } catch (Exception ignored) {}
        stmt.execute("INSERT INTO alert_threshold (id, threshold_type, threshold_max, alarm_level, status, sort_order) VALUES " +
                "(1, 'SMOKE_CONCENTRATION', 0.30, 'HIGH',   'ENABLED', 1)," +
                "(2, 'SMOKE_CONCENTRATION', 0.15, 'MEDIUM', 'ENABLED', 2)," +
                "(3, 'TEMPERATURE',         65.0, 'HIGH',   'ENABLED', 1)");
    }

    private void ensureConfigs(Statement stmt) throws Exception {
        try (ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM system_config")) {
            if (rs.next() && rs.getInt(1) > 0) return;
        } catch (Exception ignored) {}
        stmt.execute("INSERT INTO system_config (config_key, config_value, description) VALUES " +
                "('alarm.silent_period',   '300',  '告警静默期(秒)')," +
                "('broadcast.auto_enable', 'true', 'AI确认火情后自动广播')," +
                "('system.version',        'v3.0', '系统版本')");
    }

    // ===== helpers =====

    private void upsertUser(String username, String rawPwd, String name, String[] addr, String role) {
        // 使用原始 JDBC 查询（绕过 MyBatis-Plus 逻辑删除过滤器），
        // 防止已删除用户被重新创建
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT COUNT(*) FROM sys_user WHERE username = ?")) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next() && rs.getInt(1) > 0) return;
            }
            SysUser u = new SysUser();
            u.setUsername(username); u.setPassword(BCrypt.hashpw(rawPwd));
            u.setRealName(name); u.setRole(role); u.setStatus("ENABLED"); u.setLoginCount(1);
            if (addr != null && addr.length >= 2) {
                u.setResidentBuilding(addr[0]); u.setResidentFloor(addr[1]);
                if (addr.length >= 3) u.setResidentRoom(addr[2]);
            }
            userMapper.insert(u);
            log.info("创建用户: {} (role={})", username, role);
        } catch (Exception e) { log.error("创建用户 {} 失败: {}", username, e.getMessage()); }
    }

    private void ensureDeviceIfMissing(String code, String name,
                                        String bld, String flr, String room,
                                        int bat, int sig, int heartbeatTimeout) {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT COUNT(*) FROM smoke_device WHERE device_id = ?")) {
            // 使用原始 JDBC 查询（绕过 MyBatis-Plus 逻辑删除过滤器），
            // 防止已删除设备被重新创建
            ps.setString(1, code);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next() && rs.getInt(1) > 0) return;
            }
            SmokeDevice d = new SmokeDevice();
            d.setDeviceId(code); d.setDeviceName(name); d.setDeviceModel("YG-800S");
            d.setLocationBuilding(bld); d.setLocationFloor(flr);
            d.setLocationRoom(room); d.setBattery(bat); d.setSignalStrength(sig);
            d.setHeartbeatTimeout(heartbeatTimeout);
            d.setStatus("ONLINE");
            deviceMapper.insert(d);
            log.info("创建种子设备: {} ({})", code, name);
        } catch (Exception e) { log.error("创建设备 {} 失败: {}", code, e.getMessage()); }
    }

    private void safeAlter(Statement stmt, String table, String col, String def) {
        try { stmt.execute("ALTER TABLE " + table + " ADD COLUMN " + col + " " + def); }
        catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("Duplicate")) return;
            log.warn("ALTER TABLE {}.{} 失败: {}", table, col, e.getMessage());
        }
    }

    private static String[] arr(String... s) { return s; }
}
