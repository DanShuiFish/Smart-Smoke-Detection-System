package com.smartsmoke.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * 心跳报文 DTO — 匹配 API 文档 3.3 节格式
 * 字段: deviceId / bat / rssi / ts
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class HeartbeatDTO {
    private String deviceId;  // 设备编号，如 "SDS-001"
    private Integer bat;      // 电池电量 0~100
    private Integer rssi;     // 信号强度 (dBm)，如 -45
    private Long ts;          // Unix 毫秒时间戳
}
