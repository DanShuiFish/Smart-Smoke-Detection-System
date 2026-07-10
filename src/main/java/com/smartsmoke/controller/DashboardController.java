package com.smartsmoke.controller;

import com.smartsmoke.common.Result;
import com.smartsmoke.entity.*;
import com.smartsmoke.service.DashboardService;
import com.smartsmoke.service.PermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;
    private final PermissionService permissionService;

    @GetMapping("/stats")
    public Result<DashboardStatsVO> stats() {
        Set<Long> deviceIds = permissionService.getVisibleDeviceIds();
        return Result.success(dashboardService.getStats(deviceIds));
    }

    @GetMapping("/realtime")
    public Result<RealtimeVO> realtime(@RequestParam(defaultValue = "10") int count) {
        Set<Long> deviceIds = permissionService.getVisibleDeviceIds();
        return Result.success(dashboardService.getRealtime(count, deviceIds));
    }

    @GetMapping("/alarm-stats")
    public Result<List<AlarmTrendVO>> alarmTrend(@RequestParam(defaultValue = "7") int period) {
        // RESIDENT 只能看自己绑定设备的趋势；需要 DashboardMapper SQL 支持 deviceIds 过滤
        // 当前作为最小权限控制：RESIDENT 无绑定设备时返回空列表
        Set<Long> deviceIds = permissionService.getVisibleDeviceIds();
        if (deviceIds != null && deviceIds.equals(java.util.Set.of(-1L))) {
            return Result.success(java.util.List.of());
        }
        return Result.success(dashboardService.getAlarmTrend(period));
    }

    @GetMapping("/device-stats")
    public Result<List<DeviceLocationStatsVO>> deviceStats() {
        Set<Long> deviceIds = permissionService.getVisibleDeviceIds();
        if (deviceIds != null && deviceIds.equals(java.util.Set.of(-1L))) {
            return Result.success(java.util.List.of());
        }
        return Result.success(dashboardService.getDeviceStats());
    }
}
