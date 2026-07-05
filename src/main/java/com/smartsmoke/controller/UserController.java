package com.smartsmoke.controller;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    // 11.1 用户列表（分页 + 角色/状态筛选 + 关键字搜索）
    @GetMapping
    public Result<PageResult<SysUser>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        LambdaQueryWrapper<SysUser> qw = new LambdaQueryWrapper<>();
        if (role != null) qw.eq(SysUser::getRole, role);
        if (status != null) qw.eq(SysUser::getStatus, status);
        if (StringUtils.hasText(keyword)) {
            qw.and(w -> w.like(SysUser::getUsername, keyword)
                    .or().like(SysUser::getRealName, keyword)
                    .or().like(SysUser::getPhone, keyword));
        }
        qw.orderByDesc(SysUser::getCreateTime);
        return Result.success(PageResult.of(userService.page(new Page<>(page, pageSize), qw)));
    }

    // 11.2 用户详情
    @GetMapping("/{id}")
    public Result<SysUser> getById(@PathVariable Long id) {
        return Result.success(userService.getById(id));
    }

    // 11.3 新增用户（密码自动 BCrypt 加密）
    @PostMapping
    public Result<SysUser> create(@RequestBody SysUser user) {
        user.setPassword(BCrypt.hashpw(user.getPassword()));
        if (user.getRole() == null) user.setRole("RESIDENT");
        if (user.getStatus() == null) user.setStatus("ENABLED");
        userService.save(user);
        return Result.success(user);
    }

    // 11.4 更新用户（仅更新传入的非 null 字段，username 不可修改）
    @PutMapping("/{id}")
    public Result<SysUser> update(@PathVariable Long id, @RequestBody SysUser update) {
        LambdaUpdateWrapper<SysUser> uw = new LambdaUpdateWrapper<>();
        uw.eq(SysUser::getId, id);
        if (StringUtils.hasText(update.getRealName())) uw.set(SysUser::getRealName, update.getRealName());
        if (StringUtils.hasText(update.getPhone())) uw.set(SysUser::getPhone, update.getPhone());
        if (StringUtils.hasText(update.getEmail())) uw.set(SysUser::getEmail, update.getEmail());
        if (StringUtils.hasText(update.getAvatar())) uw.set(SysUser::getAvatar, update.getAvatar());
        if (StringUtils.hasText(update.getRole())) uw.set(SysUser::getRole, update.getRole());
        if (StringUtils.hasText(update.getStatus())) uw.set(SysUser::getStatus, update.getStatus());
        userService.update(uw);
        return Result.success(userService.getById(id));
    }

    // 11.5 删除用户（逻辑删除）
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        userService.removeById(id);
        return Result.success();
    }

    // 11.6 修改密码（需验证旧密码）
    @PutMapping("/{id}/password")
    public Result<Void> changePassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        SysUser user = userService.getById(id);
        if (user == null) return Result.error(400, "用户不存在");
        if (!BCrypt.checkpw(body.get("oldPassword"), user.getPassword())) {
            return Result.error(400, "旧密码错误");
        }
        String newPwd = body.get("newPassword");
        if (newPwd == null || newPwd.length() < 6) {
            return Result.error(400, "新密码至少6位");
        }
        user.setPassword(BCrypt.hashpw(newPwd));
        userService.updateById(user);
        return Result.success();
    }

    // 11.7 重置密码（管理员专用，无需旧密码）
    @PutMapping("/{id}/reset-password")
    public Result<Void> resetPassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        SysUser user = userService.getById(id);
        if (user == null) return Result.error(400, "用户不存在");
        String newPwd = body.get("newPassword");
        if (newPwd == null || newPwd.length() < 6) {
            return Result.error(400, "新密码至少6位");
        }
        user.setPassword(BCrypt.hashpw(newPwd));
        userService.updateById(user);
        return Result.success();
    }
}