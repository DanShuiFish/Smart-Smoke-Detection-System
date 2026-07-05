package com.smartsmoke.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.mapper.SensorDataMapper;
import com.smartsmoke.service.SensorDataService;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class SensorDataServiceImpl extends ServiceImpl<SensorDataMapper, SensorData> implements SensorDataService {

    @Override
    public PageResult<SensorData> getHistory(Long deviceId, LocalDateTime start, LocalDateTime end,
                                              int page, int pageSize, String interval) {
        int seconds = intervalToSeconds(interval);
        if (seconds <= 0) {
            // 无聚合：直接分页查原始数据
            LambdaQueryWrapper<SensorData> qw = new LambdaQueryWrapper<>();
            qw.eq(SensorData::getDeviceId, deviceId)
                    .between(SensorData::getCollectTime, start, end)
                    .orderByAsc(SensorData::getCollectTime);
            return PageResult.of(this.page(new Page<>(page, pageSize), qw));
        }
        // 聚合模式：自定义 SQL
        int offset = (page - 1) * pageSize;
        List<SensorData> records = baseMapper.getAggregatedHistory(
                deviceId, start, end, seconds, offset, pageSize);
        long total = baseMapper.countAggregatedHistory(deviceId, start, end, seconds);

        PageResult<SensorData> result = new PageResult<>();
        result.setPage(page);
        result.setPageSize(pageSize);
        result.setTotal(total);
        result.setPages((total + pageSize - 1) / pageSize);
        result.setRecords(records);
        return result;
    }

    private int intervalToSeconds(String interval) {
        if (interval == null || interval.isEmpty()) return 0;
        switch (interval) {
            case "1m":  return 60;
            case "5m":  return 300;
            case "15m": return 900;
            case "1h":  return 3600;
            case "1d":  return 86400;
            default:    return 0;
        }
    }
}