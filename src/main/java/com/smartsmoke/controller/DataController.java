package com.smartsmoke.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.service.SensorDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@RestController
@RequestMapping("/api/v1/data")
@RequiredArgsConstructor
public class DataController {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private final SensorDataService sensorDataService;

    @GetMapping("/latest/{deviceId}")
    public Result<SensorData> latest(@PathVariable Long deviceId) {
        LambdaQueryWrapper<SensorData> qw = new LambdaQueryWrapper<>();
        qw.eq(SensorData::getDeviceId, deviceId)
                .orderByDesc(SensorData::getCollectTime)
                .last("LIMIT 1");
        return Result.success(sensorDataService.getOne(qw));
    }

    @GetMapping("/history/{deviceId}")
    public Result<PageResult<SensorData>> history(
            @PathVariable Long deviceId,
            @RequestParam String start,
            @RequestParam String end,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "500") int pageSize,
            @RequestParam(required = false) String interval) {
        LocalDateTime startTime = LocalDateTime.parse(start, FMT);
        LocalDateTime endTime = LocalDateTime.parse(end, FMT);
        if (pageSize > 2000) pageSize = 2000;
        return Result.success(sensorDataService.getHistory(
                deviceId, startTime, endTime, page, pageSize, interval));
    }
}