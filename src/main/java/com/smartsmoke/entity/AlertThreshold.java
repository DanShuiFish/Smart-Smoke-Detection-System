package com.smartsmoke.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("alert_threshold")
public class AlertThreshold {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long deviceId;
    private String thresholdType;
    private String alarmLevel;
    private java.math.BigDecimal thresholdMin;
    private java.math.BigDecimal thresholdMax;
    private Integer durationSeconds;
    private String effectiveStart;
    private String effectiveEnd;
    private Integer silentPeriod;
    private Integer isDefault;
    private String status;
    private Integer sortOrder;
    private String remark;
    @JsonIgnore
    @TableLogic
    private Integer isDeleted;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}
