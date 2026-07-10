package com.smartsmoke.rule;

import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartsmoke.entity.AiReviewRecord;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.entity.AlertThreshold;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.AiReviewRecordMapper;
import com.smartsmoke.mapper.AlertThresholdMapper;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.service.AiService;
import com.smartsmoke.service.AlarmRecordService;
import com.smartsmoke.service.BroadcastService;
import com.smartsmoke.service.SensorDataService;
import com.smartsmoke.websocket.AlarmWebSocket;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.File;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Random;

@Slf4j
@Component
public class AlarmRuleEngine {

    @Autowired
    private SensorDataService sensorDataService;

    @Autowired
    private AlarmRecordService alarmRecordService;

    @Autowired
    private AlertThresholdMapper alertThresholdMapper;

    @Autowired
    private AiService aiService;

    @Autowired
    private AiReviewRecordMapper aiReviewRecordMapper;

    @Autowired
    private BroadcastService broadcastService;

    @Autowired
    private DeviceMapper deviceMapper;

    @Autowired
    private ObjectMapper objectMapper;  // Spring 管理的 Jackson ObjectMapper（含 JavaTimeModule + JacksonConfig）

    public void processData(SensorData data) {
        sensorDataService.save(data);

        boolean isSmokeDanger = data.getSmokeConcentration() != null && data.getSmokeConcentration().doubleValue() > 0.1;
        boolean isTempDanger = data.getTemperature() != null && data.getTemperature().doubleValue() > 60.0;

        // 烟雾+温度同时超标 → 合并为一条复合火情告警
        if (isSmokeDanger && isTempDanger) {
            triggerAlarm(data, "FIRE_RISK");
        } else {
            if (isSmokeDanger) {
                triggerAlarm(data, "SMOKE_CONCENTRATION");
            }
            if (isTempDanger) {
                triggerAlarm(data, "TEMPERATURE");
            }
        }
    }

    private void triggerAlarm(SensorData data, String thresholdType) {
        BigDecimal metricValue = currentMetricValue(data, thresholdType);
        if (metricValue == null) {
            return;
        }

        // FIRE_RISK 是烟雾+温度复合告警，阈值匹配用 SMOKE_CONCENTRATION
        String lookupType = "FIRE_RISK".equals(thresholdType) ? "SMOKE_CONCENTRATION" : thresholdType;

        LambdaQueryWrapper<AlertThreshold> query = new LambdaQueryWrapper<>();
        query.eq(AlertThreshold::getThresholdType, lookupType)
                .eq(AlertThreshold::getStatus, "ENABLED")
                .and(w -> {
                    w.eq(AlertThreshold::getDeviceId, data.getDeviceId()).or().isNull(AlertThreshold::getDeviceId);
                })
                .and(w -> {
                    w.isNull(AlertThreshold::getThresholdMin).or().le(AlertThreshold::getThresholdMin, metricValue);
                })
                .le(AlertThreshold::getThresholdMax, metricValue)  // thresholdMax <= metricValue 即超标
                .orderByDesc(AlertThreshold::getDeviceId)
                .orderByAsc(AlertThreshold::getSortOrder)
                .last("LIMIT 1");
        AlertThreshold matched = alertThresholdMapper.selectOne(query);

        String alarmLevel = matched != null ? matched.getAlarmLevel() : "MEDIUM";
        BigDecimal thresholdVal = matched != null ? matched.getThresholdMax() : metricValue;

        AlarmRecord record = new AlarmRecord();
        record.setDeviceId(data.getDeviceId());
        record.setSensorDataId(data.getId());
        record.setAlarmCode(buildAlarmCode(thresholdType));
        record.setAlarmType(mapAlarmType(thresholdType));
        record.setAlarmLevel(alarmLevel);
        record.setAlarmStatus("PENDING");
        record.setSmokeConcentration(data.getSmokeConcentration());
        record.setThresholdValue(thresholdVal);
        record.setAlarmTime(LocalDateTime.now());
        record.setCreateTime(LocalDateTime.now());  // WebSocket广播前填充，避免推送null
        alarmRecordService.save(record);

        try {
            String msg = objectMapper.writeValueAsString(record);
            AlarmWebSocket.broadcastByDevice(record.getDeviceId(), msg);
        } catch (Exception e) {
            log.error("WebSocket 广播序列化失败: {}", e.getMessage());
            AlarmWebSocket.broadcastByDevice(record.getDeviceId(), JSONUtil.toJsonStr(record));
        }

        // 所有告警均触发 AI 视觉复核
        runAiReviewAndBroadcast(record, data);
    }

    private void runAiReviewAndBroadcast(AlarmRecord record, SensorData data) {
        long startTime = System.currentTimeMillis();
        String imagePath = pickTestImage();
        boolean hasFire = aiService.verifyFireVision(imagePath);
        long elapsed = System.currentTimeMillis() - startTime;

        // 提取文件名（不含路径），用于前端展示
        String fileName = "";
        if (imagePath != null && !imagePath.isEmpty()) {
            File imgFile = new File(imagePath);
            fileName = imgFile.getName();
        }

        AiReviewRecord review = new AiReviewRecord();
        review.setAlarmId(record.getId());
        review.setDeviceId(data.getDeviceId());
        review.setReviewType("SMOKE_FIRE");
        review.setReviewResult(hasFire ? "FIRE_CONFIRMED" : "NO_FIRE");
        review.setConfidence(hasFire ? BigDecimal.valueOf(85.00) : BigDecimal.ZERO);
        review.setImageUrl(fileName);
        review.setProcessingTimeMs((int) elapsed);
        review.setAiRawResponse(JSONUtil.toJsonStr(
                java.util.Map.of("model", "YOLOv8n-ONNX",
                        "fireDetected", hasFire,
                        "processingTimeMs", elapsed,
                        "imageFile", fileName)));
        review.setCreateTime(LocalDateTime.now());
        aiReviewRecordMapper.insert(review);

        record.setIsVisionReviewed(1);
        // AI复核不改变告警状态，仅提供参考证据。管理员手动确认后才改状态。
        // 自动广播仍然在 AI 确认火情时触发
        alarmRecordService.updateById(record);

        if (hasFire) {
            SmokeDevice device = deviceMapper.selectById(data.getDeviceId());
            broadcastService.tryAutoBroadcast(record, device, "ai_fire_confirmed");
        }
    }

    private BigDecimal currentMetricValue(SensorData data, String thresholdType) {
        if ("TEMPERATURE".equals(thresholdType)) {
            return data.getTemperature();
        }
        return data.getSmokeConcentration();
    }

    private String mapAlarmType(String thresholdType) {
        if ("TEMPERATURE".equals(thresholdType)) {
            return "TEMP_OVERFLOW";
        }
        if ("FIRE_RISK".equals(thresholdType)) {
            return "FIRE_RISK";
        }
        return "SMOKE_OVERFLOW";
    }

    private String buildAlarmCode(String thresholdType) {
        String datePart = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String timePart = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HHmmssSSS"));
        String suffix = "FIRE_RISK".equals(thresholdType) ? "FR" : ("TEMPERATURE".equals(thresholdType) ? "TE" : "SM");
        return "ALG-" + datePart + "-" + timePart + "-" + suffix;
    }

    private static final String TEST_IMAGE_DIR = "./smart-smoke-models/test-images";
    private static final Random RAND = new Random();

    private String pickTestImage() {
        File dir = new File(TEST_IMAGE_DIR);
        if (dir.exists() && dir.isDirectory()) {
            File[] files = dir.listFiles((d, name) -> name.endsWith(".jpg") || name.endsWith(".png"));
            if (files != null && files.length > 0) {
                return files[RAND.nextInt(files.length)].getAbsolutePath();
            }
        }
        return "";
    }
}
