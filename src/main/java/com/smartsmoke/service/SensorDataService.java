package com.smartsmoke.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.smartsmoke.common.PageResult;
import com.smartsmoke.entity.SensorData;

import java.time.LocalDateTime;

public interface SensorDataService extends IService<SensorData> {

    PageResult<SensorData> getHistory(Long deviceId, LocalDateTime start, LocalDateTime end,
                                      int page, int pageSize, String interval);
}