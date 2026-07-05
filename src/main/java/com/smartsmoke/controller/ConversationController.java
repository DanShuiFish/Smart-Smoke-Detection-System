package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.dto.ConversationReq;
import com.smartsmoke.dto.ConversationVO;
import com.smartsmoke.entity.ConversationLog;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.mapper.UserMapper;
import com.smartsmoke.service.ConversationLogService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 智能问答 Controller — BE3
 * 对接 MaxKB 知识库问答，提供对话发起、历史查询、评价功能。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/conversations")
public class ConversationController {

    private final ConversationLogService conversationLogService;
    private final UserMapper userMapper;

    public ConversationController(ConversationLogService conversationLogService, UserMapper userMapper) {
        this.conversationLogService = conversationLogService;
        this.userMapper = userMapper;
    }

    /**
     * 发起对话（提问）
     * POST /api/v1/conversations
     */
    @PostMapping
    public Result<ConversationVO> sendMessage(@Valid @RequestBody ConversationReq req) {
        long userId = StpUtil.getLoginIdAsLong();
        log.info("用户 {} 发起对话: sessionId={}, alarmId={}, questionLen={}",
                userId, req.getSessionId(), req.getAlarmId(), req.getQuestion().length());

        ConversationVO vo = conversationLogService.ask(req, userId);
        return Result.success(vo);
    }

    /**
     * 获取对话历史（分页 + 数据隔离）
     * GET /api/v1/conversations?sessionId=&userId=&alarmId=&page=1&pageSize=20
     *
     * 数据隔离规则：普通居民(role=RESIDENT)强制只能查看自己的对话；
     * 管理员/消防员可查看全部或按 userId 自由过滤。
     */
    @GetMapping
    public Result<PageResult<ConversationLog>> list(
            @RequestParam(required = false) String sessionId,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) Long alarmId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {

        long currentUserId = StpUtil.getLoginIdAsLong();

        // 数据隔离：查询用户角色，普通居民强制只能看自己的对话
        SysUser currentUser = userMapper.selectById(currentUserId);
        if (currentUser != null && "RESIDENT".equals(currentUser.getRole())) {
            userId = currentUserId;
        }

        // 限制最大每页条数
        if (pageSize > 100) {
            pageSize = 100;
        }

        IPage<ConversationLog> result = conversationLogService.listHistory(sessionId, userId, alarmId, page, pageSize);
        return Result.success(PageResult.of(result));
    }

    /**
     * 评价回答
     * PUT /api/v1/conversations/{id}/rate
     */
    @PutMapping("/{id}/rate")
    public Result<Void> rate(@PathVariable Long id, @RequestBody Map<String, Integer> body) {
        long userId = StpUtil.getLoginIdAsLong();
        Integer rating = body.get("userRating");
        if (rating == null) {
            return Result.error(400, "userRating 不能为空");
        }

        conversationLogService.rate(id, rating, userId);
        return Result.success();
    }
}
