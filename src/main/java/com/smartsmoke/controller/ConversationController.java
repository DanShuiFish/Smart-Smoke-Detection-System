package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.ConversationLog;
import com.smartsmoke.mapper.ConversationLogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/conversations")
@RequiredArgsConstructor
public class ConversationController {
    private final ConversationLogMapper conversationLogMapper;

    // 14.1 发起对话（提问）
    @PostMapping
    public Result<ConversationLog> sendMessage(@RequestBody ConversationLog msg) {
        if (msg.getSessionId() == null) msg.setSessionId(UUID.randomUUID().toString().substring(0, 8));
        msg.setUserId(StpUtil.getLoginIdAsLong());
        msg.setCreateTime(LocalDateTime.now());
        msg.setAnswer("收到您的问题：" + msg.getQuestion() + "\n（AI功能待接入MaxKB后启用）");
        conversationLogMapper.insert(msg);
        return Result.success(msg);
    }

    // 14.2 获取对话历史（分页 + 多条件过滤）
    @GetMapping
    public Result<PageResult<ConversationLog>> list(
            @RequestParam(required = false) String sessionId,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) Long alarmId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        LambdaQueryWrapper<ConversationLog> qw = new LambdaQueryWrapper<>();
        // 默认只查当前用户的对话
        if (userId != null) {
            qw.eq(ConversationLog::getUserId, userId);
        } else {
            qw.eq(ConversationLog::getUserId, StpUtil.getLoginIdAsLong());
        }
        if (sessionId != null) qw.eq(ConversationLog::getSessionId, sessionId);
        if (alarmId != null) qw.eq(ConversationLog::getAlarmId, alarmId);
        qw.orderByDesc(ConversationLog::getCreateTime);
        return Result.success(PageResult.of(conversationLogMapper.selectPage(new Page<>(page, pageSize), qw)));
    }

    // 14.3 评价回答
    @PutMapping("/{id}/rate")
    public Result<Void> rate(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        ConversationLog log = conversationLogMapper.selectById(id);
        if (log == null) return Result.error(400, "对话记录不存在");
        Object rating = body.get("userRating");
        if (rating == null) return Result.error(400, "评分不能为空");
        int r = rating instanceof Integer ? (Integer) rating : Integer.parseInt(rating.toString());
        if (r < 1 || r > 5) return Result.error(400, "评分需在 1~5 之间");
        log.setUserRating(r);
        conversationLogMapper.updateById(log);
        return Result.success();
    }
}
