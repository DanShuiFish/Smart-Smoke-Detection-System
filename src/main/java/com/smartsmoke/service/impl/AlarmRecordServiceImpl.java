package com.smartsmoke.service.impl;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.AlarmRecordMapper;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.service.AlarmRecordService;
import com.smartsmoke.websocket.AlarmWebSocket;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Slf4j
@Service
public class AlarmRecordServiceImpl extends ServiceImpl<AlarmRecordMapper, AlarmRecord> implements AlarmRecordService {

    private static final List<String> ACTIVE_STATUSES = List.of("PENDING", "CONFIRMING", "CONFIRMED");

    @Autowired
    private DeviceMapper deviceMapper;

    @Override
    public void createOfflineAlarm(String deviceCode) {
        SmokeDevice device = deviceMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<SmokeDevice>().eq("device_id", deviceCode)
        );

        if (device == null) {
            log.warn("createOfflineAlarm: device not found {}", deviceCode);
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        AlarmRecord record = lambdaQuery()
                .eq(AlarmRecord::getDeviceId, device.getId())
                .eq(AlarmRecord::getAlarmType, "DEVICE_OFFLINE")
                .in(AlarmRecord::getAlarmStatus, ACTIVE_STATUSES)
                .orderByDesc(AlarmRecord::getAlarmTime)
                .last("LIMIT 1")
                .one();

        JSONObject ext = record != null && StrUtil.isNotBlank(record.getAlarmExt())
                ? JSONUtil.parseObj(record.getAlarmExt())
                : new JSONObject();
        ext.set("triggerCount", ext.getInt("triggerCount", 0) + 1);
        ext.set("lastTriggerTime", now.toString());
        ext.set("deviceName", device.getDeviceName());
        ext.set("location", buildLocation(device));
        ext.set("sourceType", "REDIS_HEARTBEAT");

        if (record == null) {
            record = new AlarmRecord();
            record.setDeviceId(device.getId());
            record.setAlarmCode(buildAlarmCode(deviceCode));
            record.setAlarmType("DEVICE_OFFLINE");
            record.setAlarmLevel("HIGH");
            record.setAlarmStatus("PENDING");
            record.setAlarmTime(now);
            record.setCreateTime(now);
            record.setIsVisionReviewed(0);
            record.setIsBroadcastSent(0);
        } else {
            record.setAlarmStatus("CONFIRMING");
            record.setAlarmTime(now);
        }

        record.setRemark(device.getDeviceName() + " 心跳超时离线 @ " + buildLocation(device));
        record.setAlarmExt(ext.toString());

        if (record.getId() == null) {
            save(record);
        } else {
            updateById(record);
        }

        log.warn("offline alarm upserted {} alarmCode={}", deviceCode, record.getAlarmCode());
        AlarmWebSocket.broadcastByDevice(record.getDeviceId(), buildWebSocketPayload(record, device));
    }

    private String buildAlarmCode(String deviceCode) {
        String datePart = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String timePart = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HHmmssSSS"));
        return "ALG-" + datePart + "-" + timePart + "-" + deviceCode;
    }

    private String buildLocation(SmokeDevice device) {
        return StrUtil.join("", safe(device.getLocationBuilding()), safe(device.getLocationFloor()), safe(device.getLocationRoom()));
    }

    private String buildWebSocketPayload(AlarmRecord record, SmokeDevice device) {
        JSONObject payload = new JSONObject();
        payload.set("kind", "alarm");
        payload.set("action", "updated");
        payload.set("id", record.getId());
        payload.set("alarmCode", record.getAlarmCode());
        payload.set("alarmType", record.getAlarmType());
        payload.set("alarmTypeText", "设备离线");
        payload.set("alarmLevel", record.getAlarmLevel());
        payload.set("alarmLevelText", "高");
        payload.set("alarmStatus", record.getAlarmStatus());
        payload.set("message", record.getRemark());
        payload.set("alarmTime", record.getAlarmTime() != null ? record.getAlarmTime().format(com.smartsmoke.common.DateTimeConst.FMT) : "");
        payload.set("deviceId", device.getDeviceId());
        payload.set("deviceName", device.getDeviceName());
        payload.set("building", device.getLocationBuilding());
        payload.set("floor", device.getLocationFloor());
        payload.set("room", device.getLocationRoom());
        return payload.toString();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
