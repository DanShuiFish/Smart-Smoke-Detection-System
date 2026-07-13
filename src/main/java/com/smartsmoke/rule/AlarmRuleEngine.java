package com.smartsmoke.rule;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
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

    /**
     * 处理一条传感器数据：先存库，再检查阈值，最多产生一条告警。
     * 烟雾+温度同时超标 → FIRE_RISK（复合火情），单项超标 → 对应类型。
     * 同一设备 + 同一告警类型已有活跃告警时，不重复创建（去重）。
     */
    public void processData(SensorData data) {
        sensorDataService.save(data);

        // 检查阈值（纯查询，不创建告警）
        AlertThreshold smokeMatch = checkThreshold(data, "SMOKE_CONCENTRATION");
        AlertThreshold tempMatch  = checkThreshold(data, "TEMPERATURE");

        log.info("数据处理: deviceId={} smoke={} temp={} | 烟雾阈值匹配={} 温度阈值匹配={}",
                data.getDeviceId(),
                data.getSmokeConcentration(),
                data.getTemperature(),
                smokeMatch != null ? smokeMatch.getAlarmLevel() + "/" + smokeMatch.getThresholdMax() : "未超标",
                tempMatch != null ? tempMatch.getAlarmLevel() + "/" + tempMatch.getThresholdMax() : "未超标");

        if (smokeMatch != null && tempMatch != null) {
            String level = higherLevel(smokeMatch.getAlarmLevel(), tempMatch.getAlarmLevel());
            if (!hasActiveAlarm(data.getDeviceId(), "FIRE_RISK")) {
                AlarmRecord record = createAlarm(data, "FIRE_RISK", level, smokeMatch.getThresholdMax());
                finishAlarm(record, data);
            } else {
                log.info("告警去重: deviceId={} FIRE_RISK 已有活跃告警，跳过创建", data.getDeviceId());
            }
        } else if (smokeMatch != null) {
            if (!hasActiveAlarm(data.getDeviceId(), "SMOKE_CONCENTRATION")) {
                AlarmRecord record = createAlarm(data, "SMOKE_CONCENTRATION",
                        smokeMatch.getAlarmLevel(), smokeMatch.getThresholdMax());
                finishAlarm(record, data);
            } else {
                log.info("告警去重: deviceId={} SMOKE_CONCENTRATION 已有活跃告警，跳过创建", data.getDeviceId());
            }
        } else if (tempMatch != null) {
            if (!hasActiveAlarm(data.getDeviceId(), "TEMPERATURE")) {
                AlarmRecord record = createAlarm(data, "TEMPERATURE",
                        tempMatch.getAlarmLevel(), tempMatch.getThresholdMax());
                finishAlarm(record, data);
            } else {
                log.info("告警去重: deviceId={} TEMPERATURE 已有活跃告警，跳过创建", data.getDeviceId());
            }
        }
    }

    /**
     * 检查同一设备 + 同一告警类型是否已有活跃告警（PENDING/CONFIRMING/CONFIRMED）。
     * 有则跳过创建，防止每条超标数据都产生新告警。
     */
    private boolean hasActiveAlarm(Long deviceId, String alarmType) {
        Long count = alarmRecordService.lambdaQuery()
                .eq(AlarmRecord::getDeviceId, deviceId)
                .eq(AlarmRecord::getAlarmType, alarmType)
                .in(AlarmRecord::getAlarmStatus, java.util.List.of("PENDING", "CONFIRMING", "CONFIRMED"))
                .count();
        return count != null && count > 0;
    }

    /**
     * 检查阈值，返回匹配的阈值配置；未超标返回 null。无副作用。
     */
    private AlertThreshold checkThreshold(SensorData data, String thresholdType) {
        BigDecimal metricValue = "TEMPERATURE".equals(thresholdType)
                ? data.getTemperature() : data.getSmokeConcentration();
        if (metricValue == null) {
            return null;
        }

        LambdaQueryWrapper<AlertThreshold> query = new LambdaQueryWrapper<>();
        query.eq(AlertThreshold::getThresholdType, thresholdType)
                .eq(AlertThreshold::getStatus, "ENABLED")
                .and(w -> w.eq(AlertThreshold::getDeviceId, data.getDeviceId())
                        .or().isNull(AlertThreshold::getDeviceId))
                .and(w -> w.isNull(AlertThreshold::getThresholdMin)
                        .or().le(AlertThreshold::getThresholdMin, metricValue))
                .le(AlertThreshold::getThresholdMax, metricValue)
                .orderByDesc(AlertThreshold::getDeviceId)
                .orderByAsc(AlertThreshold::getSortOrder)
                .last("LIMIT 1");
        return alertThresholdMapper.selectOne(query);
    }

    /**
     * 创建告警记录并入库，返回已保存的记录。
     */
    private AlarmRecord createAlarm(SensorData data, String thresholdType,
                                     String alarmLevel, BigDecimal thresholdValue) {
        AlarmRecord record = new AlarmRecord();
        record.setDeviceId(data.getDeviceId());
        record.setSensorDataId(data.getId());
        record.setAlarmCode(buildAlarmCode(thresholdType));
        record.setAlarmType(mapAlarmType(thresholdType));
        record.setAlarmLevel(alarmLevel);
        record.setAlarmStatus("PENDING");
        record.setSmokeConcentration(data.getSmokeConcentration());
        record.setThresholdValue(thresholdValue);
        record.setAlarmTime(LocalDateTime.now());
        record.setCreateTime(LocalDateTime.now());
        record.setIsVisionReviewed(0);
        record.setIsBroadcastSent(0);
        alarmRecordService.save(record);

        log.info("告警创建: type={} level={} deviceId={} alarmId={} sensorId={}",
                record.getAlarmType(), record.getAlarmLevel(),
                data.getDeviceId(), record.getId(), data.getId());
        return record;
    }

    /**
     * 告警后续流程：WebSocket 推送 + AI 视觉复核 + 自动广播。
     */
    private void finishAlarm(AlarmRecord record, SensorData data) {
        pushAlarmWebSocket(record, data);
        runAiReviewAndBroadcast(record, data);
    }

    /**
     * 构建带 kind 字段的告警 WebSocket 消息并推送。
     * 管理员全收，居民按地址匹配接收。
     */
    private void pushAlarmWebSocket(AlarmRecord record, SensorData data) {
        try {
            SmokeDevice device = deviceMapper.selectById(data.getDeviceId());
            String deviceCode = device != null ? device.getDeviceId() : "";
            String deviceName = device != null ? device.getDeviceName() : "";

            JSONObject payload = new JSONObject();
            payload.set("kind", "alarm");
            payload.set("action", "created");
            payload.set("id", record.getId());
            payload.set("alarmId", record.getId());
            payload.set("alarmCode", record.getAlarmCode());
            payload.set("alarmType", record.getAlarmType());
            payload.set("alarmTypeText", formatAlarmTypeText(record.getAlarmType()));
            payload.set("alarmLevel", record.getAlarmLevel());
            payload.set("alarmLevelText", formatAlarmLevelText(record.getAlarmLevel()));
            payload.set("alarmStatus", record.getAlarmStatus());
            payload.set("message", buildAlarmMessage(record, device));
            payload.set("alarmTime", record.getAlarmTime() != null ? record.getAlarmTime().toString() : "");
            payload.set("deviceId", deviceCode);
            payload.set("deviceName", deviceName);
            payload.set("building", device != null ? device.getLocationBuilding() : "");
            payload.set("floor", device != null ? device.getLocationFloor() : "");
            payload.set("room", device != null ? device.getLocationRoom() : "");
            payload.set("smokeConcentration", data.getSmokeConcentration());
            payload.set("thresholdValue", record.getThresholdValue());
            payload.set("temperature", data.getTemperature());
            payload.set("ts", System.currentTimeMillis());

            AlarmWebSocket.broadcastByDevice(record.getDeviceId(), payload.toString());
            AlarmWebSocket.broadcastDataChanged(deviceCode);
        } catch (Exception e) {
            log.error("告警 WebSocket 推送失败: {}", e.getMessage(), e);
            try {
                SmokeDevice device = deviceMapper.selectById(data.getDeviceId());
                if (device != null) AlarmWebSocket.broadcastDataChanged(device.getDeviceId());
            } catch (Exception ignored) {}
        }
    }

    private void runAiReviewAndBroadcast(AlarmRecord record, SensorData data) {
        long startTime = System.currentTimeMillis();
        String imagePath = pickTestImage();
        boolean hasFire = aiService.verifyFireVision(imagePath);
        long elapsed = System.currentTimeMillis() - startTime;

        String fileName = "";
        if (imagePath != null && !imagePath.isEmpty()) {
            fileName = new File(imagePath).getName();
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
        alarmRecordService.updateById(record);

        // 仅 AI 确认火情时触发自动广播
        if (hasFire) {
            SmokeDevice device = deviceMapper.selectById(data.getDeviceId());
            broadcastService.tryAutoBroadcast(record, device, "ai_fire_confirmed");
            broadcastService.broadcastAreaByAlarm(record, device);
        }
    }

    // ─── helpers ───

    private String higherLevel(String a, String b) {
        if (a == null) return b != null ? b : "HIGH";
        if (b == null) return a;
        int wa = levelWeight(a), wb = levelWeight(b);
        return wa >= wb ? a : b;
    }

    private int levelWeight(String level) {
        if (level == null) return 0;
        return switch (level.toUpperCase()) {
            case "CRITICAL" -> 4;
            case "HIGH" -> 3;
            case "MEDIUM" -> 2;
            case "LOW" -> 1;
            default -> 0;
        };
    }

    private String mapAlarmType(String thresholdType) {
        if ("TEMPERATURE".equals(thresholdType)) return "TEMP_OVERFLOW";
        if ("FIRE_RISK".equals(thresholdType)) return "FIRE_RISK";
        return "SMOKE_OVERFLOW";
    }

    private String buildAlarmCode(String thresholdType) {
        String datePart = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String timePart = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HHmmssSSS"));
        String suffix = "FIRE_RISK".equals(thresholdType) ? "FR"
                : ("TEMPERATURE".equals(thresholdType) ? "TE" : "SM");
        return "ALG-" + datePart + "-" + timePart + "-" + suffix;
    }

    private String formatAlarmTypeText(String alarmType) {
        if (alarmType == null) return "告警";
        return switch (alarmType) {
            case "SMOKE_OVERFLOW" -> "烟雾超标";
            case "TEMP_OVERFLOW" -> "温度异常";
            case "FIRE_RISK" -> "复合火情";
            case "DEVICE_OFFLINE" -> "设备离线";
            case "DEVICE_ERROR" -> "设备故障";
            default -> alarmType;
        };
    }

    private String formatAlarmLevelText(String level) {
        if (level == null) return "--";
        return switch (level.toUpperCase()) {
            case "LOW" -> "低";
            case "MEDIUM" -> "中";
            case "HIGH" -> "高";
            case "CRITICAL" -> "紧急";
            default -> level;
        };
    }

    private String buildAlarmMessage(AlarmRecord record, SmokeDevice device) {
        String typeText = formatAlarmTypeText(record.getAlarmType());
        String location = device != null
                ? (StrUtil.blankToDefault(device.getLocationBuilding(), "")
                    + StrUtil.blankToDefault(device.getLocationFloor(), ""))
                : "";
        if (record.getSmokeConcentration() != null && record.getThresholdValue() != null) {
            return location + " " + typeText
                    + " 当前 " + record.getSmokeConcentration().stripTrailingZeros().toPlainString()
                    + " / 阈值 " + record.getThresholdValue().stripTrailingZeros().toPlainString() + " mg/m³";
        }
        return location + " " + typeText;
    }

    // ─── AI 测试图片 ───

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
