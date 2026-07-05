package com.smartsmoke.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("sys_user")
public class SysUser {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String username;
    @JsonIgnore
    private String password;
    private String realName;
    private String phone;
    private String email;
    private String avatar;
    private String role;
    private String status;
    private String userExt;
    private String lastLoginIp;
    private LocalDateTime lastLoginTime;
    private Integer loginCount;
    @JsonIgnore
    @TableLogic
    private Integer isDeleted;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}
