package com.smartsmoke.service.impl;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartsmoke.entity.AiReviewRecord;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.entity.AlertThreshold;
import com.smartsmoke.entity.BroadcastRecord;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.AiReviewRecordMapper;
import com.smartsmoke.mapper.AlarmRecordMapper;
import com.smartsmoke.mapper.AlertThresholdMapper;
import com.smartsmoke.mapper.BroadcastRecordMapper;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.mqtt.MqttPublisher;
import com.smartsmoke.service.BroadcastService;
import com.smartsmoke.service.SensorDataService;
import com.smartsmoke.websocket.AlarmWebSocket;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class BroadcastServiceImpl implements BroadcastService {

    private static final Set<String> AUTO_ALLOWED_TYPES = Set.of("SMOKE_OVERFLOW", "TEMP_OVERFLOW", "FIRE");
    private static final Set<String> CLOSED_STATUSES = Set.of("RESOLVED", "ARCHIVED", "CLOSED");
    private static final int DEFAULT_SILENT_PERIOD_SECONDS = 300;

    private final BroadcastRecordMapper broadcastRecordMapper;
    private final AlarmRecordMapper alarmRecordMapper;
    private final DeviceMapper deviceMapper;
    private final AlertThresholdMapper alertThresholdMapper;
    private final AiReviewRecordMapper aiReviewRecordMapper;
    private final SensorDataService sensorDataService;
    private final MqttPublisher mqttPublisher;

    @Override
    @Transactional
    public BroadcastRecord createManualBroadcast(Long alarmId,
                                                 Long deviceId,
                                                 String broadcastArea,
                                                 String broadcastContent,
                                                 String broadcastType,
                                                 String triggerMode,
                                                 Long triggerUserId) {
        if (StrUtil.isBlank(broadcastContent)) {
            throw new IllegalArgumentException("广播内容不能为空");
        }

        // 查设备（必须存在）
        SmokeDevice device = deviceMapper.selectById(deviceId);
        if (device == null) {
            throw new IllegalArgumentException("未找到广播目标设备");
        }

        // 尝试关联告警（可选，区域广播无告警也允许）
        AlarmRecord alarm = (alarmId != null) ? resolveTargetAlarm(alarmId, deviceId) : null;
        if (device == null) {
            throw new IllegalArgumentException("未找到广播目标设备");
        }

        BroadcastRecord record = new BroadcastRecord();
        record.setAlarmId(alarm != null ? alarm.getId() : null);
        record.setDeviceId(device.getId());
        record.setBroadcastArea(StrUtil.blankToDefault(broadcastArea, buildBroadcastArea(device)));
        record.setBroadcastContent(broadcastContent);
        record.setBroadcastType(StrUtil.blankToDefault(broadcastType, "EMERGENCY"));
        record.setTriggerMode(StrUtil.blankToDefault(triggerMode, "MANUAL"));
        record.setTriggerUserId(triggerUserId);
        record.setMqttTopic(buildTopic(device.getDeviceId()));
        record.setSendStatus("PENDING");
        record.setRemark("manual_broadcast");
        broadcastRecordMapper.insert(record);

        // 区域广播无告警时使用简化 payload
        String payload;
        if (alarm != null) {
            payload = buildPayload(alarm, device, record.getBroadcastContent(),
                    record.getBroadcastType(), record.getTriggerMode(), record.getBroadcastArea());
        } else {
            payload = "{\"cmd\":\"broadcast\",\"area\":\"" + record.getBroadcastArea()
                    + "\",\"content\":\"" + record.getBroadcastContent() + "\"}";
        }
        boolean sent = false;
        try { sent = mqttPublisher.sendCommand(device.getDeviceId(), payload); }
        catch (Exception e) { log.warn("MQTT send failed for device {}: {}", device.getDeviceId(), e.getMessage()); }

        fillSendResult(record, sent, sent ? null : "MQTT publish failed");
        broadcastRecordMapper.updateById(record);
        if (sent && alarm != null) {
            markAlarmBroadcasted(alarm, "MANUAL", "manual:" + record.getBroadcastArea());
        }
        // WebSocket 推送 — 不受 MQTT 影响，确保模拟环境也能收到
        pushWebSocketNotification(record, device, alarm);
        log.info("广播完成: device={}, area={}, wsPushed=true", device.getDeviceId(), record.getBroadcastArea());
        return record;
    }

    @Override
    @Transactional
    public boolean tryAutoBroadcast(AlarmRecord alarmRecord, SmokeDevice device, String triggerReason) {
        if (alarmRecord == null) {
            return false;
        }
        if (device == null) {
            device = deviceMapper.selectById(alarmRecord.getDeviceId());
        }
        if (device == null) {
            log.warn("auto broadcast skipped, missing device for alarm {}", alarmRecord.getId());
            return false;
        }
        if (!isEligibleForAutoBroadcast(alarmRecord, device)) {
            return false;
        }

        BroadcastRecord record = new BroadcastRecord();
        record.setAlarmId(alarmRecord.getId());
        record.setDeviceId(device.getId());
        record.setBroadcastArea(buildBroadcastArea(device));
        record.setBroadcastContent(buildEmergencyContent(device));
        record.setBroadcastType("EMERGENCY");
        record.setTriggerMode("AUTO");
        record.setMqttTopic(buildTopic(device.getDeviceId()));
        record.setSendStatus("PENDING");
        record.setRemark(StrUtil.blankToDefault(triggerReason, "auto_broadcast"));
        broadcastRecordMapper.insert(record);

        boolean sent = mqttPublisher.sendCommand(
                device.getDeviceId(),
                buildPayload(
                        alarmRecord,
                        device,
                        record.getBroadcastContent(),
                        record.getBroadcastType(),
                        record.getTriggerMode(),
                        record.getBroadcastArea()
                )
        );

        fillSendResult(record, sent, sent ? null : "MQTT publish failed");
        broadcastRecordMapper.updateById(record);
        if (sent) {
            markAlarmBroadcasted(alarmRecord, "AUTO", triggerReason);
            pushWebSocketNotification(record, device, alarmRecord);
        }
        return sent;
    }

    private AlarmRecord resolveTargetAlarm(Long alarmId, Long deviceId) {
        if (alarmId != null) {
            return alarmRecordMapper.selectById(alarmId);
        }

        LambdaQueryWrapper<AlarmRecord> wrapper = new LambdaQueryWrapper<AlarmRecord>()
                .in(AlarmRecord::getAlarmType, AUTO_ALLOWED_TYPES)
                .notIn(AlarmRecord::getAlarmStatus, CLOSED_STATUSES)
                .orderByDesc(AlarmRecord::getAlarmTime)
                .last("LIMIT 1");
        if (deviceId != null) {
            wrapper.eq(AlarmRecord::getDeviceId, deviceId);
        }
        return alarmRecordMapper.selectOne(wrapper);
    }

    private boolean isEligibleForAutoBroadcast(AlarmRecord alarmRecord, SmokeDevice device) {
        if (!AUTO_ALLOWED_TYPES.contains(StrUtil.blankToDefault(alarmRecord.getAlarmType(), ""))) {
            return false;
        }
        if (alarmRecord.getIsBroadcastSent() != null && alarmRecord.getIsBroadcastSent() == 1) {
            return false;
        }
        if (CLOSED_STATUSES.contains(StrUtil.blankToDefault(alarmRecord.getAlarmStatus(), ""))) {
            return false;
        }
        if (!"HIGH".equalsIgnoreCase(alarmRecord.getAlarmLevel()) && !"CRITICAL".equalsIgnoreCase(alarmRecord.getAlarmLevel())) {
            return false;
        }
        if (isInSilentPeriod(device.getId(), mapThresholdType(alarmRecord.getAlarmType()))) {
            return false;
        }
        return hasAdditionalSignals(alarmRecord, device.getId());
    }

    private boolean hasAdditionalSignals(AlarmRecord alarmRecord, Long deviceDbId) {
        if ("CRITICAL".equalsIgnoreCase(alarmRecord.getAlarmLevel())) {
            return true;
        }
        if (isAiConfirmed(alarmRecord.getId())) {
            return true;
        }
        if (hasSmokeAndTempDanger(alarmRecord, deviceDbId)) {
            return true;
        }
        return hasConsecutiveAnomalies(alarmRecord, deviceDbId, 2, 5);
    }

    private boolean isAiConfirmed(Long alarmId) {
        AiReviewRecord review = aiReviewRecordMapper.selectOne(
                new LambdaQueryWrapper<AiReviewRecord>()
                        .eq(AiReviewRecord::getAlarmId, alarmId)
                        .eq(AiReviewRecord::getReviewResult, "FIRE_CONFIRMED")
                        .orderByDesc(AiReviewRecord::getCreateTime)
                        .last("LIMIT 1")
        );
        return review != null;
    }

    private boolean hasSmokeAndTempDanger(AlarmRecord alarmRecord, Long deviceDbId) {
        SensorData sensorData = alarmRecord.getSensorDataId() != null
                ? sensorDataService.getById(alarmRecord.getSensorDataId())
                : null;
        if (sensorData == null) {
            sensorData = sensorDataService.lambdaQuery()
                    .eq(SensorData::getDeviceId, deviceDbId)
                    .orderByDesc(SensorData::getCollectTime)
                    .last("LIMIT 1")
                    .one();
        }
        if (sensorData == null) {
            return false;
        }

        boolean smokeDanger = sensorData.getSmokeConcentration() != null
                && alarmRecord.getThresholdValue() != null
                && sensorData.getSmokeConcentration().compareTo(alarmRecord.getThresholdValue()) >= 0;
        boolean tempDanger = sensorData.getTemperature() != null
                && sensorData.getTemperature().compareTo(BigDecimal.valueOf(60)) >= 0;
        return smokeDanger && tempDanger;
    }

    private boolean hasConsecutiveAnomalies(AlarmRecord alarmRecord, Long deviceDbId, int requiredCount, int withinMinutes) {
        List<SensorData> recent = sensorDataService.lambdaQuery()
                .eq(SensorData::getDeviceId, deviceDbId)
                .ge(SensorData::getCollectTime, LocalDateTime.now().minusMinutes(withinMinutes))
                .orderByAsc(SensorData::getCollectTime)
                .list();
        if (recent.size() < requiredCount) {
            return false;
        }

        int consecutive = 0;
        for (SensorData item : recent) {
            if (isSensorDanger(item, alarmRecord)) {
                consecutive++;
                if (consecutive >= requiredCount) {
                    return true;
                }
            } else {
                consecutive = 0;
            }
        }
        return false;
    }

    private boolean isSensorDanger(SensorData item, AlarmRecord alarmRecord) {
        if (item == null) {
            return false;
        }
        if ("TEMP_OVERFLOW".equalsIgnoreCase(alarmRecord.getAlarmType())) {
            return item.getTemperature() != null
                    && item.getTemperature().compareTo(BigDecimal.valueOf(60)) >= 0;
        }
        BigDecimal threshold = alarmRecord.getThresholdValue() != null
                ? alarmRecord.getThresholdValue()
                : BigDecimal.valueOf(0.1);
        return item.getSmokeConcentration() != null
                && item.getSmokeConcentration().compareTo(threshold) >= 0;
    }

    private boolean isInSilentPeriod(Long deviceDbId, String thresholdType) {
        int silentSeconds = getSilentPeriod(deviceDbId, thresholdType);
        BroadcastRecord latest = broadcastRecordMapper.selectOne(
                new LambdaQueryWrapper<BroadcastRecord>()
                        .eq(BroadcastRecord::getDeviceId, deviceDbId)
                        .eq(BroadcastRecord::getSendStatus, "SENT")
                        .orderByDesc(BroadcastRecord::getSendTime)
                        .last("LIMIT 1")
        );
        if (latest == null) {
            return false;
        }

        LocalDateTime latestTime = latest.getSendTime() != null ? latest.getSendTime() : latest.getCreateTime();
        return latestTime != null && latestTime.plusSeconds(silentSeconds).isAfter(LocalDateTime.now());
    }

    private int getSilentPeriod(Long deviceDbId, String thresholdType) {
        AlertThreshold threshold = alertThresholdMapper.selectOne(
                new LambdaQueryWrapper<AlertThreshold>()
                        .and(w -> w.eq(AlertThreshold::getDeviceId, deviceDbId).or().isNull(AlertThreshold::getDeviceId))
                        .eq(AlertThreshold::getThresholdType, thresholdType)
                        .eq(AlertThreshold::getStatus, "ENABLED")
                        .orderByDesc(AlertThreshold::getDeviceId)
                        .orderByAsc(AlertThreshold::getSortOrder)
                        .last("LIMIT 1")
        );
        if (threshold == null || threshold.getSilentPeriod() == null || threshold.getSilentPeriod() <= 0) {
            return DEFAULT_SILENT_PERIOD_SECONDS;
        }
        return threshold.getSilentPeriod();
    }

    private void markAlarmBroadcasted(AlarmRecord alarmRecord, String triggerMode, String triggerReason) {
        alarmRecord.setIsBroadcastSent(1);
        JSONObject ext = StrUtil.isNotBlank(alarmRecord.getAlarmExt())
                ? JSONUtil.parseObj(alarmRecord.getAlarmExt())
                : new JSONObject();
        ext.set("broadcastMode", triggerMode);
        ext.set("broadcastReason", StrUtil.blankToDefault(triggerReason, ""));
        ext.set("broadcastAt", LocalDateTime.now().toString());
        alarmRecord.setAlarmExt(ext.toString());
        alarmRecordMapper.updateById(alarmRecord);
    }

    private void fillSendResult(BroadcastRecord record, boolean sent, String failureReason) {
        record.setSendStatus(sent ? "SENT" : "FAILED");
        record.setSendTime(sent ? LocalDateTime.now() : null);
        record.setFailureReason(sent ? null : failureReason);
        record.setRetryCount(sent ? 0 : 1);
    }

    private String buildBroadcastArea(SmokeDevice device) {
        return StrUtil.blankToDefault(device.getLocationBuilding(), "鏈煡妤兼爧")
                + StrUtil.blankToDefault(device.getLocationFloor(), "鏈煡妤煎眰")
                + StrUtil.blankToDefault(device.getLocationRoom(), "");
    }

    private String buildEmergencyContent(SmokeDevice device) {
        return "【火警紧急通知】"
                + StrUtil.blankToDefault(device.getLocationBuilding(), "当前")
                + StrUtil.blankToDefault(device.getLocationFloor(), "")
                + "区域检测到火情，请立即按照疏散通道有序撤离！";
    }

    private String buildPayload(AlarmRecord alarmRecord,
                                SmokeDevice device,
                                String broadcastContent,
                                String broadcastType,
                                String triggerMode,
                                String broadcastArea) {
        JSONObject payload = new JSONObject();
        payload.set("cmd", "broadcast");
        payload.set("alarmId", alarmRecord.getId());
        payload.set("alarmCode", alarmRecord.getAlarmCode());
        payload.set("alarmType", alarmRecord.getAlarmType());
        payload.set("broadcastType", broadcastType);
        payload.set("triggerMode", triggerMode);
        payload.set("area", broadcastArea);
        payload.set("building", device.getLocationBuilding());
        payload.set("floor", device.getLocationFloor());
        payload.set("room", device.getLocationRoom());
        payload.set("content", broadcastContent);
        return payload.toString();
    }

    private String buildTopic(String deviceCode) {
        return String.format("smoke/%s/cmd", deviceCode);
    }

    private String mapThresholdType(String alarmType) {
        if ("TEMP_OVERFLOW".equalsIgnoreCase(alarmType)) {
            return "TEMPERATURE";
        }
        return "SMOKE_CONCENTRATION";
}
    private void pushWebSocketNotification(BroadcastRecord record, SmokeDevice device, AlarmRecord alarm) {
        try {
            JSONObject wsPayload = new JSONObject();
            wsPayload.set("kind", "broadcast");
            wsPayload.set("action", "sent");
            wsPayload.set("alarmId", alarm != null ? alarm.getId() : null);
            wsPayload.set("deviceId", device != null ? device.getId() : null);
            wsPayload.set("deviceName", device != null ? device.getDeviceName() : "");
            wsPayload.set("building", device != null ? device.getLocationBuilding() : "");
            wsPayload.set("floor", device != null ? device.getLocationFloor() : "");
            wsPayload.set("area", record.getBroadcastArea());
            wsPayload.set("broadcastType", record.getBroadcastType());
            wsPayload.set("triggerMode", record.getTriggerMode());
            wsPayload.set("message", record.getBroadcastContent());
            wsPayload.set("broadcastContent", record.getBroadcastContent());
            wsPayload.set("time", record.getSendTime() != null ? record.getSendTime().toString() : LocalDateTime.now().toString());

            // 按设备推送：管理员全收，居民按地址匹配
            AlarmWebSocket.broadcastByDevice(device != null ? device.getId() : null, wsPayload.toString());
            log.info("Broadcast WS pushed: device={}, area={}", device != null ? device.getId() : null, record.getBroadcastArea());
        } catch (Exception e) {
            log.warn("Failed to push broadcast WebSocket notification", e);
        }
    }
}