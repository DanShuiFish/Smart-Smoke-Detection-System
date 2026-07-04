package com.smartsmoke.controller;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.service.AlarmRecordService;
import cn.dev33.satoken.stp.StpUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.Map;
@RestController
@RequestMapping("/api/alarms")
@RequiredArgsConstructor
public class AlarmController {
    private final AlarmRecordService alarmRecordService;

    @GetMapping
    public Result<PageResult<AlarmRecord>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) LocalDateTime start,
            @RequestParam(required = false) LocalDateTime end) {
        LambdaQueryWrapper<AlarmRecord> qw = new LambdaQueryWrapper<>();
        if (status != null) qw.eq(AlarmRecord::getAlarmStatus, status);
        if (type != null) qw.eq(AlarmRecord::getAlarmType, type);
        if (start != null) qw.ge(AlarmRecord::getAlarmTime, start);
        if (end != null) qw.le(AlarmRecord::getAlarmTime, end);
        qw.orderByDesc(AlarmRecord::getAlarmTime);
        return Result.success(PageResult.of(alarmRecordService.page(new Page<>(page, size), qw)));
    }

    @GetMapping("/{id}")
    public Result<AlarmRecord> getById(@PathVariable Long id) {
        return Result.success(alarmRecordService.getById(id));
    }

    @PutMapping("/{id}/confirm")
    public Result<Void> confirm(@PathVariable Long id, @RequestBody Map<String, String> body) {
        AlarmRecord r = alarmRecordService.getById(id);
        if (r == null) return Result.error(400, "告警不存在");
        r.setAlarmStatus("CONFIRMED");
        r.setConfirmUserId(StpUtil.getLoginIdAsLong());
        r.setConfirmMethod(body.getOrDefault("confirmMethod", "MANUAL"));
        r.setConfirmTime(LocalDateTime.now());
        alarmRecordService.updateById(r);
        return Result.success();
    }

    @PutMapping("/{id}/resolve")
    public Result<Void> resolve(@PathVariable Long id, @RequestBody AlarmRecord update) {
        AlarmRecord r = alarmRecordService.getById(id);
        if (r == null) return Result.error("Alarm not found");
        r.setAlarmStatus("RESOLVED"); r.setResolveUserId(update.getResolveUserId());
        r.setResolveMethod(update.getResolveMethod()); r.setResolveDetail(update.getResolveDetail());
        r.setResolveTime(LocalDateTime.now());
        alarmRecordService.updateById(r); return Result.success();
    }
}