package com.smartsmoke.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.BroadcastRecord;
import com.smartsmoke.mapper.BroadcastRecordMapper;
import com.smartsmoke.service.BroadcastService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
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
    public Result<List<BroadcastRecord>> list() {
        List<BroadcastRecord> records = broadcastRecordMapper.selectList(new LambdaQueryWrapper<BroadcastRecord>()
                .orderByDesc(BroadcastRecord::getCreateTime));
        return Result.success(records);
    }

    private String stringValue(Object value) {
        return value == null ? null : value.toString();
    }

    private String stringValueOrDefault(Object value, String defaultValue) {
        return value == null || value.toString().isBlank() ? defaultValue : value.toString();
    }
}
