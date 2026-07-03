package com.smartsmoke.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.smartsmoke.entity.DeviceStatusStatsVO;
import com.smartsmoke.entity.SmokeDevice;

public interface DeviceService extends IService<SmokeDevice> {

    DeviceStatusStatsVO getStats();
}