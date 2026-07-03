package com.smartsmoke.entity;

import lombok.Data;

@Data
public class DashboardStatsVO {
    private int totalDevices;
    private int onlineDevices;
    private int offlineDevices;
    private int errorDevices;
    private int todayAlarms;
    private int pendingAlarms;
    private int confirmedAlarms;
    private int resolvedAlarms;
}
