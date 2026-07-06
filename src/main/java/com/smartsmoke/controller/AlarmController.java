package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.DateTimeConst;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.AiReviewRecord;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.mapper.AiReviewRecordMapper;
import com.smartsmoke.mapper.UserMapper;
import com.smartsmoke.service.AlarmRecordService;
import com.smartsmoke.service.DeviceBindingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/alarms")
@RequiredArgsConstructor
public class AlarmController {

    private final AlarmRecordService alarmRecordService;
    private final AiReviewRecordMapper aiReviewRecordMapper;
    private final DeviceBindingService deviceBindingService;
    private final UserMapper userMapper;

    /**
     * ADMIN → null（看全部）；RESIDENT → 已绑定的设备 ID 集合
     */
    private Set<Long> getVisibleDeviceIds() {
        long userId = StpUtil.getLoginIdAsLong();
        SysUser user = userMapper.selectById(userId);
        String role = user != null ? user.getRole() : "RESIDENT";
        if (role == null) return null;
        String upper = role.toUpperCase();
        // 管理员角色看全部
        if (upper.equals("ADMIN") || upper.equals("SYSTEM_ADMIN") || upper.equals("COMMUNITY_ADMIN")) return null;
        List<Long> boundIds = deviceBindingService.getMyDeviceIds(userId);
        return boundIds.isEmpty() ? Set.of(-1L) : Set.copyOf(boundIds);
    }

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
        Set<Long> visibleIds = getVisibleDeviceIds();
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
        return Result.success(PageResult.of(alarmRecordService.page(new Page<>(page, pageSize), qw)));
    }

    // 9.2 告警详情（含 AI 复核记录）
    @GetMapping("/{id}")
    public Result<AlarmRecord> getById(@PathVariable Long id) {
        AlarmRecord alarm = alarmRecordService.getById(id);
        if (alarm == null) return Result.error(400, "告警不存在");
        Set<Long> visibleIds = getVisibleDeviceIds();
        if (visibleIds != null && !visibleIds.contains(alarm.getDeviceId())) {
            return Result.error(403, "无权查看该告警");
        }
        AiReviewRecord review = aiReviewRecordMapper.selectOne(
                new LambdaQueryWrapper<AiReviewRecord>().eq(AiReviewRecord::getAlarmId, id));
        alarm.setAiReview(review);
        return Result.success(alarm);
    }

    // 9.3 确认告警
    @PutMapping("/{id}/confirm")
    public Result<Void> confirm(@PathVariable Long id, @RequestBody Map<String, String> body) {
        AlarmRecord r = alarmRecordService.getById(id);
        if (r == null) return Result.error(400, "告警不存在");
        Set<Long> visibleIds = getVisibleDeviceIds();
        if (visibleIds != null && !visibleIds.contains(r.getDeviceId())) {
            return Result.error(403, "无权操作该告警");
        }
        String cur = r.getAlarmStatus();
        if (!"PENDING".equals(cur) && !"CONFIRMING".equals(cur)) {
            return Result.error(400, "当前状态 " + cur + " 不可确认，仅 PENDING/CONFIRMING 可确认");
        }
        r.setAlarmStatus("CONFIRMED");
        r.setConfirmUserId(StpUtil.getLoginIdAsLong());
        r.setConfirmMethod(body.getOrDefault("confirmMethod", "MANUAL"));
        r.setConfirmTime(LocalDateTime.now());
        alarmRecordService.updateById(r);
        return Result.success();
    }

    // 9.4 处置告警
    @PutMapping("/{id}/resolve")
    public Result<Void> resolve(@PathVariable Long id, @RequestBody Map<String, String> body) {
        AlarmRecord r = alarmRecordService.getById(id);
        if (r == null) return Result.error(400, "告警不存在");
        Set<Long> visibleIds = getVisibleDeviceIds();
        if (visibleIds != null && !visibleIds.contains(r.getDeviceId())) {
            return Result.error(403, "无权操作该告警");
        }
        if (!"CONFIRMED".equals(r.getAlarmStatus())) {
            return Result.error(400, "当前状态 " + r.getAlarmStatus() + " 不可处置，仅 CONFIRMED 可处置");
        }
        r.setAlarmStatus("RESOLVED");
        r.setResolveUserId(StpUtil.getLoginIdAsLong());
        r.setResolveMethod(body.getOrDefault("resolveMethod", "ON_SITE"));
        r.setResolveDetail(body.get("resolveDetail"));
        r.setResolveTime(LocalDateTime.now());
        alarmRecordService.updateById(r);
        return Result.success();
    }

    // 9.5 归档告警
    @PutMapping("/{id}/archive")
    public Result<Void> archive(@PathVariable Long id) {
        AlarmRecord r = alarmRecordService.getById(id);
        if (r == null) return Result.error(400, "告警不存在");
        Set<Long> visibleIds = getVisibleDeviceIds();
        if (visibleIds != null && !visibleIds.contains(r.getDeviceId())) {
            return Result.error(403, "无权操作该告警");
        }
        if (!"RESOLVED".equals(r.getAlarmStatus())) {
            return Result.error(400, "当前状态 " + r.getAlarmStatus() + " 不可归档，仅 RESOLVED 可归档");
        }
        r.setAlarmStatus("ARCHIVED");
        alarmRecordService.updateById(r);
        return Result.success();
    }

    // 9.6 关闭告警（任意非终态 → CLOSED）
    @PutMapping("/{id}/close")
    public Result<Void> close(@PathVariable Long id, @RequestBody Map<String, String> body) {
        AlarmRecord r = alarmRecordService.getById(id);
        if (r == null) return Result.error(400, "告警不存在");
        Set<Long> visibleIds = getVisibleDeviceIds();
        if (visibleIds != null && !visibleIds.contains(r.getDeviceId())) {
            return Result.error(403, "无权操作该告警");
        }
        if ("ARCHIVED".equals(r.getAlarmStatus()) || "CLOSED".equals(r.getAlarmStatus())) {
            return Result.error(400, "当前状态 " + r.getAlarmStatus() + " 已是终态，不可关闭");
        }
        r.setAlarmStatus("CLOSED");
        r.setRemark(body.get("remark"));
        alarmRecordService.updateById(r);
        return Result.success();
    }
}
