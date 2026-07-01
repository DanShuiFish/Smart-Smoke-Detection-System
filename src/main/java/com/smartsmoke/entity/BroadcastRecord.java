package com.smartsmoke.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("broadcast_record")
public class BroadcastRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long alarmId;
    private Long deviceId;
    private String broadcastArea;
    private String broadcastContent;
    private String broadcastType;
    private String sendStatus;
    private LocalDateTime sendTime;
    private LocalDateTime deliverTime;
    private String failureReason;
    private String mqttTopic;
    private String mqttMessageId;
    private Integer retryCount;
    private String triggerMode;
    private Long triggerUserId;
    private String remark;
    @TableLogic
    private Integer isDeleted;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}
