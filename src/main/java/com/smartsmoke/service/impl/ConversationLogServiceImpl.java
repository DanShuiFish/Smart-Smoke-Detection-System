package com.smartsmoke.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.entity.ConversationLog;
import com.smartsmoke.mapper.ConversationLogMapper;
import com.smartsmoke.service.ConversationLogService;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class ConversationLogServiceImpl
        extends ServiceImpl<ConversationLogMapper, ConversationLog>
        implements ConversationLogService {

    @Override
    public ConversationLog saveConversation(Long userId, Long alarmId, String sessionId,
                                            String question, String answer,
                                            String sourceType, String knowledgeRefs,
                                            int aiProcessingMs) {
        ConversationLog log = new ConversationLog();
        log.setUserId(userId);
        log.setAlarmId(alarmId);
        log.setSessionId(sessionId);
        log.setQuestion(question);
        log.setAnswer(answer);
        log.setSourceType(sourceType);
        log.setKnowledgeRefs(knowledgeRefs);
        log.setAiProcessingMs(aiProcessingMs);
        log.setCreateTime(LocalDateTime.now());

        save(log);
        return log;
    }
}
