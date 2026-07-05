package com.smartsmoke.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.AlertThreshold;
import com.smartsmoke.service.AlertThresholdService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/v1/thresholds")
@RequiredArgsConstructor
public class AlertThresholdController {

    private final AlertThresholdService alertThresholdService;

    // 10.1 获取阈值列表
    @GetMapping
    public Result<List<AlertThreshold>> list(
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "ENABLED") String status) {
        LambdaQueryWrapper<AlertThreshold> qw = new LambdaQueryWrapper<>();
        if (deviceId != null) qw.eq(AlertThreshold::getDeviceId, deviceId);
        if (type != null) qw.eq(AlertThreshold::getThresholdType, type);
        qw.eq(AlertThreshold::getStatus, status);
        qw.orderByAsc(AlertThreshold::getSortOrder);
        return Result.success(alertThresholdService.list(qw));
    }

    // 10.2 / 10.3 新增阈值（全局默认 或 设备个性化）
    @PostMapping
    public Result<AlertThreshold> create(@RequestBody AlertThreshold threshold) {
        alertThresholdService.save(threshold);
        return Result.success(threshold);
    }

    // 10.4 更新阈值（仅更新传入的非 null 字段）
    @PutMapping("/{id}")
    public Result<AlertThreshold> update(@PathVariable Long id, @RequestBody AlertThreshold update) {
        LambdaUpdateWrapper<AlertThreshold> uw = new LambdaUpdateWrapper<>();
        uw.eq(AlertThreshold::getId, id);
        if (update.getDeviceId() != null) uw.set(AlertThreshold::getDeviceId, update.getDeviceId());
        if (update.getThresholdType() != null) uw.set(AlertThreshold::getThresholdType, update.getThresholdType());
        if (update.getAlarmLevel() != null) uw.set(AlertThreshold::getAlarmLevel, update.getAlarmLevel());
        if (update.getThresholdMin() != null) uw.set(AlertThreshold::getThresholdMin, update.getThresholdMin());
        if (update.getThresholdMax() != null) uw.set(AlertThreshold::getThresholdMax, update.getThresholdMax());
        if (update.getDurationSeconds() != null) uw.set(AlertThreshold::getDurationSeconds, update.getDurationSeconds());
        if (update.getEffectiveStart() != null) uw.set(AlertThreshold::getEffectiveStart, update.getEffectiveStart());
        if (update.getEffectiveEnd() != null) uw.set(AlertThreshold::getEffectiveEnd, update.getEffectiveEnd());
        if (update.getSilentPeriod() != null) uw.set(AlertThreshold::getSilentPeriod, update.getSilentPeriod());
        if (update.getIsDefault() != null) uw.set(AlertThreshold::getIsDefault, update.getIsDefault());
        if (update.getStatus() != null) uw.set(AlertThreshold::getStatus, update.getStatus());
        if (update.getRemark() != null) uw.set(AlertThreshold::getRemark, update.getRemark());
        if (update.getSortOrder() != null) uw.set(AlertThreshold::getSortOrder, update.getSortOrder());
        alertThresholdService.update(uw);
        return Result.success(alertThresholdService.getById(id));
    }

    // 10.5 删除阈值（逻辑删除）
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        alertThresholdService.removeById(id);
        return Result.success();
    }
}