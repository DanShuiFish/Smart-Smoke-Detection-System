package com.smartsmoke.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.entity.DeviceBinding;
import com.smartsmoke.mapper.DeviceBindingMapper;
import com.smartsmoke.service.DeviceBindingService;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class DeviceBindingServiceImpl extends ServiceImpl<DeviceBindingMapper, DeviceBinding> implements DeviceBindingService {

    @Override
    public List<Long> getMyDeviceIds(Long userId) {
        LambdaQueryWrapper<DeviceBinding> qw = new LambdaQueryWrapper<>();
        qw.eq(DeviceBinding::getUserId, userId)
                .eq(DeviceBinding::getStatus, "BOUND")
                .eq(DeviceBinding::getIsDeleted, 0);
        return list(qw).stream().map(DeviceBinding::getDeviceId).collect(Collectors.toList());
    }
}