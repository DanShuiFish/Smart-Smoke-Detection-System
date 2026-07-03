package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import cn.hutool.http.HttpUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.ConversationLog;
import com.smartsmoke.service.ConversationLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final ConversationLogService conversationLogService;

    @Value("${maxkb.api-url:http://localhost:8081/api/v1/chat}")
    private String maxkbApiUrl;

    @Value("${maxkb.api-key:}")
    private String maxkbApiKey;

    @PostMapping
    public Result<ConversationLog> chat(@RequestBody Map<String, Object> params) {
        String question = (String) params.get("question");
        String sessionId = (String) params.get("sessionId");
        if (question == null || question.isEmpty()) {
            return Result.error(400, "问题不能为空");
        }
        if (sessionId == null || sessionId.isEmpty()) {
            sessionId = "sess-" + UUID.randomUUID().toString();
        }
        Long alarmId = params.get("alarmId") != null
                ? ((Number) params.get("alarmId")).longValue()
                : null;
        long userId = StpUtil.getLoginIdAsLong();
        long startMs = System.currentTimeMillis();

        String answer;
        try {
            Map<String, Object> reqBody = new HashMap<>();
            reqBody.put("question", question);
            reqBody.put("session_id", sessionId);
            String resp = HttpUtil.createPost(maxkbApiUrl)
                    .header("Authorization", "Bearer " + maxkbApiKey)
                    .body(JSONUtil.toJsonStr(reqBody))
                    .timeout(30000).execute().body();
            JSONObject json = JSONUtil.parseObj(resp);
            answer = json.getStr("answer", "抱歉，我无法回答这个问题。");
        } catch (Exception e) {
            log.warn("MaxKB 调用失败: {}", e.getMessage());
            answer = "您好，我是智慧烟感智能助手。\n\n"
                    + "当前 AI 服务暂不可用，请稍后再试或联系管理员。\n\n"
                    + "紧急情况请立即拨打 119 火警电话。";
        }

        ConversationLog logEntry = new ConversationLog();
        logEntry.setUserId(userId);
        logEntry.setAlarmId(alarmId);
        logEntry.setSessionId(sessionId);
        logEntry.setQuestion(question);
        logEntry.setAnswer(answer);
        logEntry.setSourceType("RAG");
        logEntry.setAiProcessingMs((int) (System.currentTimeMillis() - startMs));
        conversationLogService.save(logEntry);

        return Result.success(logEntry);
    }

    @GetMapping
    public Result<PageResult<ConversationLog>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String sessionId,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) Long alarmId) {
        LambdaQueryWrapper<ConversationLog> qw = new LambdaQueryWrapper<>();
        if (sessionId != null) qw.eq(ConversationLog::getSessionId, sessionId);
        if (userId != null) qw.eq(ConversationLog::getUserId, userId);
        if (alarmId != null) qw.eq(ConversationLog::getAlarmId, alarmId);
        if (sessionId == null && userId == null && alarmId == null) {
            long uid = StpUtil.getLoginIdAsLong();
            qw.eq(ConversationLog::getUserId, uid);
        }
        qw.orderByDesc(ConversationLog::getCreateTime);
        return Result.success(PageResult.of(conversationLogService.page(new Page<>(page, pageSize), qw)));
    }

    @PutMapping("/{id}/rate")
    public Result<Void> rate(@PathVariable Long id, @RequestBody Map<String, Integer> body) {
        Integer rating = body.get("userRating");
        if (rating == null || rating < 1 || rating > 5) {
            return Result.error(400, "评分必须为 1~5");
        }
        ConversationLog log = conversationLogService.getById(id);
        if (log == null) return Result.error(404, "对话记录不存在");
        log.setUserRating(rating);
        conversationLogService.updateById(log);
        return Result.success();
    }
}