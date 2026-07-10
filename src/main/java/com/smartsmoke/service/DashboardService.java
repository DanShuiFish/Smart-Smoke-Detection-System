package com.smartsmoke.service;

import com.smartsmoke.entity.*;

import java.util.List;
import java.util.Set;

public interface DashboardService {

    /** 全量统计（管理员/消防员） */
    DashboardStatsVO getStats();

    /** 按设备过滤统计（居民只看到绑定设备） */
    DashboardStatsVO getStats(Set<Long> deviceIds);

    RealtimeVO getRealtime(int count);

    /** 按设备过滤实时数据 */
    RealtimeVO getRealtime(int count, Set<Long> deviceIds);

    List<AlarmTrendVO> getAlarmTrend(int period);

    List<DeviceLocationStatsVO> getDeviceStats();
}
