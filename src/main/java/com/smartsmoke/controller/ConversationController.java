package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.ConversationLog;
import com.smartsmoke.mapper.ConversationLogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/conversations")
@RequiredArgsConstructor
public class ConversationController {
    private final ConversationLogMapper conversationLogMapper;

    @PostMapping
    public Result<ConversationLog> sendMessage(@RequestBody ConversationLog msg) {
        if (msg.getSessionId() == null) msg.setSessionId(UUID.randomUUID().toString().substring(0, 8));
        msg.setUserId(StpUtil.getLoginIdAsLong());
        msg.setCreateTime(LocalDateTime.now());
        msg.setAnswer("收到您的问题：" + msg.getQuestion() + "\n（AI功能待接入MaxKB后启用）");
        conversationLogMapper.insert(msg);
        return Result.success(msg);
    }

    @GetMapping
    public Result<List<ConversationLog>> list(@RequestParam(required = false) String sessionId) {
        LambdaQueryWrapper<ConversationLog> qw = new LambdaQueryWrapper<>();
        qw.eq(ConversationLog::getUserId, StpUtil.getLoginIdAsLong());
        if (sessionId != null) qw.eq(ConversationLog::getSessionId, sessionId);
        qw.orderByDesc(ConversationLog::getCreateTime);
        return Result.success(conversationLogMapper.selectList(qw));
    }
}
