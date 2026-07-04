package com.smartsmoke.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.smartsmoke.entity.DeviceBinding;

import java.util.List;

public interface DeviceBindingService extends IService<DeviceBinding> {
    List<Long> getMyDeviceIds(Long userId);
}