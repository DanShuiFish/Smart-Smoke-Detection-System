package com.smartsmoke.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("alarm_record")
public class AlarmRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long deviceId;
    private Long sensorDataId;
    private String alarmCode;
    private String alarmType;
    private String alarmLevel;
    private String alarmStatus;
    private java.math.BigDecimal smokeConcentration;
    private java.math.BigDecimal thresholdValue;
    private LocalDateTime alarmTime;
    private LocalDateTime confirmTime;
    private Long confirmUserId;
    private String confirmMethod;
    private LocalDateTime resolveTime;
    private Long resolveUserId;
    private String resolveMethod;
    private String resolveDetail;
    private Integer isVisionReviewed;
    private Integer isBroadcastSent;
    private String alarmExt;
    private String remark;
    @JsonIgnore
    @TableLogic
    private Integer isDeleted;
    @TableField(exist = false)
    private AiReviewRecord aiReview;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}
