package com.smartsmoke.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("operation_log")
public class OperationLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String username;
    private String operationType;
    private String operationTarget;
    private String operationDetail;
    private String requestIp;
    private String requestUrl;
    private String requestMethod;
    private String resultCode;
    private String errorMessage;
    private Integer executionTimeMs;
    private String userAgent;
    private LocalDateTime createTime;
}
