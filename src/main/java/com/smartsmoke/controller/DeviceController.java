package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.dto.DeviceBatchDeleteRequest;
import com.smartsmoke.entity.DeviceBinding;
import com.smartsmoke.entity.DeviceStatusStatsVO;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.mapper.UserMapper;
import com.smartsmoke.service.DeviceBindingService;
import com.smartsmoke.service.DeviceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {
    private final DeviceService deviceService;
    private final DeviceBindingService deviceBindingService;
    private final UserMapper userMapper;

    /**
     * 获取当前用户可见的设备 ID 集合。
     * ADMIN → null（看全部）；RESIDENT → 已绑定的设备 ID 集合
     */
    private Set<Long> getVisibleDeviceIds() {
        long userId = StpUtil.getLoginIdAsLong();
        SysUser user = userMapper.selectById(userId);
        String role = user != null ? user.getRole() : "RESIDENT";
        if (role == null) return null;
        String upper = role.toUpperCase();
        // 管理员角色看全部
        if (upper.equals("ADMIN") || upper.equals("SYSTEM_ADMIN") || upper.equals("COMMUNITY_ADMIN")) return null;
        List<Long> boundIds = deviceBindingService.getMyDeviceIds(userId);
        return boundIds.isEmpty() ? Set.of(-1L) : Set.copyOf(boundIds);
    }

    @GetMapping
    public Result<PageResult<SmokeDevice>> listDevices(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String building,
            @RequestParam(required = false) String keyword) {
        LambdaQueryWrapper<SmokeDevice> qw = new LambdaQueryWrapper<>();
        qw.eq(SmokeDevice::getIsDeleted, 0);
        Set<Long> visibleIds = getVisibleDeviceIds();
        if (visibleIds != null) qw.in(SmokeDevice::getId, visibleIds);
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
        Set<Long> visibleIds = getVisibleDeviceIds();
        if (visibleIds == null) {
            return Result.success(deviceService.getStats());
        }
        // 居民只看绑定设备的统计
        LambdaQueryWrapper<SmokeDevice> qw = new LambdaQueryWrapper<>();
        qw.eq(SmokeDevice::getIsDeleted, 0).in(SmokeDevice::getId, visibleIds);
        long total = deviceService.count(qw);
        long online = deviceService.count(new LambdaQueryWrapper<SmokeDevice>()
                .eq(SmokeDevice::getIsDeleted, 0).in(SmokeDevice::getId, visibleIds).eq(SmokeDevice::getStatus, "ONLINE"));
        long offline = deviceService.count(new LambdaQueryWrapper<SmokeDevice>()
                .eq(SmokeDevice::getIsDeleted, 0).in(SmokeDevice::getId, visibleIds).eq(SmokeDevice::getStatus, "OFFLINE"));
        long error = deviceService.count(new LambdaQueryWrapper<SmokeDevice>()
                .eq(SmokeDevice::getIsDeleted, 0).in(SmokeDevice::getId, visibleIds).eq(SmokeDevice::getStatus, "ERROR"));
        long inactive = deviceService.count(new LambdaQueryWrapper<SmokeDevice>()
                .eq(SmokeDevice::getIsDeleted, 0).in(SmokeDevice::getId, visibleIds).eq(SmokeDevice::getStatus, "INACTIVE"));

        DeviceStatusStatsVO vo = new DeviceStatusStatsVO();
        vo.setTotal((int) total);
        vo.setOnline((int) online);
        vo.setOffline((int) offline);
        vo.setError((int) error);
        vo.setInactive((int) inactive);
        vo.setAvgBattery(0);
        return Result.success(vo);
    }

    @GetMapping("/{id}")
    public Result<SmokeDevice> getDeviceById(@PathVariable Long id) {
        Set<Long> visibleIds = getVisibleDeviceIds();
        if (visibleIds != null && !visibleIds.contains(id)) {
            return Result.error(403, "无权查看该设备");
        }
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

        // 自动绑定：创建者成为该设备的 OWNER
        long userId = StpUtil.getLoginIdAsLong();
        DeviceBinding binding = new DeviceBinding();
        binding.setDeviceId(device.getId());
        binding.setUserId(userId);
        binding.setBindType("OWNER");
        binding.setStatus("BOUND");
        binding.setBindTime(LocalDateTime.now());
        deviceBindingService.save(binding);

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
