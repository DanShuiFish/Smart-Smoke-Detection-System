package com.smartsmoke.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.smartsmoke.entity.SensorData;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface SensorDataMapper extends BaseMapper<SensorData> {

    @Select("SELECT device_id, MAX(id) AS id, " +
            "AVG(smoke_concentration) AS smoke_concentration, " +
            "AVG(temperature) AS temperature, " +
            "AVG(humidity) AS humidity, " +
            "MAX(unit) AS unit, MAX(is_alert) AS is_alert, MAX(extra_data) AS extra_data, " +
            "FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(collect_time) / #{seconds}) * #{seconds}) AS collect_time, " +
            "MAX(create_time) AS create_time " +
            "FROM sensor_data WHERE device_id = #{deviceId} " +
            "AND collect_time BETWEEN #{start} AND #{end} " +
            "GROUP BY device_id, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(collect_time) / #{seconds}) * #{seconds}) " +
            "ORDER BY collect_time ASC LIMIT #{offset}, #{limit}")
    List<SensorData> getAggregatedHistory(@Param("deviceId") Long deviceId,
            @Param("start") LocalDateTime start, @Param("end") LocalDateTime end,
            @Param("seconds") int seconds, @Param("offset") int offset, @Param("limit") int limit);

    @Select("SELECT COUNT(DISTINCT FLOOR(UNIX_TIMESTAMP(collect_time) / #{seconds})) " +
            "FROM sensor_data WHERE device_id = #{deviceId} " +
            "AND collect_time BETWEEN #{start} AND #{end}")
    long countAggregatedHistory(@Param("deviceId") Long deviceId,
            @Param("start") LocalDateTime start, @Param("end") LocalDateTime end,
            @Param("seconds") int seconds);
}