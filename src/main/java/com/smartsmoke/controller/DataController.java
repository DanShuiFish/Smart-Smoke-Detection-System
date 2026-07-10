package com.smartsmoke.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.service.SensorDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/v1/data")
@RequiredArgsConstructor
public class DataController {
    private final SensorDataService sensorDataService;

    // 8.1 获取设备最新数据
    @GetMapping("/latest/{deviceId}")
    public Result<SensorData> latest(@PathVariable Long deviceId) {
        LambdaQueryWrapper<SensorData> qw = new LambdaQueryWrapper<>();
        qw.eq(SensorData::getDeviceId, deviceId).orderByDesc(SensorData::getCollectTime).last("LIMIT 1");
        return Result.success(sensorDataService.getOne(qw));
    }

    // 8.2 获取历史数据（分页 + 时间范围 + interval 聚合）
    @GetMapping("/history/{deviceId}")
    public Result<PageResult<SensorData>> history(
            @PathVariable Long deviceId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime end,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "500") int pageSize,
            @RequestParam(required = false) String interval) {
        // 限制最大 pageSize
        if (pageSize > 2000) pageSize = 2000;

        LambdaQueryWrapper<SensorData> qw = new LambdaQueryWrapper<>();
        qw.eq(SensorData::getDeviceId, deviceId)
                .between(SensorData::getCollectTime, start, end)
                .orderByAsc(SensorData::getCollectTime);

        // interval 聚合暂不实现（需要 SQL 时间窗口聚合，复杂度较高）
        // 当前直接返回原始分页数据
        Page<SensorData> pageResult = sensorDataService.page(new Page<>(page, pageSize), qw);
        return Result.success(PageResult.of(pageResult));
    }
}
