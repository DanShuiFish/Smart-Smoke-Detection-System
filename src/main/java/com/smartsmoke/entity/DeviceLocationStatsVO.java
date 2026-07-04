package com.smartsmoke.entity;

import lombok.Data;

@Data
public class DeviceLocationStatsVO {
    private String building;
    private int total;
    private int online;
    private int offline;
}
