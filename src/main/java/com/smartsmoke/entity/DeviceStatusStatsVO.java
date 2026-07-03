package com.smartsmoke.entity;

import lombok.Data;

@Data
public class DeviceStatusStatsVO {
    private int total;
    private int online;
    private int offline;
    private int error;
    private int inactive;
    private int avgBattery;
}
