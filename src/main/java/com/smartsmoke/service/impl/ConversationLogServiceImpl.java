package com.smartsmoke.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.entity.ConversationLog;
import com.smartsmoke.mapper.ConversationLogMapper;
import com.smartsmoke.service.ConversationLogService;
import org.springframework.stereotype.Service;

@Service
public class ConversationLogServiceImpl extends ServiceImpl<ConversationLogMapper, ConversationLog> implements ConversationLogService {
}