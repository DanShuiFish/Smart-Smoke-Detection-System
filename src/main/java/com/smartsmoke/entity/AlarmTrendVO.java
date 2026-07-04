package com.smartsmoke.entity;

import lombok.Data;

@Data
public class AlarmTrendVO {
    private String date;
    private int total;
    private int smokeOverflow;
    private int deviceOffline;
}
