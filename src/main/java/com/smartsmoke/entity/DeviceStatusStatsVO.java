package com.smartsmoke.entity;

import lombok.Data;

/**
 * 设备状态统计 VO — 对应 GET /api/v1/devices/stats
 */
@Data
public class DeviceStatusStatsVO {
    private int total;
    private int online;
    private int offline;
    private int error;
    private int inactive;
    private int avgBattery;
}
