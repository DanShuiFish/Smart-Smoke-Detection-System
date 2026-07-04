package com.smartsmoke.config;

import com.smartsmoke.service.AlarmRecordService;
import com.smartsmoke.service.DeviceService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

/**
 * Redis Keyspace 过期事件监听器 — BE2 领地
 * 监听 device:heartbeat:* Key 过期，触发设备离线告警。
 */
@Slf4j
@Component
public class RedisKeyspaceListener implements MessageListener {

    private static final String HEARTBEAT_PREFIX = "device:heartbeat:";

    @Autowired
    private DeviceService deviceService;

    @Autowired
    private AlarmRecordService alarmRecordService;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        String expiredKey = new String(message.getBody());
        log.debug("Redis key expired: {}", expiredKey);

        // 只处理心跳 Key
        if (!expiredKey.startsWith(HEARTBEAT_PREFIX)) {
            return;
        }

        String deviceCode = expiredKey.substring(HEARTBEAT_PREFIX.length());
        log.warn("设备心跳超时，触发离线告警: {}", deviceCode);

        try {
            // 1. 更新设备状态为 OFFLINE
            deviceService.updateOffline(deviceCode);

            // 2. 生成 DEVICE_OFFLINE 告警
            alarmRecordService.createOfflineAlarm(deviceCode);

            log.info("设备离线告警处理完成: {}", deviceCode);
        } catch (Exception e) {
            log.error("处理设备离线告警失败: {}", deviceCode, e);
        }
    }
}
