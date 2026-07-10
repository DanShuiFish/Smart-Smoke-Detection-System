package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.AiReviewRecord;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.mapper.AiReviewRecordMapper;
import com.smartsmoke.service.AlarmRecordService;
import com.smartsmoke.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/api/v1/ai-reviews")
@RequiredArgsConstructor
public class AiReviewController {

    private final AiReviewRecordMapper aiReviewRecordMapper;
    private final AlarmRecordService alarmRecordService;
    private final PermissionService permissionService;

    // 12.1 AI 复核记录列表（分页 + 多条件筛选）
    @GetMapping
    public Result<PageResult<AiReviewRecord>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) Long alarmId,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) String result) {
        LambdaQueryWrapper<AiReviewRecord> qw = new LambdaQueryWrapper<>();
        // 角色过滤
        Set<Long> visibleIds = permissionService.getVisibleDeviceIds();
        if (visibleIds != null) qw.in(AiReviewRecord::getDeviceId, visibleIds);
        if (alarmId != null) qw.eq(AiReviewRecord::getAlarmId, alarmId);
        if (deviceId != null) qw.eq(AiReviewRecord::getDeviceId, deviceId);
        if (result != null && !result.isEmpty())
            qw.eq(AiReviewRecord::getReviewResult, result);
        qw.orderByDesc(AiReviewRecord::getCreateTime);
        return Result.success(PageResult.of(aiReviewRecordMapper.selectPage(new Page<>(page, pageSize), qw)));
    }

    // 12.2 AI 复核详情（包含 aiRawResponse）
    @GetMapping("/{id}")
    public Result<AiReviewRecord> getById(@PathVariable Long id) {
        AiReviewRecord record = aiReviewRecordMapper.selectById(id);
        if (record == null) return Result.error(400, "AI 复核记录不存在");
        Set<Long> visibleIds = permissionService.getVisibleDeviceIds();
        if (visibleIds != null && !visibleIds.contains(record.getDeviceId())) {
            return Result.error(403, "无权查看该复核记录");
        }
        return Result.success(record);
    }

    // 12.3 人工复核确认
    @PutMapping("/{id}/manual-confirm")
    public Result<Void> manualConfirm(@PathVariable Long id, @RequestBody Map<String, String> body) {
        AiReviewRecord record = aiReviewRecordMapper.selectById(id);
        if (record == null) return Result.error(400, "AI 复核记录不存在");
        Set<Long> visibleIds = permissionService.getVisibleDeviceIds();
        if (visibleIds != null && !visibleIds.contains(record.getDeviceId())) {
            return Result.error(403, "无权操作该复核记录");
        }

        String manualResult = body.get("manualReviewResult");
        if (manualResult == null || manualResult.isEmpty()) {
            return Result.error(400, "manualReviewResult 不能为空，可选值: CONFIRMED / DISMISSED");
        }
        if (!"CONFIRMED".equals(manualResult) && !"DISMISSED".equals(manualResult)) {
            return Result.error(400, "manualReviewResult 取值错误，仅支持 CONFIRMED 或 DISMISSED");
        }

        // 原子条件更新 — 防止 TOCTOU 并发重复确认
        LambdaUpdateWrapper<AiReviewRecord> updateWrapper = new LambdaUpdateWrapper<>();
        updateWrapper.eq(AiReviewRecord::getId, id)
                .and(w -> w.eq(AiReviewRecord::getIsManualReview, 0).or().isNull(AiReviewRecord::getIsManualReview))
                .set(AiReviewRecord::getIsManualReview, 1)
                .set(AiReviewRecord::getManualReviewUserId, StpUtil.getLoginIdAsLong())
                .set(AiReviewRecord::getManualReviewResult, manualResult)
                .set(AiReviewRecord::getRemark, body.get("remark"))
                .set(AiReviewRecord::getUpdateTime, LocalDateTime.now());
        int rows = aiReviewRecordMapper.update(null, updateWrapper);
        if (rows == 0) {
            return Result.error(400, "该记录已完成人工复核或已被其他请求处理");
        }

        log.info("人工复核完成: reviewId={}, userId={}, result={}", id, StpUtil.getLoginIdAsLong(), manualResult);

        // 驳回 AI 判断时联动告警状态：若 AI 之前确认了火情，退回人工确认
        if ("DISMISSED".equals(manualResult) && "FIRE_CONFIRMED".equals(record.getReviewResult())) {
            AlarmRecord alarm = alarmRecordService.getById(record.getAlarmId());
            if (alarm != null) {
                alarm.setAlarmStatus("CONFIRMING");
                alarmRecordService.updateById(alarm);
                log.info("人工驳回 AI 火情确认，告警 {} 退回 CONFIRMING", record.getAlarmId());
            }
        }

        return Result.success();
    }
}
