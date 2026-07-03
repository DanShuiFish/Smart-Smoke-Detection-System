package com.smartsmoke.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("smoke_device")
public class SmokeDevice {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String deviceId;
    private String deviceName;
    private String deviceModel;
    @JsonIgnore
    private String deviceSecret;
    private String firmwareVersion;
    private String status;
    private Integer battery;
    private Integer signalStrength;
    private String locationBuilding;
    private String locationFloor;
    private String locationRoom;
    private java.math.BigDecimal locationLat;
    private java.math.BigDecimal locationLng;
    private String extraAttrs;
    private LocalDateTime installDate;
    private LocalDateTime lastOnlineTime;
    private LocalDateTime lastOfflineTime;
    private LocalDateTime lastHeartbeat;
    private Integer heartbeatTimeout;
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
