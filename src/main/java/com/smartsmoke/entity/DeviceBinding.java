package com.smartsmoke.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("device_binding")
public class DeviceBinding {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long deviceId;
    private Long userId;
    private String bindType;
    private LocalDateTime bindTime;
    private LocalDateTime unbindTime;
    private String status;
    private String remark;
    @TableLogic
    private Integer isDeleted;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}
