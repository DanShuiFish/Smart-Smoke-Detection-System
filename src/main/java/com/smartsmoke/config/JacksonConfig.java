package com.smartsmoke.config;

import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import com.smartsmoke.common.DateTimeConst;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDateTime;

/**
 * Jackson 全局时间序列化配置
 * <p>
 * spring.jackson.date-format 只对 java.util.Date 生效，
 * LocalDateTime 必须通过 JavaTimeModule 的序列化器来指定格式。
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer localDateTimeCustomizer() {
        return builder -> {
            builder.serializers(new LocalDateTimeSerializer(DateTimeConst.FMT));
            builder.deserializers(new LocalDateTimeDeserializer(DateTimeConst.FMT));
        };
    }
}
