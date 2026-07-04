package com.smartsmoke.controller;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.DeviceStatusStatsVO;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.service.DeviceService;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/devices")
@RequiredArgsConstructor
public class DeviceController {
    private final DeviceService deviceService;
    @GetMapping
    public Result<PageResult<SmokeDevice>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String building,
            @RequestParam(required = false) String keyword) {
        LambdaQueryWrapper<SmokeDevice> qw = new LambdaQueryWrapper<>();
        if (status != null) qw.eq(SmokeDevice::getStatus, status);
        if (building != null) qw.eq(SmokeDevice::getLocationBuilding, building);
        if (StringUtils.hasText(keyword)) {
            qw.and(w -> w.like(SmokeDevice::getDeviceName, keyword)
                    .or().like(SmokeDevice::getDeviceId, keyword));
        }
        qw.orderByAsc(SmokeDevice::getSortOrder);
        return Result.success(PageResult.of(deviceService.page(new Page<>(page, pageSize), qw)));
    }
    @GetMapping("/stats")
    public Result<DeviceStatusStatsVO> stats() {
        return Result.success(deviceService.getStats());
    }
    @GetMapping("/{id}")
    public Result<SmokeDevice> getById(@PathVariable Long id) {
        return Result.success(deviceService.getById(id));
    }
    @PostMapping
    public Result<SmokeDevice> create(@RequestBody SmokeDevice device) {
        deviceService.save(device); return Result.success(device);
    }
    @PutMapping("/{id}")
    public Result<SmokeDevice> update(@PathVariable Long id, @RequestBody SmokeDevice device) {
        device.setId(id); deviceService.updateById(device); return Result.success(device);
    }
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        deviceService.removeById(id); return Result.success();
    }
}
