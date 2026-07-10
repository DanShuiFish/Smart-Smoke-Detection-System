package com.smartsmoke.controller;

import com.smartsmoke.common.Result;
import lombok.RequiredArgsConstructor;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@RestController
@RequestMapping("/api/v1/health")
@RequiredArgsConstructor
public class HealthController {

    private final RedisConnectionFactory redisConnectionFactory;
    // MqttClient may be null if MQTT is not connected at startup
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private MqttClient mqttClient;

    @GetMapping
    public Result<Map<String, Object>> health() {
        boolean redisUp = checkRedis();
        boolean mqttUp = checkMqtt();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", (redisUp && mqttUp) ? "UP" : "DEGRADED");
        data.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));

        Map<String, Object> components = new LinkedHashMap<>();
        components.put("mqtt", mqttUp ? "UP" : "DOWN");
        components.put("redis", redisUp ? "UP" : "DOWN");
        data.put("components", components);

        return Result.success(data);
    }

    private boolean checkRedis() {
        try {
            var conn = redisConnectionFactory.getConnection();
            conn.ping();
            conn.close();
            return true;
        } catch (Exception e) { return false; }
    }

    private boolean checkMqtt() {
        try { return mqttClient != null && mqttClient.isConnected(); }
        catch (Exception e) { return false; }
    }
}
