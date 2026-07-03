package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import cn.hutool.crypto.digest.BCrypt;
import com.smartsmoke.common.Result;
import com.smartsmoke.dto.LoginRequest;
import com.smartsmoke.dto.RegisterRequest;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserService userService;

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@RequestBody LoginRequest req) {
        SysUser user = userService.lambdaQuery()
                .eq(SysUser::getUsername, req.getUsername())
                .one();
        if (user == null) {
            return Result.error(400, "用户不存在");
        }
        if (!BCrypt.checkpw(req.getPassword(), user.getPassword())) {
            return Result.error(400, "密码错误");
        }
        if (!"ENABLED".equals(user.getStatus())) {
            return Result.error(400, "账号已被禁用");
        }
        StpUtil.login(user.getId());
        String tokenValue = StpUtil.getTokenValue();

        Map<String, Object> data = new HashMap<>();
        data.put("token", tokenValue);
        data.put("userId", user.getId());
        data.put("username", user.getUsername());
        data.put("role", user.getRole());
        data.put("realName", user.getRealName());
        return Result.success(data);
    }

    @PostMapping("/register")
    public Result<Map<String, Object>> register(@RequestBody RegisterRequest req) {
        SysUser exist = userService.lambdaQuery()
                .eq(SysUser::getUsername, req.getUsername())
                .one();
        if (exist != null) {
            return Result.error(400, "用户名已存在");
        }
        SysUser user = new SysUser();
        user.setUsername(req.getUsername());
        user.setPassword(BCrypt.hashpw(req.getPassword()));
        user.setRealName(req.getRealName());
        user.setPhone(req.getPhone());
        user.setRole(req.getRole() != null ? req.getRole() : "RESIDENT");
        user.setStatus("ENABLED");
        userService.save(user);

        StpUtil.login(user.getId());
        String tokenValue = StpUtil.getTokenValue();

        Map<String, Object> data = new HashMap<>();
        data.put("token", tokenValue);
        data.put("userId", user.getId());
        data.put("username", user.getUsername());
        data.put("role", user.getRole());
        data.put("realName", user.getRealName());
        return Result.success(data);
    }

    @PostMapping("/logout")
    public Result<Void> logout() {
        StpUtil.logout();
        return Result.success();
    }
}
