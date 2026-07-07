package com.smartsmoke.rule;

import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.File;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Random;

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

    public void processData(SensorData data) {
        sensorDataService.save(data);

        boolean isSmokeDanger = data.getSmokeConcentration() != null && data.getSmokeConcentration().doubleValue() > 0.1;
        boolean isTempDanger = data.getTemperature() != null && data.getTemperature().doubleValue() > 60.0;

        if (isSmokeDanger) {
            triggerAlarm(data, "SMOKE_CONCENTRATION");
        }
        if (isTempDanger) {
            triggerAlarm(data, "TEMPERATURE");
        }
    }

    private void triggerAlarm(SensorData data, String thresholdType) {
        BigDecimal metricValue = currentMetricValue(data, thresholdType);
        if (metricValue == null) {
            return;
        }

        LambdaQueryWrapper<AlertThreshold> query = new LambdaQueryWrapper<>();
        query.eq(AlertThreshold::getThresholdType, thresholdType)
                .eq(AlertThreshold::getStatus, "ENABLED")
                .and(w -> {
                    w.eq(AlertThreshold::getDeviceId, data.getDeviceId()).or().isNull(AlertThreshold::getDeviceId);
                })
                .and(w -> {
                    w.isNull(AlertThreshold::getThresholdMin).or().le(AlertThreshold::getThresholdMin, metricValue);
                })
                .ge(AlertThreshold::getThresholdMax, metricValue)
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
        alarmRecordService.save(record);

        AlarmWebSocket.broadcast(JSONUtil.toJsonStr(record));

        if ("HIGH".equals(alarmLevel) || "CRITICAL".equals(alarmLevel)) {
            runAiReviewAndBroadcast(record, data);
        }
    }

    private void runAiReviewAndBroadcast(AlarmRecord record, SensorData data) {
        String imagePath = pickTestImage();
        boolean hasFire = aiService.verifyFireVision(imagePath);

        AiReviewRecord review = new AiReviewRecord();
        review.setAlarmId(record.getId());
        review.setDeviceId(data.getDeviceId());
        review.setReviewType("SMOKE_FIRE");
        review.setReviewResult(hasFire ? "FIRE_CONFIRMED" : "NO_FIRE");
        review.setConfidence(hasFire ? BigDecimal.valueOf(85.00) : BigDecimal.ZERO);
        review.setCreateTime(LocalDateTime.now());
        aiReviewRecordMapper.insert(review);

        record.setIsVisionReviewed(1);
        record.setConfirmMethod("AUTO_VISION");
        record.setAlarmStatus(hasFire ? "CONFIRMED" : "CONFIRMING");
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
        return "SMOKE_OVERFLOW";
    }

    private String buildAlarmCode(String thresholdType) {
        String datePart = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String timePart = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HHmmssSSS"));
        String suffix = "SMOKE_CONCENTRATION".equals(thresholdType) ? "SM" : "TE";
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
