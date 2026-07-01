package com.smartsmoke.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.mapper.SensorDataMapper;
import com.smartsmoke.service.SensorDataService;
import org.springframework.stereotype.Service;

@Service
public class SensorDataServiceImpl extends ServiceImpl<SensorDataMapper, SensorData> implements SensorDataService {
}