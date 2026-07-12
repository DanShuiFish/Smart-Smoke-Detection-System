package com.smartsmoke.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartsmoke.entity.*;
import com.smartsmoke.mapper.DashboardMapper;
import com.smartsmoke.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class DashboardServiceImpl implements DashboardService {

    private final DeviceService deviceService;
    private final AlarmRecordService alarmRecordService;
    private final SensorDataService sensorDataService;
    private final DashboardMapper dashboardMapper;

    @Override
    public DashboardStatsVO getStats() {
        DashboardStatsVO vo = new DashboardStatsVO();

        vo.setTotalDevices((int) deviceService.count());
        vo.setOnlineDevices((int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "ONLINE")));
        vo.setOfflineDevices((int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "OFFLINE")));
        vo.setErrorDevices((int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "ERROR")));

        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(LocalDate.now(), LocalTime.MAX);

        // 今日告警：排除 DEVICE_OFFLINE，与活跃告警统计口径一致
        vo.setTodayAlarms((int) alarmRecordService.count(
                new LambdaQueryWrapper<AlarmRecord>()
                        .between(AlarmRecord::getAlarmTime, todayStart, todayEnd)
                        .ne(AlarmRecord::getAlarmType, "DEVICE_OFFLINE")));
        // 活跃告警 = PENDING（新产生，未经人工处理），排除设备离线
        vo.setPendingAlarms((int) alarmRecordService.count(
                new LambdaQueryWrapper<AlarmRecord>()
                        .eq(AlarmRecord::getAlarmStatus, "PENDING")
                        .ne(AlarmRecord::getAlarmType, "DEVICE_OFFLINE")));
        vo.setConfirmedAlarms((int) alarmRecordService.count(
                new LambdaQueryWrapper<AlarmRecord>().eq(AlarmRecord::getAlarmStatus, "CONFIRMED")));
        vo.setResolvedAlarms((int) alarmRecordService.count(
                new LambdaQueryWrapper<AlarmRecord>().eq(AlarmRecord::getAlarmStatus, "RESOLVED")));

        return vo;
    }

    @Override
    public RealtimeVO getRealtime(int count) {
        RealtimeVO vo = new RealtimeVO();

        List<SensorData> latestData = sensorDataService.lambdaQuery()
                .orderByDesc(SensorData::getCreateTime)
                .last("LIMIT " + count).list();
        vo.setLatestData(latestData);

        List<AlarmRecord> activeAlarms = alarmRecordService.lambdaQuery()
                .notIn(AlarmRecord::getAlarmStatus, "ARCHIVED", "CLOSED")
                .orderByDesc(AlarmRecord::getAlarmTime)
                .list();
        vo.setActiveAlarms(activeAlarms);

        Map<String, Integer> statusMap = new HashMap<>();
        statusMap.put("ONLINE", (int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "ONLINE")));
        statusMap.put("OFFLINE", (int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "OFFLINE")));
        statusMap.put("ERROR", (int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "ERROR")));
        statusMap.put("INACTIVE", (int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().eq(SmokeDevice::getStatus, "INACTIVE")));
        vo.setDeviceStatusMap(statusMap);

        return vo;
    }

    @Override
    public List<AlarmTrendVO> getAlarmTrend(int period) {
        return dashboardMapper.getAlarmTrend(period);
    }

    @Override
    public DashboardStatsVO getStats(Set<Long> deviceIds) {
        if (deviceIds == null || deviceIds.isEmpty()) return getStats();
        DashboardStatsVO vo = new DashboardStatsVO();
        vo.setTotalDevices(deviceIds.size());
        vo.setOnlineDevices((int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().in(SmokeDevice::getId, deviceIds).eq(SmokeDevice::getStatus, "ONLINE")));
        vo.setOfflineDevices((int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().in(SmokeDevice::getId, deviceIds).eq(SmokeDevice::getStatus, "OFFLINE")));
        vo.setErrorDevices((int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().in(SmokeDevice::getId, deviceIds).eq(SmokeDevice::getStatus, "ERROR")));

        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(LocalDate.now(), LocalTime.MAX);
        vo.setTodayAlarms((int) alarmRecordService.count(
                new LambdaQueryWrapper<AlarmRecord>().in(AlarmRecord::getDeviceId, deviceIds)
                        .between(AlarmRecord::getAlarmTime, todayStart, todayEnd)
                        .ne(AlarmRecord::getAlarmType, "DEVICE_OFFLINE")));
        vo.setPendingAlarms((int) alarmRecordService.count(
                new LambdaQueryWrapper<AlarmRecord>().in(AlarmRecord::getDeviceId, deviceIds)
                        .eq(AlarmRecord::getAlarmStatus, "PENDING")
                        .ne(AlarmRecord::getAlarmType, "DEVICE_OFFLINE")));
        vo.setConfirmedAlarms((int) alarmRecordService.count(
                new LambdaQueryWrapper<AlarmRecord>().in(AlarmRecord::getDeviceId, deviceIds)
                        .eq(AlarmRecord::getAlarmStatus, "CONFIRMED")));
        vo.setResolvedAlarms((int) alarmRecordService.count(
                new LambdaQueryWrapper<AlarmRecord>().in(AlarmRecord::getDeviceId, deviceIds)
                        .eq(AlarmRecord::getAlarmStatus, "RESOLVED")));
        return vo;
    }

    @Override
    public RealtimeVO getRealtime(int count, Set<Long> deviceIds) {
        if (deviceIds == null || deviceIds.isEmpty()) return getRealtime(count);
        RealtimeVO vo = new RealtimeVO();
        vo.setLatestData(sensorDataService.lambdaQuery()
                .in(SensorData::getDeviceId, deviceIds)
                .orderByDesc(SensorData::getCreateTime)
                .last("LIMIT " + count).list());
        vo.setActiveAlarms(alarmRecordService.lambdaQuery()
                .in(AlarmRecord::getDeviceId, deviceIds)
                .notIn(AlarmRecord::getAlarmStatus, "ARCHIVED", "CLOSED")
                .orderByDesc(AlarmRecord::getAlarmTime)
                .list());
        Map<String, Integer> statusMap = new HashMap<>();
        statusMap.put("ONLINE", (int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().in(SmokeDevice::getId, deviceIds).eq(SmokeDevice::getStatus, "ONLINE")));
        statusMap.put("OFFLINE", (int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().in(SmokeDevice::getId, deviceIds).eq(SmokeDevice::getStatus, "OFFLINE")));
        statusMap.put("ERROR", (int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().in(SmokeDevice::getId, deviceIds).eq(SmokeDevice::getStatus, "ERROR")));
        statusMap.put("INACTIVE", (int) deviceService.count(
                new LambdaQueryWrapper<SmokeDevice>().in(SmokeDevice::getId, deviceIds).eq(SmokeDevice::getStatus, "INACTIVE")));
        vo.setDeviceStatusMap(statusMap);
        return vo;
    }

    @Override
    public List<DeviceLocationStatsVO> getDeviceStats() {
        return dashboardMapper.getDeviceLocationStats();
    }
}
