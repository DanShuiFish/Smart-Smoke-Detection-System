package com.smartsmoke.mapper;

import com.smartsmoke.entity.AlarmTrendVO;
import com.smartsmoke.entity.DeviceLocationStatsVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface DashboardMapper {

    @Select("SELECT DATE(alarm_time) AS date, COUNT(*) AS total, " +
            "SUM(CASE WHEN alarm_type = 'SMOKE_OVERFLOW' THEN 1 ELSE 0 END) AS smokeOverflow, " +
            "SUM(CASE WHEN alarm_type = 'DEVICE_OFFLINE' THEN 1 ELSE 0 END) AS deviceOffline " +
            "FROM alarm_record WHERE alarm_time >= DATE_SUB(CURDATE(), INTERVAL #{period} DAY) " +
            "AND is_deleted = 0 GROUP BY DATE(alarm_time) ORDER BY date ASC")
    List<AlarmTrendVO> getAlarmTrend(int period);

    @Select("SELECT location_building AS building, COUNT(*) AS total, " +
            "SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) AS online, " +
            "SUM(CASE WHEN status = 'OFFLINE' THEN 1 ELSE 0 END) AS offline " +
            "FROM smoke_device WHERE is_deleted = 0 " +
            "GROUP BY location_building ORDER BY building ASC")
    List<DeviceLocationStatsVO> getDeviceLocationStats();
}
