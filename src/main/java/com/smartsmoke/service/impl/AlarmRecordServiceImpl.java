package com.smartsmoke.service.impl;

import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
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

@Slf4j
@Service
public class AlarmRecordServiceImpl extends ServiceImpl<AlarmRecordMapper, AlarmRecord> implements AlarmRecordService {

    @Autowired
    private DeviceMapper deviceMapper;

    @Override
    public void createOfflineAlarm(String deviceCode) {
        // 查找设备
        SmokeDevice device = deviceMapper.selectOne(
                new QueryWrapper<SmokeDevice>().eq("device_id", deviceCode));

        if (device == null) {
            log.warn("createOfflineAlarm: 设备不存在 {}", deviceCode);
            return;
        }

        // 生成告警编号 ALG-yyyyMMdd-HHmmss-SSS-设备简称
        // 使用毫秒时间戳确保并发场景下唯一，末尾拼接设备代码避免不同线程同毫秒碰撞
        String datePart = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String timePart = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HHmmss"));
        String alarmCode = "ALG-" + datePart + "-" + timePart + "-" + deviceCode;

        // 创建离线告警
        AlarmRecord record = new AlarmRecord();
        record.setDeviceId(device.getId());
        record.setAlarmCode(alarmCode);
        record.setAlarmType("DEVICE_OFFLINE");
        record.setAlarmLevel("HIGH");
        record.setAlarmStatus("PENDING");
        record.setAlarmTime(LocalDateTime.now());
        record.setRemark(device.getDeviceName() + " 心跳超时离线");
        save(record);

        log.warn("设备离线告警已创建: {} alarmCode={}", deviceCode, alarmCode);

        // 推送 WebSocket 到前端大屏
        String wsMsg = JSONUtil.toJsonStr(record);
        AlarmWebSocket.broadcast(wsMsg);
    }
}