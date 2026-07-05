package com.smartsmoke.service.impl;

import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.smartsmoke.common.BusinessException;
import com.smartsmoke.dto.ConversationReq;
import com.smartsmoke.dto.ConversationVO;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.entity.ConversationLog;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.AlarmRecordMapper;
import com.smartsmoke.mapper.ConversationLogMapper;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.service.ConversationLogService;
import com.smartsmoke.service.MaxKbService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 智能问答服务实现 — BE3
 * 核心功能：MaxKB 调用、告警上下文注入、优雅降级、数据隔离。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConversationLogServiceImpl
        extends ServiceImpl<ConversationLogMapper, ConversationLog>
        implements ConversationLogService {

    private final MaxKbService maxKbService;
    private final AlarmRecordMapper alarmRecordMapper;
    private final DeviceMapper deviceMapper;
    private final ConversationLogMapper conversationLogMapper;

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Override
    public ConversationVO ask(ConversationReq req, Long userId) {
        // 1. 构建增强问题（智能上下文注入）
        String enhancedQuestion = buildEnhancedQuestion(req);

        // 2. 调用 MaxKB
        MaxKbService.ChatResult result = maxKbService.chat(req.getSessionId(), enhancedQuestion);

        // 3. 持久化对话记录
        ConversationLog conv = new ConversationLog();
        conv.setUserId(userId);
        conv.setAlarmId(req.getAlarmId());
        conv.setSessionId(req.getSessionId());
        conv.setQuestion(req.getQuestion());               // 存原始问题
        conv.setAnswer(result.answer);
        conv.setSourceType(result.sourceType);
        conv.setKnowledgeRefs(JSONUtil.toJsonStr(result.knowledgeRefs));
        conv.setAiProcessingMs(result.processingMs);
        conv.setCreateTime(LocalDateTime.now());
        save(conv);

        // 4. 组装返回 VO
        return ConversationVO.builder()
                .id(conv.getId())
                .sessionId(conv.getSessionId())
                .question(conv.getQuestion())
                .answer(conv.getAnswer())
                .sourceType(conv.getSourceType())
                .knowledgeRefs(result.knowledgeRefs)
                .aiProcessingMs(conv.getAiProcessingMs())
                .createTime(conv.getCreateTime().format(DT_FMT))
                .build();
    }

    @Override
    public IPage<ConversationLog> listHistory(String sessionId, Long userId, Long alarmId, int page, int pageSize) {
        page = Math.max(1, page);
        pageSize = Math.max(1, Math.min(100, pageSize));

        LambdaQueryWrapper<ConversationLog> qw = new LambdaQueryWrapper<>();

        if (sessionId != null && !sessionId.isBlank()) {
            qw.eq(ConversationLog::getSessionId, sessionId);
        }
        if (userId != null) {
            qw.eq(ConversationLog::getUserId, userId);
        }
        if (alarmId != null) {
            qw.eq(ConversationLog::getAlarmId, alarmId);
        }

        qw.orderByDesc(ConversationLog::getCreateTime);

        Page<ConversationLog> pageObj = new Page<>(page, pageSize);
        return conversationLogMapper.selectPage(pageObj, qw);
    }

    @Override
    public void rate(Long id, int rating, Long userId) {
        if (rating < 1 || rating > 5) {
            throw new BusinessException("评分范围为 1~5");
        }

        ConversationLog conv = getById(id);
        if (conv == null) {
            throw BusinessException.notFound("对话记录不存在");
        }
        if (!conv.getUserId().equals(userId)) {
            throw BusinessException.forbidden("只能评价自己的对话");
        }

        ConversationLog update = new ConversationLog();
        update.setId(id);
        update.setUserRating(rating);
        updateById(update);

        log.info("用户 {} 评价对话 {}: {} 分", userId, id, rating);
    }

    // ========== 私有方法 ==========

    /**
     * 智能上下文注入：若前端传了 alarmId，查询告警详情和设备位置，
     * 拼接为系统提示词，帮助 MaxKB 理解上下文，给出精准回答。
     */
    private String buildEnhancedQuestion(ConversationReq req) {
        if (req.getAlarmId() == null) {
            return req.getQuestion();
        }

        try {
            AlarmRecord alarm = alarmRecordMapper.selectById(req.getAlarmId());
            if (alarm == null) {
                return req.getQuestion();
            }

            SmokeDevice device = deviceMapper.selectById(alarm.getDeviceId());
            StringBuilder ctx = new StringBuilder();
            ctx.append("【系统提示：当前正在处理一条告警，请结合知识库内容给出消防处置建议】\n");
            ctx.append("- 告警编号：").append(alarm.getAlarmCode()).append("\n");
            ctx.append("- 告警级别：").append(alarm.getAlarmLevel()).append("\n");
            ctx.append("- 告警状态：").append(alarm.getAlarmStatus()).append("\n");
            ctx.append("- 烟雾浓度：").append(alarm.getSmokeConcentration()).append(" mg/m³\n");

            if (device != null) {
                ctx.append("- 设备位置：")
                        .append(nvl(device.getLocationBuilding(), "未知楼栋")).append(" ")
                        .append(nvl(device.getLocationFloor(), "未知楼层")).append(" ")
                        .append(nvl(device.getLocationRoom(), "")).append("\n");
                ctx.append("- 设备名称：").append(nvl(device.getDeviceName(), device.getDeviceId())).append("\n");
            }

            ctx.append("\n用户问题：").append(req.getQuestion());
            log.info("已注入告警上下文: alarmCode={}, building={}",
                    alarm.getAlarmCode(),
                    device != null ? device.getLocationBuilding() : "null");

            return ctx.toString();

        } catch (Exception e) {
            log.warn("注入告警上下文失败: {}, 使用原始问题", e.getMessage());
            return req.getQuestion();
        }
    }

    private String nvl(String val, String defaultVal) {
        return (val != null && !val.isBlank()) ? val : defaultVal;
    }
}
