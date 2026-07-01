package com.smartsmoke.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("sensor_data")
public class SensorData {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long deviceId;
    private java.math.BigDecimal smokeConcentration;
    private java.math.BigDecimal temperature;
    private java.math.BigDecimal humidity;
    private String unit;
    private Integer isAlert;
    private String extraData;
    private LocalDateTime collectTime;
    private LocalDateTime createTime;
}
