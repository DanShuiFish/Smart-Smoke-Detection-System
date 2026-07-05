package com.smartsmoke.entity;

import lombok.Data;

@Data
public class LoginVO {
    private String token;
    private SysUser user;
}
