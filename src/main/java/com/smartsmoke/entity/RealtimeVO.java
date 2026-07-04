package com.smartsmoke.entity;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class RealtimeVO {
    private List<SensorData> latestData;
    private List<AlarmRecord> activeAlarms;
    private Map<String, Integer> deviceStatusMap;
}
