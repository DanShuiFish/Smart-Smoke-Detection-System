package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.DeviceBinding;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.service.DeviceBindingService;
import com.smartsmoke.service.DeviceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/bindings")
@RequiredArgsConstructor
public class DeviceBindingController {

    private final DeviceBindingService bindingService;
    private final DeviceService deviceService;

    @GetMapping("/my-device-ids")
    public Result<List<Long>> getMyDeviceIds() {
        long userId = StpUtil.getLoginIdAsLong();
        return Result.success(bindingService.getMyDeviceIds(userId));
    }

    @GetMapping("/my-devices")
    public Result<PageResult<SmokeDevice>> getMyDevices(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        long userId = StpUtil.getLoginIdAsLong();
        List<Long> deviceIds = bindingService.getMyDeviceIds(userId);
        if (deviceIds.isEmpty()) {
            return Result.success(PageResult.of(new Page<>(page, size)));
        }
        LambdaQueryWrapper<SmokeDevice> qw = new LambdaQueryWrapper<>();
        qw.in(SmokeDevice::getId, deviceIds);
        qw.orderByAsc(SmokeDevice::getSortOrder);
        return Result.success(PageResult.of(deviceService.page(new Page<>(page, size), qw)));
    }

    @GetMapping("/my")
    public Result<List<DeviceBinding>> getMyBindings() {
        long userId = StpUtil.getLoginIdAsLong();
        LambdaQueryWrapper<DeviceBinding> qw = new LambdaQueryWrapper<>();
        qw.eq(DeviceBinding::getUserId, userId)
                .eq(DeviceBinding::getStatus, "BOUND")
                .eq(DeviceBinding::getIsDeleted, 0);
        return Result.success(bindingService.list(qw));
    }
}