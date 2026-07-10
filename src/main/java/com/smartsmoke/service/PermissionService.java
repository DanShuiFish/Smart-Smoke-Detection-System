package com.smartsmoke.service;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 统一权限服务。
 *
 * <pre>
 *   ADMIN  → null（看全部设备）
 *   RESIDENT → 按注册地址自动匹配设备（building + floor 一致即视为归属）
 *
 *   不再依赖 device_binding 显式绑定。
 * </pre>
 */
@Service
@RequiredArgsConstructor
public class PermissionService {

    private final UserMapper userMapper;
    private final DeviceMapper deviceMapper;

    /**
     * @return null = 管理员看全部；否则返回可见设备 ID 集合
     */
    public Set<Long> getVisibleDeviceIds() {
        long userId = StpUtil.getLoginIdAsLong();
        SysUser user = userMapper.selectById(userId);
        String role = user != null ? user.getRole() : "RESIDENT";
        if (role == null) role = "RESIDENT";

        if ("ADMIN".equalsIgnoreCase(role)) {
            return null; // 管理员看全部
        }

        // 居民：按注册地址自动匹配设备
        String building = user.getResidentBuilding();
        String floor = user.getResidentFloor();
        if (building == null || building.isEmpty() || floor == null || floor.isEmpty()) {
            return Set.of(-1L); // 未填地址 → 无设备
        }

        // 地址精确匹配：building + floor + room（room非必填，填了则精确到室）
        LambdaQueryWrapper<SmokeDevice> qw = new LambdaQueryWrapper<SmokeDevice>()
                .eq(SmokeDevice::getLocationBuilding, building)
                .eq(SmokeDevice::getLocationFloor, floor);
        String room = user.getResidentRoom();
        if (room != null && !room.isEmpty()) {
            qw.eq(SmokeDevice::getLocationRoom, room);
        }
        List<Long> deviceIds = deviceMapper.selectList(qw)
                .stream().map(SmokeDevice::getId).collect(Collectors.toList());

        return deviceIds.isEmpty() ? Set.of(-1L) : Set.copyOf(deviceIds);
    }

    /** 是否管理员（有写权限） */
    public boolean isAdmin() {
        long userId = StpUtil.getLoginIdAsLong();
        SysUser user = userMapper.selectById(userId);
        return user != null && "ADMIN".equalsIgnoreCase(user.getRole());
    }

    /** @deprecated 保留兼容，后续移除 */
    @Deprecated
    public boolean hasAdminWritePermission() {
        return isAdmin();
    }
}
