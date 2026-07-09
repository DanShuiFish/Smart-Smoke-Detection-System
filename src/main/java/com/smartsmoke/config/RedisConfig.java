package com.smartsmoke.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/**
 * Redis 配置 — BE2 领地
 * 启用 Keyspace Notifications，监听 Key 过期事件用于设备离线判定。
 */
@Slf4j
@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new StringRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(new StringRedisSerializer());
        template.afterPropertiesSet();
        return template;
    }

    /**
     * 注册 Redis 消息监听容器
     * 监听 db0 的过期事件（__keyevent@0__:expired），用于设备离线检测
     */
    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(
            RedisConnectionFactory factory,
            RedisKeyspaceListener listener) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        container.addMessageListener(listener, new PatternTopic("__keyevent@0__:expired"));
        return container;
    }

    @Bean
    public ApplicationRunner redisKeyspaceNotificationInitializer(RedisConnectionFactory factory) {
        return args -> {
            try (var connection = factory.getConnection()) {
                var serverCommands = connection.serverCommands();
                var config = serverCommands.getConfig("notify-keyspace-events");

                String current = null;
                if (config != null && config.containsKey("notify-keyspace-events")) {
                    Object rawValue = config.get("notify-keyspace-events");
                    current = rawValue == null ? null : rawValue.toString();
                }

                if (current != null && current.contains("E") && current.contains("x")) {
                    log.info("Redis keyspace notifications already enabled: {}", current);
                    return;
                }

                String target = mergeNotificationFlags(current, "Ex");
                serverCommands.setConfig("notify-keyspace-events", target);
                log.info("Enabled Redis keyspace notifications: {} -> {}", current, target);
            } catch (Exception e) {
                log.warn("Failed to enable Redis keyspace notifications automatically. Offline detection may not work until notify-keyspace-events includes Ex.", e);
            }
        };
    }

    private static String mergeNotificationFlags(String current, String required) {
        StringBuilder merged = new StringBuilder(current == null ? "" : current);
        for (char flag : required.toCharArray()) {
            if (merged.indexOf(String.valueOf(flag)) < 0) {
                merged.append(flag);
            }
        }
        return merged.toString();
    }
}
