package com.smartsmoke.service;


import com.baomidou.mybatisplus.extension.service.IService;
import com.smartsmoke.entity.DeviceStatusStatsVO;
import com.smartsmoke.entity.SmokeDevice;

public interface DeviceService extends IService<SmokeDevice> {
//11
    /**
     * 更新设备为离线状态（由 Redis Keyspace 过期事件触发）
     * @param deviceCode 设备编号，如 "SDS-001"
     */
    void updateOffline(String deviceCode);
    DeviceStatusStatsVO getStats();
}
