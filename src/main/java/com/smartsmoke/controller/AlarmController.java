package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.DateTimeConst;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.AiReviewRecord;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.mapper.AiReviewRecordMapper;
import com.smartsmoke.service.AlarmRecordService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/alarms")
@RequiredArgsConstructor
public class AlarmController {

    private final AlarmRecordService alarmRecordService;
    private final AiReviewRecordMapper aiReviewRecordMapper;

    // 9.1 告警列表（分页 + 多条件筛选）
    @GetMapping
    public Result<PageResult<AlarmRecord>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) String start,
            @RequestParam(required = false) String end) {
        LambdaQueryWrapper<AlarmRecord> qw = new LambdaQueryWrapper<>();
        if (status != null) qw.eq(AlarmRecord::getAlarmStatus, status);
        if (type != null) qw.eq(AlarmRecord::getAlarmType, type);
        if (level != null) qw.eq(AlarmRecord::getAlarmLevel, level);
        if (deviceId != null) qw.eq(AlarmRecord::getDeviceId, deviceId);
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
        if ("ARCHIVED".equals(r.getAlarmStatus()) || "CLOSED".equals(r.getAlarmStatus())) {
            return Result.error(400, "当前状态 " + r.getAlarmStatus() + " 已是终态，不可关闭");
        }
        r.setAlarmStatus("CLOSED");
        r.setRemark(body.get("remark"));
        alarmRecordService.updateById(r);
        return Result.success();
    }
}