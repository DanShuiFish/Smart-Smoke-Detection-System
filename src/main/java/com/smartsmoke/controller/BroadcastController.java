package com.smartsmoke.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.BroadcastRecord;
import com.smartsmoke.mapper.BroadcastRecordMapper;
import com.smartsmoke.service.BroadcastService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/broadcasts")
@RequiredArgsConstructor
public class BroadcastController {

    private final BroadcastRecordMapper broadcastRecordMapper;
    private final BroadcastService broadcastService;

    @PostMapping
    public Result<BroadcastRecord> create(@RequestBody Map<String, Object> body) {
        try {
            Long alarmId = body.get("alarmId") != null ? Long.valueOf(body.get("alarmId").toString()) : null;
            Long deviceId = body.get("deviceId") != null ? Long.valueOf(body.get("deviceId").toString()) : null;
            Long triggerUserId = body.get("triggerUserId") != null ? Long.valueOf(body.get("triggerUserId").toString()) : null;

            BroadcastRecord record = broadcastService.createManualBroadcast(
                    alarmId,
                    deviceId,
                    stringValue(body.get("broadcastArea")),
                    stringValue(body.get("broadcastContent")),
                    stringValueOrDefault(body.get("broadcastType"), "EMERGENCY"),
                    stringValueOrDefault(body.get("triggerMode"), "MANUAL"),
                    triggerUserId
            );
            return Result.success(record);
        } catch (IllegalArgumentException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @GetMapping
    public Result<PageResult<BroadcastRecord>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) Long alarmId,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type) {
        LambdaQueryWrapper<BroadcastRecord> qw = new LambdaQueryWrapper<>();
        if (alarmId != null) qw.eq(BroadcastRecord::getAlarmId, alarmId);
        if (deviceId != null) qw.eq(BroadcastRecord::getDeviceId, deviceId);
        if (status != null) qw.eq(BroadcastRecord::getSendStatus, status);
        if (type != null) qw.eq(BroadcastRecord::getBroadcastType, type);
        qw.orderByDesc(BroadcastRecord::getCreateTime);
        Page<BroadcastRecord> result = broadcastRecordMapper.selectPage(new Page<>(page, pageSize), qw);
        return Result.success(PageResult.of(result));
    }

    @GetMapping("/{id}")
    public Result<BroadcastRecord> getById(@PathVariable Long id) {
        BroadcastRecord record = broadcastRecordMapper.selectById(id);
        if (record == null) {
            return Result.error(404, "广播记录不存在");
        }
        return Result.success(record);
    }

    private String stringValue(Object value) {
        return value == null ? null : value.toString();
    }

    private String stringValueOrDefault(Object value, String defaultValue) {
        return value == null || value.toString().isBlank() ? defaultValue : value.toString();
    }
}