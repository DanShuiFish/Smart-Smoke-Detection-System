package com.smartsmoke.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.service.DeviceService;
import org.springframework.stereotype.Service;

@Service
public class DeviceServiceImpl extends ServiceImpl<DeviceMapper, SmokeDevice> implements DeviceService {
}