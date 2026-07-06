package com.smartsmoke.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.smartsmoke.entity.ConversationLog;

public interface ConversationLogService extends IService<ConversationLog> {

    /**
     * 保存对话记录
     * @param userId     提问用户 ID
     * @param alarmId    关联告警 ID（可为 null）
     * @param sessionId  会话 ID
     * @param question   用户提问
     * @param answer     AI 回答
     * @param sourceType 来源类型（RAG / LLM / HYBRID）
     * @param knowledgeRefs 引用知识片段 JSON
     * @param aiProcessingMs AI 处理耗时
     * @return 保存后的记录
     */
    ConversationLog saveConversation(Long userId, Long alarmId, String sessionId,
                                     String question, String answer,
                                     String sourceType, String knowledgeRefs,
                                     int aiProcessingMs);
}
