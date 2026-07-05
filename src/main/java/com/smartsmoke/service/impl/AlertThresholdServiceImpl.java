package com.smartsmoke.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.entity.AlertThreshold;
import com.smartsmoke.mapper.AlertThresholdMapper;
import com.smartsmoke.service.AlertThresholdService;
import org.springframework.stereotype.Service;

@Service
public class AlertThresholdServiceImpl extends ServiceImpl<AlertThresholdMapper, AlertThreshold> implements AlertThresholdService {
}
