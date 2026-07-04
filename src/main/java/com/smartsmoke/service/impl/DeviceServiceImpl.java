package com.smartsmoke.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.service.DeviceService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
public class DeviceServiceImpl extends ServiceImpl<DeviceMapper, SmokeDevice> implements DeviceService {

    @Override
    public void updateOffline(String deviceCode) {
        SmokeDevice device = lambdaQuery()
                .eq(SmokeDevice::getDeviceId, deviceCode)
                .one();

        if (device == null) {
            log.warn("updateOffline: 设备不存在 {}", deviceCode);
            return;
        }

        SmokeDevice update = new SmokeDevice();
        update.setId(device.getId());
        update.setStatus("OFFLINE");
        update.setLastOfflineTime(LocalDateTime.now());
        updateById(update);

        log.info("设备状态已更新为 OFFLINE: {} ({})", deviceCode, device.getDeviceName());
    }
}