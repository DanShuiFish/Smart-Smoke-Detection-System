package com.smartsmoke.mqtt;
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
    @Value("${mqtt.broker.default-topic}") private String defaultTopic;
    public MqttConsumer(MqttClient mqttClient) { this.mqttClient = mqttClient; }
    @PostConstruct
    public void subscribe() {
        if (mqttClient == null || !mqttClient.isConnected()) {
            log.warn("MQTT not connected, skip subscribe. Start MQTT broker and restart to enable IoT data ingestion.");
            return;
        }
        try {
            for (String t : defaultTopic.split(",")) {
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
        // TODO: parse JSON, save sensor_data, check threshold, trigger alarm
    }
}