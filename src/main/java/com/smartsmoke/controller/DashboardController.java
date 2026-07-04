package com.smartsmoke.controller;

import com.smartsmoke.common.Result;
import com.smartsmoke.entity.*;
import com.smartsmoke.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/stats")
    public Result<DashboardStatsVO> stats() {
        return Result.success(dashboardService.getStats());
    }

    @GetMapping("/realtime")
    public Result<RealtimeVO> realtime(@RequestParam(defaultValue = "10") int count) {
        return Result.success(dashboardService.getRealtime(count));
    }

    @GetMapping("/alarm-stats")
    public Result<List<AlarmTrendVO>> alarmTrend(@RequestParam(defaultValue = "7") int period) {
        return Result.success(dashboardService.getAlarmTrend(period));
    }

    @GetMapping("/device-stats")
    public Result<List<DeviceLocationStatsVO>> deviceStats() {
        return Result.success(dashboardService.getDeviceStats());
    }
}
