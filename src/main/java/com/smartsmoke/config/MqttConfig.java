package com.smartsmoke.config;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
@Slf4j
@Configuration
public class MqttConfig {
    @Value("${mqtt.broker.url}") private String brokerUrl;
    @Value("${mqtt.broker.client-id}") private String clientId;
    @Value("${mqtt.broker.username:}") private String username;
    @Value("${mqtt.broker.password:}") private String password;
    @Bean
    public MqttClient mqttClient() {
        try {
            MqttClient client = new MqttClient(brokerUrl, clientId, new MemoryPersistence());
            MqttConnectOptions opts = new MqttConnectOptions();
            opts.setAutomaticReconnect(true);
            opts.setCleanSession(true);
            opts.setConnectionTimeout(10);
            if (username != null && !username.isEmpty()) {
                opts.setUserName(username);
                opts.setPassword(password != null ? password.toCharArray() : new char[0]);
            }
            client.connect(opts);
            log.info("MQTT connected: {}", brokerUrl);
            return client;
        } catch (Exception e) {
            log.warn("MQTT broker not available, skipping. The app will still work. Detail: {}", e.getMessage());
            try {
                return new MqttClient(brokerUrl, clientId + "-standby", new MemoryPersistence());
            } catch (Exception ex) {
                log.warn("Cannot create MqttClient either, returning null");
                return null;
            }
        }
    }
}