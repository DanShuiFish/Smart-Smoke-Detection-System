package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import cn.hutool.crypto.digest.BCrypt;
import com.smartsmoke.common.Result;
import com.smartsmoke.dto.LoginRequest;
import com.smartsmoke.dto.RegisterRequest;
import com.smartsmoke.entity.LoginVO;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserService userService;

    // 4.1 登录
    @PostMapping("/login")
    public Result<LoginVO> login(@RequestBody LoginRequest req) {
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

        // 更新登录信息
        user.setLoginCount(user.getLoginCount() == null ? 1 : user.getLoginCount() + 1);
        user.setLastLoginTime(LocalDateTime.now());
        userService.updateById(user);

        LoginVO vo = new LoginVO();
        vo.setToken(StpUtil.getTokenValue());
        vo.setUser(user);
        return Result.success(vo);
    }

    // 注册（非 api.md 标准接口，保留供模拟期使用）
    @PostMapping("/register")
    public Result<LoginVO> register(@RequestBody RegisterRequest req) {
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
        user.setLoginCount(1);
        user.setLastLoginTime(LocalDateTime.now());
        userService.save(user);

        StpUtil.login(user.getId());

        LoginVO vo = new LoginVO();
        vo.setToken(StpUtil.getTokenValue());
        vo.setUser(user);
        return Result.success(vo);
    }

    // 4.2 登出
    @PostMapping("/logout")
    public Result<Void> logout() {
        StpUtil.logout();
        return Result.success();
    }

    // 4.3 获取当前用户信息
    @GetMapping("/me")
    public Result<SysUser> me() {
        if (!StpUtil.isLogin()) {
            return Result.error(401, "未登录");
        }
        SysUser user = userService.getById(StpUtil.getLoginIdAsLong());
        if (user == null) return Result.error(400, "用户不存在");
        return Result.success(user);
    }
}