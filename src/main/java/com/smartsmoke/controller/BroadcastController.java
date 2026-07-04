package com.smartsmoke.controller;

import com.smartsmoke.common.Result;
import com.smartsmoke.entity.BroadcastRecord;
import com.smartsmoke.mapper.BroadcastRecordMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/broadcasts")
@RequiredArgsConstructor
public class BroadcastController {

    private final BroadcastRecordMapper broadcastRecordMapper;

    @PostMapping
    public Result<BroadcastRecord> create(@RequestBody Map<String, Object> body) {
        BroadcastRecord record = new BroadcastRecord();
        if (body.get("alarmId") != null) record.setAlarmId(Long.valueOf(body.get("alarmId").toString()));
        if (body.get("deviceId") != null) record.setDeviceId(Long.valueOf(body.get("deviceId").toString()));
        record.setBroadcastArea((String) body.getOrDefault("broadcastArea", ""));
        record.setBroadcastContent((String) body.getOrDefault("broadcastContent", ""));
        record.setBroadcastType((String) body.getOrDefault("broadcastType", "EMERGENCY"));
        record.setSendStatus("SENT");
        record.setSendTime(LocalDateTime.now());
        record.setTriggerMode((String) body.getOrDefault("triggerMode", "MANUAL"));
        broadcastRecordMapper.insert(record);
        return Result.success(record);
    }

    @GetMapping
    public Result<java.util.List<BroadcastRecord>> list() {
        return Result.success(broadcastRecordMapper.selectList(null));
    }
}