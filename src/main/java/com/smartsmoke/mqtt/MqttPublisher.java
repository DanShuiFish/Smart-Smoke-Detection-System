package com.smartsmoke.mqtt;

import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class MqttPublisher {

    private final MqttClient mqttClient;

    // 【核心修改点】读取你在 yml 中新写的 publish-cmd 模板
    @Value("${mqtt.topics.publish-cmd}")
    private String cmdTopicTemplate;

    public MqttPublisher(MqttClient mqttClient) {
        this.mqttClient = mqttClient;
    }

    /**
     * 核心下发方法（供 PM 的规则引擎 或 后端业务逻辑调用）
     * @param deviceId 设备唯一识别码 (例如: SMK-001)
     * @param payload  发送的具体JSON指令内容
     */
    public void sendCommand(String deviceId, String payload) {
        try {
            if (mqttClient == null || !mqttClient.isConnected()) {
                log.error("MQTT未连接，无法下发指令给设备: {}", deviceId);
                return;
            }

            // 【精华逻辑】: 使用 String.format 把模板里的 %s 替换成真实的设备ID
            // 例如 "smoke/%s/cmd" 替换后变为 "smoke/SMK-001/cmd"
            String targetTopic = String.format(cmdTopicTemplate, deviceId);

            MqttMessage message = new MqttMessage(payload.getBytes());
            message.setQos(1); // QoS=1 保证关键指令至少到达一次
            mqttClient.publish(targetTopic, message);

            log.info("成功下发联动广播指令到 Topic [{}], 内容: {}", targetTopic, payload);
        } catch (Exception e) {
            log.error("下发指令失败, 设备: {}", deviceId, e);
        }
    }
}