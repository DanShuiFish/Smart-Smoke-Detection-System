package com.smartsmoke.mqtt;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartsmoke.dto.DeviceReportDTO; // 引入第一步新建的DTO
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.DeviceMapper; // 引入DeviceMapper
import com.smartsmoke.rule.AlarmRuleEngine;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

// 在 MQTT 接收端建立一个“防波堤”，
// 把硬件原始的、简陋的数据格式（DTO），安全地转换为我们后端复杂、严谨的业务实体对象（Entity）
@Slf4j
@Component
public class MqttConsumer {
    private final MqttClient mqttClient;
    private final AlarmRuleEngine alarmRuleEngine;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // 【修改点1】新增注入 DeviceMapper，用于查询设备信息
    private final DeviceMapper deviceMapper;

    @Value("${mqtt.topics.subscribe}")
    private String subscribeTopics;

    // 【修改点2】构造函数中加入 deviceMapper
    public MqttConsumer(MqttClient mqttClient, AlarmRuleEngine alarmRuleEngine, DeviceMapper deviceMapper) {
        this.mqttClient = mqttClient;
        this.alarmRuleEngine = alarmRuleEngine;
        this.deviceMapper = deviceMapper;
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

    private void handleMessage(String topic, MqttMessage msg) {
        String payload = new String(msg.getPayload());
        log.debug("MQTT [{}]: {}", topic, payload);

        try {
            // 【修改点3】反序列化目标改为硬件友好的 DeviceReportDTO
            DeviceReportDTO report = objectMapper.readValue(payload, DeviceReportDTO.class);

            // 【修改点4】设备身份转换：通过硬件SN码(String)查找数据库中的主键ID(Long)
            SmokeDevice device = deviceMapper.selectOne(
                    new QueryWrapper<SmokeDevice>().eq("device_id", report.getDeviceId())
            );

            if (device == null) {
                log.warn("收到未注册设备的数据上报，硬件标识: {}", report.getDeviceId());
                return; // 防御性编程：未在系统注册的设备数据直接拦截，不入库
            }

            SmokeDevice updateDevice = new SmokeDevice();
            updateDevice.setId(device.getId());
            updateDevice.setStatus("ONLINE"); // 标记为在线
            updateDevice.setLastOnlineTime(LocalDateTime.now());
            if (report.getBat() != null) {
                updateDevice.setBattery(report.getBat()); // 如果报文里带了电量，顺手更新
            }
            deviceMapper.updateById(updateDevice);

            // 【修改点5】DTO 转换为 Entity 实体
            SensorData sensorData = new SensorData();
            sensorData.setDeviceId(device.getId()); // 填入对应的 Long 类型外键
            sensorData.setSmokeConcentration(report.getSmoke());
            sensorData.setTemperature(report.getTemp());
            sensorData.setHumidity(report.getHumi());
            sensorData.setUnit("mg/m3"); // 补充默认单位

            // 【修改点6】时间戳安全降级策略
            if (report.getTs() != null) {
                // 如果鸿蒙设备端传了 Unix 时间戳，转换为 LocalDateTime
                sensorData.setCollectTime(LocalDateTime.ofInstant(Instant.ofEpochMilli(report.getTs()), ZoneId.systemDefault()));
            } else {
                // 如果鸿蒙设备端没有 RTC 时钟且未联网获取时间，平台自动打上云端接收时间
                sensorData.setCollectTime(LocalDateTime.now());
            }

            // 最后交给 PM 的规则引擎处理
            alarmRuleEngine.processData(sensorData);

        } catch (Exception e) {
            log.error("MQTT报文解析失败或规则引擎处理异常, topic: {}, payload: {}", topic, payload, e);
        }
    }
}