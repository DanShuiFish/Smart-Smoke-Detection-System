package com.smartsmoke.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.dto.DeviceBatchDeleteRequest;
import com.smartsmoke.entity.DeviceStatusStatsVO;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.service.DeviceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {
    private final DeviceService deviceService;

    @GetMapping
    public Result<PageResult<SmokeDevice>> listDevices(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String building,
            @RequestParam(required = false) String keyword) {
        LambdaQueryWrapper<SmokeDevice> qw = new LambdaQueryWrapper<>();
        qw.eq(SmokeDevice::getIsDeleted, 0);
        if (StringUtils.hasText(status)) qw.eq(SmokeDevice::getStatus, status);
        if (StringUtils.hasText(building)) qw.eq(SmokeDevice::getLocationBuilding, building);
        if (StringUtils.hasText(keyword)) {
            qw.and(w -> w.like(SmokeDevice::getDeviceName, keyword)
                    .or().like(SmokeDevice::getDeviceId, keyword));
        }
        qw.orderByAsc(SmokeDevice::getSortOrder);
        return Result.success(PageResult.of(deviceService.page(new Page<>(page, pageSize), qw)));
    }

    @GetMapping("/stats")
    public Result<DeviceStatusStatsVO> getStats() {
        return Result.success(deviceService.getStats());
    }

    @GetMapping("/{id}")
    public Result<SmokeDevice> getDeviceById(@PathVariable Long id) {
        SmokeDevice device = deviceService.getById(id);
        if (device == null) {
            return Result.error(404, "设备不存在");
        }
        return Result.success(device);
    }

    @PostMapping
    public Result<SmokeDevice> createDevice(@Valid @RequestBody SmokeDevice device) {
        SmokeDevice exist = deviceService.lambdaQuery()
                .eq(SmokeDevice::getDeviceId, device.getDeviceId()).one();
        if (exist != null) {
            return Result.error(409, "设备编号已存在: " + device.getDeviceId());
        }
        if (device.getStatus() == null) device.setStatus("OFFLINE");
        if (device.getBattery() == null) device.setBattery(100);
        deviceService.save(device);
        return Result.success(device);
    }

    @PutMapping("/{id}")
    public Result<SmokeDevice> updateDevice(@PathVariable Long id, @Valid @RequestBody SmokeDevice device) {
        SmokeDevice exist = deviceService.getById(id);
        if (exist == null) return Result.error(404, "设备不存在");
        SmokeDevice duplicate = deviceService.lambdaQuery()
                .eq(SmokeDevice::getDeviceId, device.getDeviceId())
                .ne(SmokeDevice::getId, id)
                .one();
        if (duplicate != null) {
            return Result.error(409, "设备编号已存在: " + device.getDeviceId());
        }
        device.setId(id);
        deviceService.updateById(device);
        return Result.success(deviceService.getById(id));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteDevice(@PathVariable Long id) {
        boolean removed = deviceService.removeById(id);
        return removed ? Result.success() : Result.error(404, "设备不存在");
    }

    @DeleteMapping("/batch")
    public Result<Void> batchDelete(@Valid @RequestBody DeviceBatchDeleteRequest request) {
        deviceService.removeByIds(request.getIds());
        return Result.success();
    }
}
