package com.smartsmoke.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.smartsmoke.dto.ConversationReq;
import com.smartsmoke.dto.ConversationVO;
import com.smartsmoke.entity.ConversationLog;

/**
 * 智能问答服务接口 — BE3
 */
public interface ConversationLogService extends IService<ConversationLog> {

    /**
     * 发起对话（提问），调用 MaxKB 获取 AI 回答
     * @param req  请求参数（sessionId, alarmId, question）
     * @param userId 当前登录用户 ID
     * @return 对话响应 VO
     */
    ConversationVO ask(ConversationReq req, Long userId);

    /**
     * 获取对话历史（分页 + 数据隔离）
     * @param sessionId 会话 ID（可选）
     * @param userId    用户 ID（可选，管理员可查他人）
     * @param alarmId   告警 ID（可选）
     * @param page      页码
     * @param pageSize  每页条数
     * @return 分页结果
     */
    IPage<ConversationLog> listHistory(String sessionId, Long userId, Long alarmId, int page, int pageSize);

    /**
     * 评价回答
     * @param id     对话记录 ID
     * @param rating 评分 1~5
     * @param userId 当前登录用户 ID（用于验证所有权）
     */
    void rate(Long id, int rating, Long userId);
}
