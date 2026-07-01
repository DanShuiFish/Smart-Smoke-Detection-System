package com.smartsmoke.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("conversation_log")
public class ConversationLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long alarmId;
    private String sessionId;
    private String question;
    private String answer;
    private String sourceType;
    private String knowledgeRefs;
    private Integer aiProcessingMs;
    private Integer userRating;
    @TableLogic
    private Integer isDeleted;
    private LocalDateTime createTime;
}
