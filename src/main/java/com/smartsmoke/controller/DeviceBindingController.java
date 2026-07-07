package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.DeviceBinding;
import com.smartsmoke.entity.DeviceBindingVO;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.mapper.SensorDataMapper;
import com.smartsmoke.mapper.UserMapper;
import com.smartsmoke.service.DeviceBindingService;
import com.smartsmoke.service.DeviceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/bindings")
@RequiredArgsConstructor
public class DeviceBindingController {

    private final DeviceBindingService bindingService;
    private final DeviceService deviceService;
    private final DeviceMapper deviceMapper;
    private final UserMapper userMapper;
    private final SensorDataMapper sensorDataMapper;

    // ==================== 閻劍鍩涚粩?====================

    @GetMapping("/my-device-ids")
    public Result<List<Long>> getMyDeviceIds() {
        long userId = StpUtil.getLoginIdAsLong();
        return Result.success(bindingService.getMyDeviceIds(userId));
    }

    @GetMapping("/my-devices")
    public Result<PageResult<Map<String, Object>>> getMyDevices(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        long userId = StpUtil.getLoginIdAsLong();
        List<Long> deviceIds = bindingService.getMyDeviceIds(userId);
        if (deviceIds.isEmpty()) {
            return Result.success(new PageResult<>());
        }
        LambdaQueryWrapper<SmokeDevice> qw = new LambdaQueryWrapper<>();
        qw.in(SmokeDevice::getId, deviceIds);
        qw.orderByAsc(SmokeDevice::getSortOrder);
        com.baomidou.mybatisplus.extension.plugins.pagination.Page<SmokeDevice> result = deviceService.page(new Page<>(page, size), qw);
        List<Map<String, Object>> enriched = result.getRecords().stream().map(d -> {
            Map<String, Object> m = new HashMap<>();
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
    @GetMapping("/my")
    public Result<List<DeviceBinding>> getMyBindings() {
        long userId = StpUtil.getLoginIdAsLong();
        LambdaQueryWrapper<DeviceBinding> qw = new LambdaQueryWrapper<>();
        qw.eq(DeviceBinding::getUserId, userId)
                .eq(DeviceBinding::getStatus, "BOUND")
                .eq(DeviceBinding::getIsDeleted, 0);
        return Result.success(bindingService.list(qw));
    }

    // ==================== 缁狅紕鎮婄粩?====================

    /**
     * 7.1 缂佹垵鐣鹃崚妤勩€冮敍鍫濆瀻妞?+ 婢舵碍娼禒鍓佺摣闁绱?
     */
    @GetMapping
    public Result<PageResult<DeviceBindingVO>> list(
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        LambdaQueryWrapper<DeviceBinding> qw = new LambdaQueryWrapper<>();
        if (userId != null) qw.eq(DeviceBinding::getUserId, userId);
        if (deviceId != null) qw.eq(DeviceBinding::getDeviceId, deviceId);
        if (status != null) qw.eq(DeviceBinding::getStatus, status);
        qw.orderByDesc(DeviceBinding::getBindTime);
        Page<DeviceBinding> bindingPage = bindingService.page(new Page<>(page, pageSize), qw);

        List<DeviceBinding> records = bindingPage.getRecords();

        // 閹靛綊鍣洪弻銉啎婢跺洤鎮?
        List<Long> deviceIds = records.stream().map(DeviceBinding::getDeviceId).distinct().collect(Collectors.toList());
        Map<Long, SmokeDevice> deviceMap = deviceIds.isEmpty() ? Map.of()
                : deviceMapper.selectBatchIds(deviceIds).stream()
                        .collect(Collectors.toMap(SmokeDevice::getId, Function.identity()));

        // 閹靛綊鍣洪弻銉ф暏閹村嘲鎮?
        List<Long> userIds = records.stream().map(DeviceBinding::getUserId).distinct().collect(Collectors.toList());
        Map<Long, SysUser> userMap = userIds.isEmpty() ? Map.of()
                : userMapper.selectBatchIds(userIds).stream()
                        .collect(Collectors.toMap(SysUser::getId, Function.identity()));

        List<DeviceBindingVO> voList = records.stream().map(r -> {
            DeviceBindingVO vo = new DeviceBindingVO();
            // 閹风柉绀夐崺铏硅鐎涙顔?
            vo.setId(r.getId());
            vo.setDeviceId(r.getDeviceId());
            vo.setUserId(r.getUserId());
            vo.setBindType(r.getBindType());
            vo.setBindTime(r.getBindTime());
            vo.setUnbindTime(r.getUnbindTime());
            vo.setStatus(r.getStatus());
            vo.setRemark(r.getRemark());
            vo.setIsDeleted(r.getIsDeleted());
            vo.setCreateBy(r.getCreateBy());
            vo.setCreateTime(r.getCreateTime());
            vo.setUpdateBy(r.getUpdateBy());
            vo.setUpdateTime(r.getUpdateTime());
            // 婵夘偄鍘栭崗瀹犱粓閸氬秶袨
            SmokeDevice dev = deviceMap.get(r.getDeviceId());
            if (dev != null) vo.setDeviceName(dev.getDeviceName());
            SysUser usr = userMap.get(r.getUserId());
            if (usr != null) vo.setUserRealName(usr.getRealName());
            return vo;
        }).collect(Collectors.toList());

        Page<DeviceBindingVO> voPage = new Page<>(page, pageSize, bindingPage.getTotal());
        voPage.setRecords(voList);
        return Result.success(PageResult.of(voPage));
    }

    /**
     * 7.2 閺傛澘顤冪紒鎴濈暰
     */
    @PostMapping
    public Result<DeviceBinding> create(@RequestBody Map<String, Object> body) {
        Long deviceId = toLong(body.get("deviceId"));
        Long userId = toLong(body.get("userId"));
        if (deviceId == null || userId == null) {
            return Result.error(400, "deviceId 和 userId 为必填项");
        }

        if (deviceMapper.selectById(deviceId) == null) {
            return Result.error(400, "设备不存在");
        }
        if (userMapper.selectById(userId) == null) {
            return Result.error(400, "用户不存在");
        }

        // 閺嶏繝鐛欓弰顖氭儊瀹稿弶婀佸ú鏄忕┈缂佹垵鐣?
        long count = bindingService.count(new LambdaQueryWrapper<DeviceBinding>()
                .eq(DeviceBinding::getDeviceId, deviceId)
                .eq(DeviceBinding::getUserId, userId)
                .eq(DeviceBinding::getStatus, "BOUND"));
        if (count > 0) {
            return Result.error(409, "鐠囥儴顔曟径鍥︾瑢閻劍鍩涘鎻掔摠閸︺劍妞跨捄鍐拨鐎规熬绱濈拠宄板瑏闁插秴顦茬紒鎴濈暰");
        }

        DeviceBinding binding = new DeviceBinding();
        binding.setDeviceId(deviceId);
        binding.setUserId(userId);
        binding.setBindType(body.get("bindType") != null ? body.get("bindType").toString() : "OWNER");
        binding.setRemark(body.get("remark") != null ? body.get("remark").toString() : null);
        binding.setStatus("BOUND");
        binding.setBindTime(LocalDateTime.now());
        bindingService.save(binding);
        return Result.success(binding);
    }

    /**
     * 7.3 鐟欙絿绮?
     */
    @PutMapping("/{id}/unbind")
    public Result<Void> unbind(@PathVariable Long id, @RequestBody Map<String, String> body) {
        DeviceBinding binding = bindingService.getById(id);
        if (binding == null) {
            return Result.error(400, "绑定记录不存在");
        }
        if (!"BOUND".equals(binding.getStatus())) {
            return Result.error(400, "当前状态" + binding.getStatus() + " 不可解绑，仅 BOUND 可解绑");
        }
        binding.setStatus("UNBOUND");
        binding.setUnbindTime(LocalDateTime.now());
        if (body != null && body.containsKey("remark")) {
            binding.setRemark(body.get("remark"));
        }
        bindingService.updateById(binding);
        return Result.success();
    }

    private static Long toLong(Object val) {
        if (val == null) return null;
        if (val instanceof Number) return ((Number) val).longValue();
        try {
            return Long.valueOf(val.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}