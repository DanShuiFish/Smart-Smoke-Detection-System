package com.smartsmoke.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.DateTimeConst;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.OperationLog;
import com.smartsmoke.mapper.OperationLogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

/**
 * 13. 操作审计日志 — 分页查询（多条件过滤）
 */
@RestController
@RequestMapping("/api/v1/operation-logs")
@RequiredArgsConstructor
public class OperationLogController {

    private final OperationLogMapper operationLogMapper;

    @GetMapping
    public Result<PageResult<OperationLog>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String target,
            @RequestParam(required = false) String start,
            @RequestParam(required = false) String end) {
        LambdaQueryWrapper<OperationLog> qw = new LambdaQueryWrapper<>();
        if (userId != null) qw.eq(OperationLog::getUserId, userId);
        if (type != null && !type.isEmpty()) qw.eq(OperationLog::getOperationType, type);
        if (target != null && !target.isEmpty()) qw.like(OperationLog::getOperationTarget, target);
        if (start != null) qw.ge(OperationLog::getCreateTime, LocalDateTime.parse(start, DateTimeConst.FMT));
        if (end != null) qw.le(OperationLog::getCreateTime, LocalDateTime.parse(end, DateTimeConst.FMT));
        qw.orderByDesc(OperationLog::getCreateTime);
        return Result.success(PageResult.of(operationLogMapper.selectPage(new Page<>(page, pageSize), qw)));
    }
}
