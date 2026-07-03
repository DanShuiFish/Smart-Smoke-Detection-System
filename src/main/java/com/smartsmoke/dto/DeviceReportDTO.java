package com.smartsmoke.dto;
import lombok.Data;
import java.math.BigDecimal;

@Data
// 专门接收硬件 JSON，并缩短变量名以适应单片机内存
public class DeviceReportDTO {
    private String deviceId; // 硬件SN码，如 "SDS-001"
    private BigDecimal smoke; // 烟雾浓度
    private BigDecimal temp;  // 温度
    private BigDecimal humi;  // 湿度
    private Integer bat;      // 电池电量(可选)
    private Long ts;          // 硬件时间戳(毫秒，可选。单片机无时间则由云端补齐)
}