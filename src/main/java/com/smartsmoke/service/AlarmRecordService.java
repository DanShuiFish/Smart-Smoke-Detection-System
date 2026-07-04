package com.smartsmoke.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.smartsmoke.entity.AlarmRecord;

public interface AlarmRecordService extends IService<AlarmRecord> {

    /**
     * 创建设备离线告警（由 Redis Keyspace 过期事件触发）
     * @param deviceCode 设备编号，如 "SDS-001"
     */
    void createOfflineAlarm(String deviceCode);
}