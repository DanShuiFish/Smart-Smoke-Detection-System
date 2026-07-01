package com.smartsmoke.controller;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.service.SensorDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.List;
@RestController
@RequestMapping("/api/data")
@RequiredArgsConstructor
public class DataController {
    private final SensorDataService sensorDataService;
    @GetMapping("/latest/{deviceId}")
    public Result<SensorData> latest(@PathVariable Long deviceId) {
        LambdaQueryWrapper<SensorData> qw = new LambdaQueryWrapper<>();
        qw.eq(SensorData::getDeviceId, deviceId).orderByDesc(SensorData::getCollectTime).last("LIMIT 1");
        return Result.success(sensorDataService.getOne(qw));
    }
    @GetMapping("/history/{deviceId}")
    public Result<List<SensorData>> history(@PathVariable Long deviceId,
            @RequestParam LocalDateTime start, @RequestParam LocalDateTime end) {
        LambdaQueryWrapper<SensorData> qw = new LambdaQueryWrapper<>();
        qw.eq(SensorData::getDeviceId, deviceId).between(SensorData::getCollectTime, start, end).orderByAsc(SensorData::getCollectTime);
        return Result.success(sensorDataService.list(qw));
    }
}