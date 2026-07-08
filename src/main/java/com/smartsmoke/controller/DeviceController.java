package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.dto.DeviceBatchDeleteRequest;
import com.smartsmoke.entity.DeviceBinding;
import com.smartsmoke.entity.DeviceStatusStatsVO;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.mapper.SensorDataMapper;
import com.smartsmoke.mapper.UserMapper;
import com.smartsmoke.service.DeviceBindingService;
import com.smartsmoke.service.DeviceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {
    private final DeviceService deviceService;
    private final DeviceBindingService deviceBindingService;
    private final UserMapper userMapper;
    private final SensorDataMapper sensorDataMapper;

    /**
     * 鑾峰彇褰撳墠鐢ㄦ埛鍙鐨勮澶?ID 闆嗗悎銆?
     * ADMIN 鈫?null锛堢湅鍏ㄩ儴锛夛紱RESIDENT 鈫?宸茬粦瀹氱殑璁惧 ID 闆嗗悎
     */
    private Set<Long> getVisibleDeviceIds() {
        long userId = StpUtil.getLoginIdAsLong();
        SysUser user = userMapper.selectById(userId);
        String role = user != null ? user.getRole() : "RESIDENT";
        if (role == null) return null;
        String upper = role.toUpperCase();
        // 绠＄悊鍛樿鑹茬湅鍏ㄩ儴
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
        // 灞呮皯鍙湅缁戝畾璁惧鐨勭粺璁?
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

    @GetMapping("/mine")
    public Result<PageResult<Map<String, Object>>> myDevices(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        List<Long> ids = deviceBindingService.getMyDeviceIds(StpUtil.getLoginIdAsLong());
        if (ids.isEmpty()) {
            return Result.success(new PageResult<>());
        }
        com.baomidou.mybatisplus.extension.plugins.pagination.Page<SmokeDevice> pg =
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(page, pageSize);
        LambdaQueryWrapper<SmokeDevice> qw = new LambdaQueryWrapper<SmokeDevice>()
                .eq(SmokeDevice::getIsDeleted, 0)
                .in(SmokeDevice::getId, ids)
                .orderByAsc(SmokeDevice::getSortOrder);
        com.baomidou.mybatisplus.extension.plugins.pagination.Page<SmokeDevice> result = deviceService.page(pg, qw);
        List<Map<String, Object>> enriched = result.getRecords().stream().map(d -> {
            Map<String, Object> m = new java.util.HashMap<>();
            m.put("id", d.getId());
            m.put("deviceId", d.getDeviceId());
            m.put("deviceName", d.getDeviceName());
            m.put("deviceModel", d.getDeviceModel());
            m.put("status", d.getStatus());
            m.put("battery", d.getBattery());
            m.put("signalStrength", d.getSignalStrength());
            m.put("locationBuilding", d.getLocationBuilding());
            m.put("locationFloor", d.getLocationFloor());
            m.put("locationRoom", d.getLocationRoom());
            m.put("lastHeartbeat", d.getLastHeartbeat());
            m.put("heartbeatTimeout", d.getHeartbeatTimeout());
            SensorData latest = sensorDataMapper.selectOne(
                    new LambdaQueryWrapper<SensorData>()
                            .eq(SensorData::getDeviceId, d.getId())
                            .orderByDesc(SensorData::getCreateTime)
                            .last("LIMIT 1"));
            if (latest != null) {
                m.put("smokeConcentration", latest.getSmokeConcentration());
                m.put("temperature", latest.getTemperature());
            } else {
                m.put("smokeConcentration", null);
                m.put("temperature", null);
            }
            return m;
        }).collect(java.util.stream.Collectors.toList());
        PageResult<Map<String, Object>> pr = new PageResult<>();
        pr.setPage((int) result.getCurrent());
        pr.setPageSize((int) result.getSize());
        pr.setTotal(result.getTotal());
        pr.setPages((int) result.getPages());
        pr.setRecords(enriched);
        return Result.success(pr);
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
            return Result.error(409, "设备编号已存在"  + device.getDeviceId());
        }
        if (device.getStatus() == null) device.setStatus("OFFLINE");
        if (device.getBattery() == null) device.setBattery(100);
        if (device.getHeartbeatTimeout() == null || device.getHeartbeatTimeout() < 10) {
            device.setHeartbeatTimeout(30);
        }
        deviceService.save(device);

        // 鑷姩缁戝畾锛氬垱寤鸿€呮垚涓鸿璁惧鐨?OWNER
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
            return Result.error(409, "设备编号已存在"  + device.getDeviceId());
        }
        if (device.getHeartbeatTimeout() == null || device.getHeartbeatTimeout() < 10) {
            device.setHeartbeatTimeout(exist.getHeartbeatTimeout() != null && exist.getHeartbeatTimeout() >= 10
                    ? exist.getHeartbeatTimeout()
                    : 30);
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
