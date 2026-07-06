package com.smartsmoke.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.DeviceBinding;
import com.smartsmoke.entity.DeviceBindingVO;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.mapper.UserMapper;
import com.smartsmoke.service.DeviceBindingService;
import com.smartsmoke.service.DeviceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
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

    // ==================== 用户端 ====================

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

    // ==================== 管理端 ====================

    /**
     * 7.1 绑定列表（分页 + 多条件筛选）
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

        // 批量查设备名
        List<Long> deviceIds = records.stream().map(DeviceBinding::getDeviceId).distinct().collect(Collectors.toList());
        Map<Long, SmokeDevice> deviceMap = deviceIds.isEmpty() ? Map.of()
                : deviceMapper.selectBatchIds(deviceIds).stream()
                        .collect(Collectors.toMap(SmokeDevice::getId, Function.identity()));

        // 批量查用户名
        List<Long> userIds = records.stream().map(DeviceBinding::getUserId).distinct().collect(Collectors.toList());
        Map<Long, SysUser> userMap = userIds.isEmpty() ? Map.of()
                : userMapper.selectBatchIds(userIds).stream()
                        .collect(Collectors.toMap(SysUser::getId, Function.identity()));

        List<DeviceBindingVO> voList = records.stream().map(r -> {
            DeviceBindingVO vo = new DeviceBindingVO();
            // 拷贝基类字段
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
            // 填充关联名称
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
     * 7.2 新增绑定
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

        // 校验是否已有活跃绑定
        long count = bindingService.count(new LambdaQueryWrapper<DeviceBinding>()
                .eq(DeviceBinding::getDeviceId, deviceId)
                .eq(DeviceBinding::getUserId, userId)
                .eq(DeviceBinding::getStatus, "BOUND"));
        if (count > 0) {
            return Result.error(409, "该设备与用户已存在活跃绑定，请勿重复绑定");
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
     * 7.3 解绑
     */
    @PutMapping("/{id}/unbind")
    public Result<Void> unbind(@PathVariable Long id, @RequestBody Map<String, String> body) {
        DeviceBinding binding = bindingService.getById(id);
        if (binding == null) {
            return Result.error(400, "绑定记录不存在");
        }
        if (!"BOUND".equals(binding.getStatus())) {
            return Result.error(400, "当前状态 " + binding.getStatus() + " 不可解绑，仅 BOUND 可解绑");
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
