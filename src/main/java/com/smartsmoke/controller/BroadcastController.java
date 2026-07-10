package com.smartsmoke.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.BroadcastRecord;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.BroadcastRecordMapper;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.service.BroadcastService;
import com.smartsmoke.websocket.AlarmWebSocket;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/v1/broadcasts")
@RequiredArgsConstructor
public class BroadcastController {

    private final BroadcastRecordMapper broadcastRecordMapper;
    private final BroadcastService broadcastService;
    private final DeviceMapper deviceMapper;

    // 按区域广播：building 必填，floor 可选（不填则广播整栋楼）
    @PostMapping("/area")
    public Result<Map<String, Object>> broadcastArea(@RequestBody Map<String, Object> body) {
        String building = str(body, "building");
        String floor = str(body, "floor");
        String content = str(body, "broadcastContent");
        if (building == null || building.isEmpty()) return Result.error(400, "building 必填");
        if (content == null || content.isEmpty()) return Result.error(400, "broadcastContent 必填");

        LambdaQueryWrapper<SmokeDevice> qw = new LambdaQueryWrapper<SmokeDevice>()
                .eq(SmokeDevice::getLocationBuilding, building);
        if (floor != null && !floor.isEmpty()) qw.eq(SmokeDevice::getLocationFloor, floor);
        List<SmokeDevice> devices = deviceMapper.selectList(qw);

        int count = 0;
        for (SmokeDevice d : devices) {
            try {
                broadcastService.createManualBroadcast(null, d.getId(),
                        (building + (floor != null ? floor : "")),
                        content,
                        body.get("broadcastType") != null ? body.get("broadcastType").toString() : "EMERGENCY",
                        body.get("triggerMode") != null ? body.get("triggerMode").toString() : "MANUAL",
                        null);
                count++;
            } catch (Exception e) { log.warn("广播设备 {} 失败: {}", d.getDeviceId(), e.getMessage()); }
        }
        return Result.success(Map.of("building", building, "floor", floor != null ? floor : "全部",
                "deviceCount", devices.size(), "sentCount", count));
    }

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

    private String str(Map<String, Object> m, String key) { Object v = m.get(key); return v != null ? v.toString() : null; }
    private String stringValue(Object value) {
        return value == null ? null : value.toString();
    }

    private String stringValueOrDefault(Object value, String defaultValue) {
        return value == null || value.toString().isBlank() ? defaultValue : value.toString();
    }
}