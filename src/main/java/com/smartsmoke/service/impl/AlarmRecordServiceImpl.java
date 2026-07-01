package com.smartsmoke.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.mapper.AlarmRecordMapper;
import com.smartsmoke.service.AlarmRecordService;
import org.springframework.stereotype.Service;

@Service
public class AlarmRecordServiceImpl extends ServiceImpl<AlarmRecordMapper, AlarmRecord> implements AlarmRecordService {
}