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
            throw new IllegalArgumentException("骞挎挱鍐呭涓嶈兘涓虹┖");
        }

        AlarmRecord alarm = resolveTargetAlarm(alarmId, deviceId);
        if (alarm == null) {
            throw new IllegalArgumentException("未找到可联动的告警记录");
        }

        SmokeDevice device = deviceMapper.selectById(alarm.getDeviceId());
        if (device == null) {
            throw new IllegalArgumentException("未找到广播目标设备");
        }

        BroadcastRecord record = new BroadcastRecord();
        record.setAlarmId(alarm.getId());
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

        boolean sent = mqttPublisher.sendCommand(
                device.getDeviceId(),
                buildPayload(
                        alarm,
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
            markAlarmBroadcasted(alarm, "MANUAL", "manual:" + record.getBroadcastArea());
            pushWebSocketNotification(record, device, alarm);
        }
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

            AlarmWebSocket.broadcast(wsPayload.toString());
            log.info("Broadcast WebSocket notification pushed to all clients, area={}", record.getBroadcastArea());
        } catch (Exception e) {
            log.warn("Failed to push broadcast WebSocket notification", e);
        }
    }
}