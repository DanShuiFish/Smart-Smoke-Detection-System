package com.smartsmoke.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("ai_review_record")
public class
AiReviewRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long alarmId;
    private Long deviceId;
    private String imageUrl;
    private String cameraId;
    private String reviewType;
    private String reviewResult;
    private java.math.BigDecimal confidence;
    private Integer isManualReview;
    private Long manualReviewUserId;
    private String manualReviewResult;
    private String aiRawResponse;
    private Integer processingTimeMs;
    private String remark;
    @TableLogic
    private Integer isDeleted;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}
