package com.smartsmoke.entity;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 设备绑定 VO — 包含关联的设备名称和用户姓名
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class DeviceBindingVO extends DeviceBinding {
    /** 关联 smoke_device.device_name */
    private String deviceName;
    /** 关联 sys_user.real_name */
    private String userRealName;
}
