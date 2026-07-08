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

    @Value("${mqtt.topics.publish-cmd:smoke/%s/cmd}")
    private String cmdTopicTemplate;

    public MqttPublisher(MqttClient mqttClient) {
        this.mqttClient = mqttClient;
    }

    public boolean sendCommand(String deviceId, String payload) {
        try {
            if (mqttClient == null || !mqttClient.isConnected()) {
                log.error("MQTT not connected, cannot publish command to device {}", deviceId);
                return false;
            }

            String targetTopic = String.format(cmdTopicTemplate, deviceId);
            MqttMessage message = new MqttMessage(payload.getBytes());
            message.setQos(1);
            mqttClient.publish(targetTopic, message);

            log.info("Published broadcast command to topic [{}], payload: {}", targetTopic, payload);
            return true;
        } catch (Exception e) {
            log.error("Failed to publish command, device={}", deviceId, e);
            return false;
        }
    }
}
