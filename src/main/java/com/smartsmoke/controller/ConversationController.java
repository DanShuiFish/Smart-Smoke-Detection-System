package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.ConversationLog;
import com.smartsmoke.service.AiService;
import com.smartsmoke.service.ConversationLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final AiService aiService;
    private final ConversationLogService conversationLogService;

    /**
     * 发起对话（提问）
     */
    @PostMapping
    public Result<ConversationLog> sendMessage(@RequestBody Map<String, Object> body) {
        String question = (String) body.get("question");
        String sessionId = (String) body.get("sessionId");
        Long alarmId = body.get("alarmId") != null
                ? Long.valueOf(body.get("alarmId").toString())
                : null;

        // 参数校验
        if (question == null || question.trim().isEmpty()) {
            return Result.error(400, "提问内容不能为空");
        }
        if (sessionId == null || sessionId.trim().isEmpty()) {
            sessionId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        }

        Long userId = StpUtil.getLoginIdAsLong();
        log.info("智能问答请求: userId={}, sessionId={}, question={}", userId, sessionId, question);

        // 调用 AI 智能体
        long start = System.currentTimeMillis();
        String answer;
        try {
            answer = aiService.chat(question, sessionId);
        } catch (Exception e) {
            log.error("AI 问答异常: {}", e.getMessage(), e);
            return Result.error(e.getMessage());
        }
        int processingMs = (int) (System.currentTimeMillis() - start);

        // 持久化对话记录
        ConversationLog logEntry = conversationLogService.saveConversation(
                userId, alarmId, sessionId, question.trim(), answer,
                "RAG", null, processingMs);

        return Result.success(logEntry);
    }

    /**
     * 获取对话历史（分页）
     */
    @GetMapping
    public Result<PageResult<ConversationLog>> list(
            @RequestParam(required = false) String sessionId,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) Long alarmId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {

        LambdaQueryWrapper<ConversationLog> qw = new LambdaQueryWrapper<>();

        // 权限控制：非管理员只看自己的对话
        Long currentUserId = StpUtil.getLoginIdAsLong();
        if (userId != null) {
            qw.eq(ConversationLog::getUserId, userId);
        } else {
            qw.eq(ConversationLog::getUserId, currentUserId);
        }

        if (sessionId != null && !sessionId.trim().isEmpty()) {
            qw.eq(ConversationLog::getSessionId, sessionId);
        }
        if (alarmId != null) {
            qw.eq(ConversationLog::getAlarmId, alarmId);
        }

        qw.orderByDesc(ConversationLog::getCreateTime);

        Page<ConversationLog> mpPage = new Page<>(page, pageSize);
        conversationLogService.page(mpPage, qw);

        return Result.success(PageResult.of(mpPage));
    }

    /**
     * 评价回答
     */
    @PutMapping("/{id}/rate")
    public Result<Void> rate(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        int rating = body.get("userRating") != null
                ? Integer.parseInt(body.get("userRating").toString())
                : 0;

        if (rating < 1 || rating > 5) {
            return Result.error(400, "评分必须在 1~5 之间");
        }

        ConversationLog log = conversationLogService.getById(id);
        if (log == null) {
            return Result.error(404, "对话记录不存在");
        }

        log.setUserRating(rating);
        conversationLogService.updateById(log);

        return Result.success();
    }
}
