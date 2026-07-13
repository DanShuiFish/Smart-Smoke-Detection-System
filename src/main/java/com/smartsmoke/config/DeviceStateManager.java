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
 * 启动时清除上次会话残留的 Redis 心跳 key，信任 DB 中的设备状态不做修改，
 * 仅关闭停机期间产生的误报离线告警。
 * 关闭时记录 DB 最终状态并清理 Redis key，确保下次启动时 DB 是唯一真相来源。
 * 设备状态变更是由 MQTT 心跳和 Redis key 过期事件实时驱动的，
 * DeviceStateManager 只负责启动/关闭边界的状态持久化。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeviceStateManager {

    private final DeviceMapper deviceMapper;
    private final AlarmRecordService alarmRecordService;
    private final StringRedisTemplate stringRedisTemplate;

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
            // 1. 清除上次会话残留的 Redis 心跳 key
            //    应用停机期间 key 可能未过期，残留 key 会导致：
            //    a) 过期后触发离线检测，将 DB 中 ONLINE 设备错误标为 OFFLINE
            //    b) 模拟器重连后存在新旧 key 并存
            //    清除后 DB 成为唯一真相来源，新心跳到达时重建 key
            clearStaleHeartbeatKeys();

            // 2. 关闭因停机期间 Key 过期产生的误报离线告警
            int closed = closeStaleOfflineAlarms();
            if (closed > 0) {
                log.info("已自动关闭 {} 条停机期间产生的离线告警", closed);
            }

            // 3. 统计并信任 DB 中当前设备状态（不做任何修改）
            logDeviceState();
        } catch (Exception e) {
            log.error("设备状态恢复失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 应用关闭前：记录 DB 最终状态，清理 Redis 心跳 key。
     * 设备状态已由心跳处理器实时写入 DB，此处只做确认性记录和清理。
     * 清理 Redis key 确保下次启动时不会有残留 key 干扰状态判断。
     */
    @PreDestroy
    public void onShutdown() {
        log.info("=== 设备状态持久化：保存当前状态到数据库 ===");

        try {
            // 1. 记录 DB 最终设备状态快照（心跳处理器已实时写入，此处仅确认）
            logDeviceState();

            // 2. 清理 Redis 心跳 key
            //    应用关闭后 Redis key 会自然过期，但过期事件无订阅者（应用已下线）
            //    主动清理确保不会有残留 key 在下一次启动时造成状态混乱
            clearStaleHeartbeatKeys();

            log.info("设备状态持久化完成，下次启动将以 DB 状态为准");
        } catch (Exception e) {
            log.error("设备状态持久化失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 清除 Redis 中所有 device:heartbeat:* key。
     * 启动时清除残留 key 避免误触发离线检测；
     * 关闭时清除避免应用离线期间 key 过期产生无人监听的过期事件。
     */
    private void clearStaleHeartbeatKeys() {
        try {
            Set<String> keys = stringRedisTemplate.keys("device:heartbeat:*");
            if (keys != null && !keys.isEmpty()) {
                stringRedisTemplate.delete(keys);
                log.info("已清除 {} 个残留 Redis 心跳 key", keys.size());
            } else {
                log.debug("无残留 Redis 心跳 key 需要清除");
            }
        } catch (Exception e) {
            log.warn("清除 Redis 心跳 key 失败（Redis 可能未连接）: {}", e.getMessage());
        }
    }

    /**
     * 从 DB 读取并记录当前设备状态统计。
     * 信任 DB 为设备状态权威来源，不做任何修改。
     */
    private void logDeviceState() {
        try {
            long onlineCount = deviceMapper.selectCount(
                    new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "ONLINE"));
            long offlineCount = deviceMapper.selectCount(
                    new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "OFFLINE"));
            log.info("设备状态统计 (DB 权威): ONLINE={}, OFFLINE={}", onlineCount, offlineCount);
        } catch (Exception e) {
            log.warn("设备状态统计失败: {}", e.getMessage());
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
