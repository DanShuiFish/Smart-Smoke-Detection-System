package com.smartsmoke.mqtt;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.springframework.stereotype.Component;
@Slf4j
@Component
@RequiredArgsConstructor
public class MqttPublisher {
    private final MqttClient mqttClient;
    public boolean publish(String topic, String payload) {
        try {
            MqttMessage msg = new MqttMessage(payload.getBytes()); msg.setQos(1);
            mqttClient.publish(topic, msg);
            log.info("MQTT published [{}]: {}", topic, payload);
            return true;
        } catch (Exception e) {
            log.error("MQTT publish failed: {}", e.getMessage());
            return false;
        }
    }
}