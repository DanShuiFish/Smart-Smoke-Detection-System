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
import com.smartsmoke.mapper.SensorDataMapper;
import com.smartsmoke.service.DeviceBindingService;
import com.smartsmoke.service.DeviceService;
import com.smartsmoke.service.PermissionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.stream.Collectors;
import java.util.LinkedHashMap;
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
    private final SensorDataMapper sensorDataMapper;
    private final PermissionService permissionService;

    @GetMapping
    public Result<PageResult<SmokeDevice>> listDevices(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String building,
            @RequestParam(required = false) String keyword) {
        LambdaQueryWrapper<SmokeDevice> qw = new LambdaQueryWrapper<>();
        qw.eq(SmokeDevice::getIsDeleted, 0);
        Set<Long> visibleIds = permissionService.getVisibleDeviceIds();
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
        Set<Long> visibleIds = permissionService.getVisibleDeviceIds();
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
        Set<Long> visibleIds = permissionService.getVisibleDeviceIds();
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
        if (!permissionService.hasAdminWritePermission()) return Result.error(403, "无权创建设备");
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
        if (!permissionService.hasAdminWritePermission()) return Result.error(403, "无权修改设备");
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
        if (!permissionService.hasAdminWritePermission()) return Result.error(403, "无权删除设备");
        boolean removed = deviceService.removeById(id);
        return removed ? Result.success() : Result.error(404, "设备不存在");
    }

    @DeleteMapping("/batch")
    public Result<Void> batchDelete(@Valid @RequestBody DeviceBatchDeleteRequest request) {
        if (!permissionService.hasAdminWritePermission()) return Result.error(403, "无权批量删除设备");
        deviceService.removeByIds(request.getIds());
        return Result.success();
    }
    @GetMapping("/building-tree")
    public Result<Map<String, Object>> buildingTree() {
        List<SmokeDevice> devices = deviceService.lambdaQuery()
                .eq(SmokeDevice::getIsDeleted, 0)
                .orderByAsc(SmokeDevice::getSortOrder)
                .list();

        Map<String, Map<String, List<SmokeDevice>>> grouped = new LinkedHashMap<>();
        for (SmokeDevice d : devices) {
            String building = (d.getLocationBuilding() != null && !d.getLocationBuilding().isBlank())
                    ? d.getLocationBuilding().trim() : "未分类楼栋";
            String floor = (d.getLocationFloor() != null && !d.getLocationFloor().isBlank())
                    ? d.getLocationFloor().trim() : "未分类楼层";
            grouped.computeIfAbsent(building, k -> new LinkedHashMap<>())
                    .computeIfAbsent(floor, k2 -> new ArrayList<>())
                    .add(d);
        }

        List<Long> deviceIds = devices.stream().map(SmokeDevice::getId).collect(Collectors.toList());
        Map<Long, SensorData> latestSensorMap = new HashMap<>();
        if (!deviceIds.isEmpty()) {
            List<SensorData> latestList = sensorDataMapper.selectList(
                    new LambdaQueryWrapper<SensorData>()
                            .in(SensorData::getDeviceId, deviceIds)
                            .orderByDesc(SensorData::getCreateTime));
            for (SensorData sd : latestList) {
                latestSensorMap.putIfAbsent(sd.getDeviceId(), sd);
            }
        }

        List<Map<String, Object>> buildings = new ArrayList<>();
        for (Map.Entry<String, Map<String, List<SmokeDevice>>> bEntry : grouped.entrySet()) {
            Map<String, List<SmokeDevice>> floorMap = bEntry.getValue();
            int bTotal = 0, bOnline = 0, bOffline = 0, bError = 0;
            List<Map<String, Object>> floors = new ArrayList<>();
            for (Map.Entry<String, List<SmokeDevice>> fEntry : floorMap.entrySet()) {
                List<SmokeDevice> floorDevs = fEntry.getValue();
                int fTotal = floorDevs.size();
                int fOnline = (int) floorDevs.stream().filter(d -> "ONLINE".equals(d.getStatus())).count();
                floors.add(Map.of("name", fEntry.getKey(), "total", fTotal, "online", fOnline));
                bTotal += fTotal;
                bOnline += fOnline;
                bOffline += (int) floorDevs.stream().filter(d -> "OFFLINE".equals(d.getStatus())).count();
                bError += (int) floorDevs.stream().filter(d -> "ERROR".equals(d.getStatus())).count();
            }

            List<Map<String, Object>> enrichedDevices = new ArrayList<>();
            for (SmokeDevice d : bEntry.getValue().values().stream().flatMap(Collection::stream).collect(Collectors.toList())) {
                Map<String, Object> devMap = new LinkedHashMap<>();
                devMap.put("id", d.getId());
                devMap.put("deviceId", d.getDeviceId());
                devMap.put("deviceName", d.getDeviceName());
                devMap.put("status", d.getStatus());
                devMap.put("battery", d.getBattery());
                devMap.put("signalStrength", d.getSignalStrength());
                devMap.put("locationBuilding", d.getLocationBuilding());
                devMap.put("locationFloor", d.getLocationFloor());
                devMap.put("locationRoom", d.getLocationRoom());
                devMap.put("lastHeartbeat", d.getLastHeartbeat());
                SensorData sd = latestSensorMap.get(d.getId());
                devMap.put("smokeConcentration", sd != null ? sd.getSmokeConcentration() : null);
                devMap.put("temperature", sd != null ? sd.getTemperature() : null);
                enrichedDevices.add(devMap);
            }

            Map<String, Object> building = new LinkedHashMap<>();
            building.put("name", bEntry.getKey());
            building.put("total", bTotal);
            building.put("online", bOnline);
            building.put("offline", bOffline);
            building.put("error", bError);
            building.put("floors", floors);
            building.put("devices", enrichedDevices);
            buildings.add(building);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("buildings", buildings);
        return Result.success(result);
    }
}
