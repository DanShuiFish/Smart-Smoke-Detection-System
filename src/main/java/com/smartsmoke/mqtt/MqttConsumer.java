package com.smartsmoke.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartsmoke.rule.AlarmRuleEngine;
import com.smartsmoke.entity.SensorData;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class MqttConsumer {
    private final MqttClient mqttClient;
    private final AlarmRuleEngine alarmRuleEngine;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // 【核心修改点】读取你在 yml 中新写的 subscribe 路径
    @Value("${mqtt.topics.subscribe}")
    private String subscribeTopics;

    public MqttConsumer(MqttClient mqttClient, AlarmRuleEngine alarmRuleEngine) {
        this.mqttClient = mqttClient;
        this.alarmRuleEngine = alarmRuleEngine;
    }

    @PostConstruct
    public void subscribe() {
        if (mqttClient == null || !mqttClient.isConnected()) {
            log.warn("MQTT not connected, skip subscribe. Start MQTT broker and restart to enable IoT data ingestion.");
            return;
        }
        try {
            // 使用读取到的 subscribeTopics 变量
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
            // 1. 将收到的 JSON 报文解析为咱们的 SensorData 实体对象
            SensorData sensorData = objectMapper.readValue(payload, SensorData.class);

            // 2. 快递分拣完毕，直接把对象扔给 PM 写的规则引擎去处理！
            alarmRuleEngine.processData(sensorData);

        } catch (Exception e) {
            log.error("MQTT报文解析失败或规则引擎处理异常, topic: {}, payload: {}", topic, payload, e);
        }
    }
}