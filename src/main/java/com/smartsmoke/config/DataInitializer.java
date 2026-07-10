package com.smartsmoke.config;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
 * 自愈式数据库初始化。
 * 每次启动检查最小数据集是否完整，缺失则自动补齐（不删除已有数据）。
 * 只有首次启动时执行 TRUNCATE + 完整 INSERT。
 * <p>
 * 生产部署前请删除此类。
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

            // Step 0: ALTER TABLE 补齐列（安全，每次启动都检查）
            safeAlter(stmt, "sys_user", "resident_building", "VARCHAR(32) NULL COMMENT '居民住址-楼栋'");
            safeAlter(stmt, "sys_user", "resident_floor",   "VARCHAR(32) NULL COMMENT '居民住址-楼层'");
            safeAlter(stmt, "sys_user", "resident_room",    "VARCHAR(32) NULL COMMENT '居民住址-房间'");
            try { stmt.execute("ALTER TABLE broadcast_record MODIFY COLUMN alarm_id BIGINT NULL COMMENT '告警ID(区域广播可为空)'"); }
            catch (Exception e) { log.warn("ALTER broadcast_record.alarm_id 失败(可能已修改): {}", e.getMessage()); }

            // Step 1: 检查是否需要完整初始化
            long userCount = userMapper.selectCount(new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, "admin"));
            long deviceCount = deviceMapper.selectCount(null);

            if (userCount == 0 || deviceCount == 0) {
                log.info("=== 数据库完整初始化（首次或数据缺失）===");
                fullReset(stmt);
            } else {
                log.info("数据库已有 {} 用户, {} 设备，跳过完整初始化", userCount, deviceCount);
            }

            // Step 2: 确保最小数据集存在（幂等 INSERT IGNORE）
            ensureUsers();
            ensureDevices();
            ensureThresholds(stmt);
            ensureConfigs(stmt);

            log.info("数据库自检完成: {} 用户, {} 设备",
                    userMapper.selectCount(null),
                    deviceMapper.selectCount(null));

        } catch (Exception e) {
            log.error("数据库初始化失败: {}", e.getMessage(), e);
        }
    }

    private void fullReset(Statement stmt) throws Exception {
        String[] tables = {"operation_log", "broadcast_record", "ai_review_record",
                "conversation_log", "alarm_record", "sensor_data", "device_binding",
                "alert_threshold", "system_config", "smoke_device", "sys_user"};
        stmt.execute("SET FOREIGN_KEY_CHECKS = 0");
        for (String t : tables) {
            try { stmt.execute("TRUNCATE TABLE " + t); } catch (Exception ignored) {}
        }
        stmt.execute("SET FOREIGN_KEY_CHECKS = 1");
        log.info("TRUNCATE {} 张表完成", tables.length);
    }

    private void ensureUsers() {
        upsertUser("admin",    "admin123", "管理员", null,              "ADMIN");
        upsertUser("zhangsan", "123456",   "张三",   arr("1栋","3层","301"), "RESIDENT");
        upsertUser("lisi",     "123456",   "李四",   arr("2栋","3层","302"), "RESIDENT");
    }

    private void ensureDevices() {
        upsertDevice(1L, "SMOKE-001", "1栋3层301-A", "ONLINE", "1栋","3层","301", 85, 90);
        upsertDevice(2L, "SMOKE-002", "1栋3层302-A", "ONLINE", "1栋","3层","302", 72, 78);
        upsertDevice(3L, "SMOKE-003", "1栋5层501-A", "ONLINE", "1栋","5层","501", 90, 95);
        upsertDevice(4L, "SMOKE-004", "2栋3层301-A", "ONLINE", "2栋","3层","301", 80, 88);
        upsertDevice(5L, "SMOKE-005", "2栋3层302-A", "ONLINE", "2栋","3层","302", 65, 72);
        upsertDevice(6L, "SMOKE-006", "2栋5层501-A", "ONLINE", "2栋","5层","501", 92, 96);
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
        try {
            SysUser exist = userMapper.selectOne(
                    new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
            if (exist != null) return;
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

    private void upsertDevice(Long id, String code, String name, String status,
                               String bld, String flr, String room, int bat, int sig) {
        try {
            if (deviceMapper.selectById(id) != null) return;
            SmokeDevice d = new SmokeDevice();
            d.setId(id); d.setDeviceId(code); d.setDeviceName(name); d.setDeviceModel("YG-800S");
            d.setStatus(status); d.setLocationBuilding(bld); d.setLocationFloor(flr);
            d.setLocationRoom(room); d.setBattery(bat); d.setSignalStrength(sig);
            d.setHeartbeatTimeout(30);
            deviceMapper.insert(d);
            log.info("创建设备: {} ({})", code, name);
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
