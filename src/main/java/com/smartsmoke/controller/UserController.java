package com.smartsmoke.controller;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;
    @GetMapping
    public Result<PageResult<SysUser>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String role) {
        LambdaQueryWrapper<SysUser> qw = new LambdaQueryWrapper<>();
        if (role != null) qw.eq(SysUser::getRole, role);
        qw.orderByDesc(SysUser::getCreateTime);
        return Result.success(PageResult.of(userService.page(new Page<>(page, size), qw)));
    }
    @GetMapping("/{id}")
    public Result<SysUser> getById(@PathVariable Long id) { return Result.success(userService.getById(id)); }
    @PostMapping
    public Result<SysUser> create(@RequestBody SysUser user) { userService.save(user); return Result.success(user); }
}