package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.DateTimeConst;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.AiReviewRecord;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.AiReviewRecordMapper;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.service.AlarmRecordService;
import com.smartsmoke.service.PermissionService;
import com.smartsmoke.websocket.AlarmWebSocket;
import cn.hutool.json.JSONUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/v1/alarms")
@RequiredArgsConstructor
public class AlarmController {

    private final AlarmRecordService alarmRecordService;
    private final AiReviewRecordMapper aiReviewRecordMapper;
    private final PermissionService permissionService;
    private final DeviceMapper deviceMapper;

    // 9.1 告警列表（分页 + 多条件筛选）
    @GetMapping
    public Result<PageResult<AlarmRecord>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) String deviceIds,
            @RequestParam(required = false) String start,
            @RequestParam(required = false) String end) {
        LambdaQueryWrapper<AlarmRecord> qw = new LambdaQueryWrapper<>();
        // 角色过滤
        Set<Long> visibleIds = permissionService.getVisibleDeviceIds();
        if (visibleIds != null) qw.in(AlarmRecord::getDeviceId, visibleIds);
        if (status != null) qw.eq(AlarmRecord::getAlarmStatus, status);
        if (type != null) qw.eq(AlarmRecord::getAlarmType, type);
        if (level != null) qw.eq(AlarmRecord::getAlarmLevel, level);
        if (deviceId != null) qw.eq(AlarmRecord::getDeviceId, deviceId);
        if (deviceIds != null && !deviceIds.isEmpty()) {
            List<Long> ids = Arrays.stream(deviceIds.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(Long::valueOf)
                    .collect(Collectors.toList());
            if (!ids.isEmpty()) qw.in(AlarmRecord::getDeviceId, ids);
        }
        if (start != null) qw.ge(AlarmRecord::getAlarmTime, LocalDateTime.parse(start, DateTimeConst.FMT));
        if (end != null) qw.le(AlarmRecord::getAlarmTime, LocalDateTime.parse(end, DateTimeConst.FMT));
        qw.orderByDesc(AlarmRecord::getAlarmTime);
        PageResult<AlarmRecord> result = PageResult.of(alarmRecordService.page(new Page<>(page, pageSize), qw));
        enrichDeviceInfo(result.getRecords());
        return Result.success(result);
    }

    // 9.2 告警详情（含 AI 复核记录）
    @GetMapping("/{id}")
    public Result<AlarmRecord> getById(@PathVariable Long id) {
        AlarmRecord alarm = alarmRecordService.getById(id);
        if (alarm == null) return Result.error(400, "告警不存在");
        Set<Long> visibleIds = permissionService.getVisibleDeviceIds();
        if (visibleIds != null && !visibleIds.contains(alarm.getDeviceId())) {
            return Result.error(403, "无权查看该告警");
        }
        AiReviewRecord review = aiReviewRecordMapper.selectOne(
                new LambdaQueryWrapper<AiReviewRecord>().eq(AiReviewRecord::getAlarmId, id));
        alarm.setAiReview(review);
        enrichDeviceInfo(List.of(alarm));
        return Result.success(alarm);
    }

    // ===== 告警操作守卫：统一存在+权限+状态检查 =====
    // 返回 Result.success(record) 表示通过，Result.error(...) 表示拒绝
    private Result<AlarmRecord> requireAlarmForUpdate(Long id, String... allowedStatuses) {
        AlarmRecord r = alarmRecordService.getById(id);
        if (r == null) return Result.error(400, "告警不存在");
        Set<Long> visibleIds = permissionService.getVisibleDeviceIds();
        if (visibleIds != null && !visibleIds.contains(r.getDeviceId()))
            return Result.error(403, "无权操作该告警");
        for (String s : allowedStatuses)
            if (s.equals(r.getAlarmStatus())) return Result.success(r);
        return Result.error(400, "当前状态 " + r.getAlarmStatus() + " 不可执行此操作");
    }

    // ===== WebSocket 状态变更推送 =====
    private void pushAlarmUpdate(AlarmRecord r) {
        try {
            var payload = new java.util.HashMap<String, Object>();
            payload.put("kind", "alarm_update");
            payload.put("alarmId", r.getId());
            payload.put("deviceId", r.getDeviceId());
            payload.put("alarmStatus", r.getAlarmStatus());
            payload.put("alarmType", r.getAlarmType());
            payload.put("alarmLevel", r.getAlarmLevel());
            AlarmWebSocket.broadcastByDevice(r.getDeviceId(), JSONUtil.toJsonStr(payload));
        } catch (Exception e) {
            log.error("WebSocket 状态推送失败: {}", e.getMessage());
        }
    }

    // 9.3 确认告警 (PENDING/CONFIRMING → CONFIRMED)
    @Transactional(rollbackFor = Exception.class)
    @PutMapping("/{id}/confirm")
    public Result<Void> confirm(@PathVariable Long id, @RequestBody Map<String, String> body) {
        Result<AlarmRecord> guard = requireAlarmForUpdate(id, "PENDING", "CONFIRMING");
        if (guard.getCode() != 200) return Result.error(guard.getCode(), guard.getMsg());
        AlarmRecord r = guard.getData();
        r.setAlarmStatus("CONFIRMED");
        r.setConfirmUserId(StpUtil.getLoginIdAsLong());
        r.setConfirmMethod(body.getOrDefault("confirmMethod", "MANUAL"));
        r.setConfirmTime(LocalDateTime.now());
        alarmRecordService.updateById(r);
        pushAlarmUpdate(r);
        return Result.success();
    }

    // 9.4 处置告警 (CONFIRMED → RESOLVED)
    @Transactional(rollbackFor = Exception.class)
    @PutMapping("/{id}/resolve")
    public Result<Void> resolve(@PathVariable Long id, @RequestBody Map<String, String> body) {
        Result<AlarmRecord> guard = requireAlarmForUpdate(id, "CONFIRMED");
        if (guard.getCode() != 200) return Result.error(guard.getCode(), guard.getMsg());
        AlarmRecord r = guard.getData();
        r.setAlarmStatus("RESOLVED");
        r.setResolveUserId(StpUtil.getLoginIdAsLong());
        r.setResolveMethod(body.getOrDefault("resolveMethod", "ON_SITE"));
        r.setResolveDetail(body.get("resolveDetail"));
        r.setResolveTime(LocalDateTime.now());
        alarmRecordService.updateById(r);
        pushAlarmUpdate(r);
        return Result.success();
    }

    // 9.5 归档告警 (RESOLVED → ARCHIVED)
    @Transactional(rollbackFor = Exception.class)
    @PutMapping("/{id}/archive")
    public Result<Void> archive(@PathVariable Long id) {
        Result<AlarmRecord> guard = requireAlarmForUpdate(id, "RESOLVED");
        if (guard.getCode() != 200) return Result.error(guard.getCode(), guard.getMsg());
        AlarmRecord r = guard.getData();
        r.setAlarmStatus("ARCHIVED");
        alarmRecordService.updateById(r);
        pushAlarmUpdate(r);
        return Result.success();
    }

    // 9.6 关闭告警（任意非终态 → CLOSED）
    @Transactional(rollbackFor = Exception.class)
    @PutMapping("/{id}/close")
    public Result<Void> close(@PathVariable Long id, @RequestBody Map<String, String> body) {
        Result<AlarmRecord> guard = requireAlarmForUpdate(id, "PENDING", "CONFIRMING", "CONFIRMED", "RESOLVED");
        if (guard.getCode() != 200) return Result.error(guard.getCode(), guard.getMsg());
        AlarmRecord r = guard.getData();
        r.setAlarmStatus("CLOSED");
        r.setRemark(body.get("remark"));
        alarmRecordService.updateById(r);
        pushAlarmUpdate(r);
        return Result.success();
    }

    /**
     * 为告警记录填充设备信息（编号、名称、楼栋/楼层/房间），供前端展示。
     */
    private void enrichDeviceInfo(List<AlarmRecord> records) {
        if (records == null || records.isEmpty()) return;
        Set<Long> deviceIds = records.stream()
                .map(AlarmRecord::getDeviceId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        if (deviceIds.isEmpty()) return;

        Map<Long, SmokeDevice> deviceMap = deviceMapper.selectBatchIds(deviceIds)
                .stream()
                .collect(Collectors.toMap(SmokeDevice::getId, Function.identity()));

        for (AlarmRecord r : records) {
            SmokeDevice dev = deviceMap.get(r.getDeviceId());
            if (dev != null) {
                r.setDeviceCode(dev.getDeviceId());       // SMOKE-001
                r.setDeviceName(dev.getDeviceName());
                r.setBuilding(dev.getLocationBuilding());
                r.setFloor(dev.getLocationFloor());
                r.setRoom(dev.getLocationRoom());
            }
        }
    }
}
