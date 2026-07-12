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
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 设备状态生命周期管理器
 * <p>
 * 启动时关闭停机期间产生的误报离线告警。
 * 不主动修改设备状态或 Redis Key——设备状态由心跳自然维护。
 * 关闭时保留所有 Redis Key，Key 自然过期即可；停机期间的过期事件因
 * Redis pub/sub 无持久化而自动丢弃，不会误报。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeviceStateManager {

    private final DeviceMapper deviceMapper;
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
     * 应用关闭前：保留 Redis 心跳 Key，不删除。
     * 删除 Key 会导致重启后设备状态与心跳不一致——Key 已消失但 DB 仍为 ONLINE。
     * 让 Key 自然过期即可；停机期间过期事件因 pub/sub 无持久化而自动丢弃，不会误报离线。
     */
    @PreDestroy
    public void onShutdown() {
        log.info("=== 设备状态保留：Redis 心跳 Key 保持不变，设备 DB 状态不受影响 ===");
        // no-op: 保留所有心跳 Key，尊重设备真实状态
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
