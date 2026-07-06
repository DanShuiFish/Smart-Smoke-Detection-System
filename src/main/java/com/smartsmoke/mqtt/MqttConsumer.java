package com.smartsmoke.mqtt;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartsmoke.dto.DeviceReportDTO;
import com.smartsmoke.dto.HeartbeatDTO;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.rule.AlarmRuleEngine;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * MQTT 消费者 — BE1 领地
 * 负责接收设备上报的数据和心跳，分发处理。
 * 心跳走 handleHeartbeat()，传感器数据走 handleDataReport()。
 */
@Slf4j
@Component
public class MqttConsumer {
    private final MqttClient mqttClient;
    private final AlarmRuleEngine alarmRuleEngine;
    private final DeviceMapper deviceMapper;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${mqtt.topics.subscribe}")
    private String subscribeTopics;

    public MqttConsumer(MqttClient mqttClient, AlarmRuleEngine alarmRuleEngine,
                        DeviceMapper deviceMapper, StringRedisTemplate stringRedisTemplate) {
        this.mqttClient = mqttClient;
        this.alarmRuleEngine = alarmRuleEngine;
        this.deviceMapper = deviceMapper;
        this.stringRedisTemplate = stringRedisTemplate;
    }

    @PostConstruct
    public void subscribe() {
        if (mqttClient == null || !mqttClient.isConnected()) {
            log.warn("MQTT not connected, skip subscribe. Start MQTT broker and restart to enable IoT data ingestion.");
            return;
        }
        try {
            for (String t : subscribeTopics.split(",")) {
                mqttClient.subscribe(t.trim(), (topic, msg) -> handleMessage(topic, msg));
                log.info("MQTT subscribed: {}", t.trim());
            }
        } catch (Exception e) {
            log.error("MQTT subscribe failed: {}", e.getMessage());
        }
    }

    /**
     * 消息入口：根据 topic 类型分流
     */
    private void handleMessage(String topic, MqttMessage msg) {
        String payload = new String(msg.getPayload());
        log.debug("MQTT [{}]: {}", topic, payload);

        try {
            if (topic.contains("/heartbeat")) {
                HeartbeatDTO heartbeat = objectMapper.readValue(payload, HeartbeatDTO.class);
                handleHeartbeat(heartbeat);
            } else {
                DeviceReportDTO report = objectMapper.readValue(payload, DeviceReportDTO.class);
                handleDataReport(report);
            }
        } catch (Exception e) {
            log.error("MQTT报文解析失败或处理异常, topic: {}, payload: {}", topic, payload, e);
        }
    }

    /**
     * 处理心跳报文
     */
    private void handleHeartbeat(HeartbeatDTO heartbeat) {
        SmokeDevice device = deviceMapper.selectOne(
                new QueryWrapper<SmokeDevice>().eq("device_id", heartbeat.getDeviceId())
        );

        if (device == null) {
            log.info("发现新设备，自动注册: {}", heartbeat.getDeviceId());
            device = new SmokeDevice();
            device.setDeviceId(heartbeat.getDeviceId());
            device.setDeviceName(heartbeat.getDeviceId()); // 默认名称 = 设备编号
            device.setStatus("ONLINE");
            device.setBattery(heartbeat.getBat());
            device.setSignalStrength(heartbeat.getRssi());
            device.setLastOnlineTime(LocalDateTime.now());
            device.setLastHeartbeat(LocalDateTime.now());
            device.setHeartbeatTimeout(30);
            device.setSortOrder(999);
            deviceMapper.insert(device);
        }

        SmokeDevice updateDevice = new SmokeDevice();
        updateDevice.setId(device.getId());
        updateDevice.setStatus("ONLINE");
        updateDevice.setLastOnlineTime(LocalDateTime.now());
        updateDevice.setLastHeartbeat(LocalDateTime.now());
        if (heartbeat.getBat() != null) {
            updateDevice.setBattery(heartbeat.getBat());
        }
        if (heartbeat.getRssi() != null) {
            updateDevice.setSignalStrength(heartbeat.getRssi());
        }
        deviceMapper.updateById(updateDevice);

        // Redis 心跳续期：Key 过期后由 RedisKeyspaceListener 触发离线告警
        int ttl = device.getHeartbeatTimeout() != null ? device.getHeartbeatTimeout() : 30;
        stringRedisTemplate.opsForValue()
                .set("device:heartbeat:" + heartbeat.getDeviceId(), "1", Duration.ofSeconds(ttl));

        log.debug("心跳更新: {} battery={}% rssi={}dBm", heartbeat.getDeviceId(), heartbeat.getBat(), heartbeat.getRssi());
    }

    /**
     * 处理传感器数据报文 — 转为 SensorData 交给规则引擎
     */
    private void handleDataReport(DeviceReportDTO report) {
        // 设备身份转换：通过硬件SN码查找数据库中的主键ID
        SmokeDevice device = deviceMapper.selectOne(
                new QueryWrapper<SmokeDevice>().eq("device_id", report.getDeviceId())
        );

        if (device == null) {
            log.info("发现新设备（数据上报触发自动注册）: {}", report.getDeviceId());
            device = new SmokeDevice();
            device.setDeviceId(report.getDeviceId());
            device.setDeviceName(report.getDeviceId());
            device.setStatus("ONLINE");
            device.setBattery(report.getBat());
            device.setSignalStrength(100);
            device.setLastOnlineTime(LocalDateTime.now());
            device.setHeartbeatTimeout(30);
            device.setSortOrder(999);
            deviceMapper.insert(device);
        }

        // 更新设备在线状态
        SmokeDevice updateDevice = new SmokeDevice();
        updateDevice.setId(device.getId());
        updateDevice.setStatus("ONLINE");
        updateDevice.setLastOnlineTime(LocalDateTime.now());
        if (report.getBat() != null) {
            updateDevice.setBattery(report.getBat());
        }
        deviceMapper.updateById(updateDevice);

        // DTO 转换为 Entity
        SensorData sensorData = new SensorData();
        sensorData.setDeviceId(device.getId());
        sensorData.setSmokeConcentration(report.getSmoke());
        sensorData.setTemperature(report.getTemp());
        sensorData.setHumidity(report.getHumi());
        sensorData.setUnit("mg/m3");

        // 时间戳安全降级策略
        if (report.getTs() != null) {
            sensorData.setCollectTime(LocalDateTime.ofInstant(
                    Instant.ofEpochMilli(report.getTs()), ZoneId.systemDefault()));
        } else {
            sensorData.setCollectTime(LocalDateTime.now());
        }

        // 交给 PM 的规则引擎处理
        alarmRuleEngine.processData(sensorData);
    }
}
