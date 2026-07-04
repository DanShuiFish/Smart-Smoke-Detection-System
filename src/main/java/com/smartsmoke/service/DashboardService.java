package com.smartsmoke.service;

import com.smartsmoke.entity.*;

import java.util.List;

public interface DashboardService {

    DashboardStatsVO getStats();

    RealtimeVO getRealtime(int count);

    List<AlarmTrendVO> getAlarmTrend(int period);

    List<DeviceLocationStatsVO> getDeviceStats();
}
