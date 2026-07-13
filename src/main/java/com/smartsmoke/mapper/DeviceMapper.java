package com.smartsmoke.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.smartsmoke.entity.DeviceStatusStatsVO;
import com.smartsmoke.entity.SmokeDevice;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface DeviceMapper extends BaseMapper<SmokeDevice> {

    @Select("SELECT COUNT(*) AS total, " +
            "SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) AS online, " +
            "SUM(CASE WHEN status = 'OFFLINE' THEN 1 ELSE 0 END) AS offline, " +
            "SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) AS error, " +
            "SUM(CASE WHEN status = 'INACTIVE' THEN 1 ELSE 0 END) AS inactive, " +
            "COALESCE(CAST(AVG(battery) AS SIGNED), 0) AS avgBattery " +
            "FROM smoke_device WHERE is_deleted = 0")
    DeviceStatusStatsVO getDeviceStats();

    /** 获取所有已注册设备的唯一地址（用于注册时下拉选择），已过滤逻辑删除和空地址 */
    @Select("SELECT DISTINCT location_building, location_floor, location_room " +
            "FROM smoke_device " +
            "WHERE is_deleted = 0 " +
            "AND location_building IS NOT NULL AND location_building != '' " +
            "ORDER BY location_building, location_floor, location_room")
    List<SmokeDevice> getDistinctAddresses();
}