package com.smartsmoke.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.service.AlarmRecordService;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

/**
 * 设备状态生命周期管理器
 * <p>
 * 解决应用重启导致设备全部变为 OFFLINE 的问题：
 * 1. 启动时关闭停机期间产生的误报离线告警（不设置 Redis Key，由模拟器心跳自然创建）
 * 2. 关闭前删除所有 Redis 心跳 Key，防止停机期间 Key 过期触发 Keyspace 通知
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeviceStateManager {

    private static final String HEARTBEAT_KEY_PREFIX = "device:heartbeat:";

    private final DeviceMapper deviceMapper;
    private final StringRedisTemplate stringRedisTemplate;
    private final AlarmRecordService alarmRecordService;

    /**
     * 最近一次应用启动时间，用于 RedisKeyspaceListener 判断是否为启动初期的误报。
     * package-private 以便 RedisKeyspaceListener 读取。
     * 类加载时初始化，确保在 ApplicationReadyEvent 之前就有值。
     */
    static volatile LocalDateTime startupTime = LocalDateTime.now();

    /**
     * 应用启动完成后：关闭上次停机期间产生的误报离线告警。
     * 不设置 Redis Key —— Redis Key 由模拟器/真实设备发送心跳时自然创建和续期。
     * 使用 ApplicationReadyEvent 确保在 DataInitializer 之后执行。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        startupTime = LocalDateTime.now();
        log.info("=== 设备状态恢复：启动时间={} ===", startupTime);

        try {
            // 关闭因停机期间 Key 过期产生的误报离线告警
            int closed = closeStaleOfflineAlarms();
            if (closed > 0) {
                log.info("已自动关闭 {} 条停机期间产生的离线告警", closed);
            }

            // 统计当前设备状态
            long onlineCount = deviceMapper.selectCount(
                    new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "ONLINE"));
            long offlineCount = deviceMapper.selectCount(
                    new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "OFFLINE"));
            log.info("设备状态统计: ONLINE={}, OFFLINE={} (登录模拟器后将自动为 ONLINE 设备发送心跳)",
                    onlineCount, offlineCount);
        } catch (Exception e) {
            log.error("设备状态恢复失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 应用关闭前：删除所有设备心跳 Redis Key。
     * 防止应用已停止但 Redis Key 自然过期后触发 Keyspace 通知将设备标记为 OFFLINE。
     */
    @PreDestroy
    public void onShutdown() {
        log.info("=== 设备状态保存：清理 Redis 心跳 Key ===");
        try {
            Set<String> keys = stringRedisTemplate.keys(HEARTBEAT_KEY_PREFIX + "*");
            if (keys != null && !keys.isEmpty()) {
                Long deleted = stringRedisTemplate.delete(keys);
                log.info("已清理 {} 个设备心跳 Redis Key，设备 DB 状态保持不变", deleted);
            } else {
                log.info("无心跳 Key 需要清理");
            }
        } catch (Exception e) {
            log.error("清理 Redis 心跳 Key 失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 关闭停机期间产生的误报离线告警。
     * 遍历所有设备，关闭其 PENDING 状态的 DEVICE_OFFLINE 告警。
     */
    private int closeStaleOfflineAlarms() {
        try {
            List<SmokeDevice> allDevices = deviceMapper.selectList(null);
            int closed = 0;
            for (SmokeDevice dev : allDevices) {
                List<AlarmRecord> active = alarmRecordService.lambdaQuery()
                        .eq(AlarmRecord::getDeviceId, dev.getId())
                        .eq(AlarmRecord::getAlarmType, "DEVICE_OFFLINE")
                        .in(AlarmRecord::getAlarmStatus, List.of("PENDING", "CONFIRMING", "CONFIRMED"))
                        .list();
                for (AlarmRecord a : active) {
                    a.setAlarmStatus("CLOSED");
                    a.setRemark("系统重启自动恢复，关闭离线告警");
                    alarmRecordService.updateById(a);
                    closed++;
                }
            }
            return closed;
        } catch (Exception e) {
            log.warn("关闭过期离线告警失败: {}", e.getMessage());
            return 0;
        }
    }
}
