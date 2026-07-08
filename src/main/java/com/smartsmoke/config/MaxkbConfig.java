package com.smartsmoke.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "maxkb")
public class MaxkbConfig {
    /** MaxKB 服务基础地址，如 http://192.168.72.129:8080/chat/api */
    private String baseUrl;
    /** MaxKB 智能体 API Key */
    private String apiKey;
    /** MaxKB 应用 ID */
    private String applicationId;
    /** HTTP 请求超时时间，单位毫秒，默认 30000 */
    private int timeout = 30000;
}
