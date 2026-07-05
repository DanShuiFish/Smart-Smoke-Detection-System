package com.smartsmoke.rule;

import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartsmoke.entity.AiReviewRecord;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.entity.AlertThreshold;
import com.smartsmoke.entity.BroadcastRecord;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.mapper.AiReviewRecordMapper;
import com.smartsmoke.mapper.AlertThresholdMapper;
import com.smartsmoke.mapper.BroadcastRecordMapper;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.mqtt.MqttPublisher;
import com.smartsmoke.service.AiService;
import com.smartsmoke.service.AlarmRecordService;
import com.smartsmoke.service.SensorDataService;
import com.smartsmoke.websocket.AlarmWebSocket;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

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
    private MqttPublisher mqttPublisher;

    @Autowired
    private BroadcastRecordMapper broadcastRecordMapper;

    @Autowired
    private DeviceMapper deviceMapper;

    public void processData(SensorData data) {
        sensorDataService.save(data);

        boolean isSmokeDanger = data.getSmokeConcentration().doubleValue() > 0.1;
        boolean isTempDanger = data.getTemperature() != null && data.getTemperature().doubleValue() > 60.0;

        if (isSmokeDanger || isTempDanger) {
            String thresholdType = isSmokeDanger ? "SMOKE_CONCENTRATION" : "TEMPERATURE";
            triggerAlarm(data, thresholdType);
        }
    }

    private void triggerAlarm(SensorData data, String thresholdType) {
        // 1. 查询匹配的阈值，确定告警级别
        LambdaQueryWrapper<AlertThreshold> qw = new LambdaQueryWrapper<>();
        qw.eq(AlertThreshold::getThresholdType, thresholdType)
                .eq(AlertThreshold::getStatus, "ENABLED")
                .le(AlertThreshold::getThresholdMin, data.getSmokeConcentration())
                .ge(AlertThreshold::getThresholdMax, data.getSmokeConcentration())
                .orderByAsc(AlertThreshold::getSortOrder)
                .last("LIMIT 1");
        AlertThreshold matched = alertThresholdMapper.selectOne(qw);

        String alarmLevel = (matched != null) ? matched.getAlarmLevel() : "MEDIUM";
        BigDecimal thresholdVal = (matched != null) ? matched.getThresholdMax() : data.getSmokeConcentration();

        // 2. 生成告警编号 ALG-yyyyMMdd-HHmmss-SSS-类型
        // 使用毫秒时间戳 + 类型后缀确保并发唯一
        String datePart = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String timePart = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HHmmss"));
        String alarmCode = "ALG-" + datePart + "-" + timePart + "-" + thresholdType.substring(0, 2);

        // 3. 创建告警记录
        AlarmRecord record = new AlarmRecord();
        record.setDeviceId(data.getDeviceId());
        record.setSensorDataId(data.getId());
        record.setAlarmCode(alarmCode);
        record.setAlarmType("SMOKE_OVERFLOW");
        record.setAlarmLevel(alarmLevel);
        record.setAlarmStatus("PENDING");
        record.setSmokeConcentration(data.getSmokeConcentration());
        record.setThresholdValue(thresholdVal);
        record.setAlarmTime(LocalDateTime.now());
        alarmRecordService.save(record);

        // 4. 推 WebSocket 到前端大屏
        String wsMsg = JSONUtil.toJsonStr(record);
        AlarmWebSocket.broadcast(wsMsg);

        // 5. 如果级别 >= HIGH，调用 AI 视觉复核
        if ("HIGH".equals(alarmLevel) || "CRITICAL".equals(alarmLevel)) {
            // 查询设备信息（获取硬件编号用于 CameraStrategy + 位置用于疏散广播）
            SmokeDevice device = deviceMapper.selectById(data.getDeviceId());
            String deviceCode = (device != null) ? device.getDeviceId() : "UNKNOWN";
            String cameraId = null;
            try {
                // 尝试从扩展属性中获取关联的摄像头编号
                if (device != null && device.getExtraAttrs() != null) {
                    cameraId = (String) JSONUtil.parseObj(device.getExtraAttrs()).get("cameraId");
                }
            } catch (Exception ignored) { /* extraAttrs 解析失败则忽略 */ }

            // 调用 BE3 的新版视觉复核接口（含 CameraStrategy + SmartJavaAI/Mock）
            AiService.ReviewResult vision = aiService.verifyFireVision(data.getDeviceId(), deviceCode, cameraId);

            // 记录 AI 复核结果
            AiReviewRecord review = new AiReviewRecord();
            review.setAlarmId(record.getId());
            review.setDeviceId(data.getDeviceId());
            review.setImageUrl(vision.imageUrl);
            review.setCameraId(cameraId);
            review.setReviewType("SMOKE_FIRE");
            review.setReviewResult(vision.reviewResult);
            review.setConfidence(BigDecimal.valueOf(vision.confidence));
            review.setAiRawResponse(vision.aiRawResponse);
            review.setProcessingTimeMs(vision.processingTimeMs);
            review.setCreateTime(LocalDateTime.now());
            aiReviewRecordMapper.insert(review);

            record.setIsVisionReviewed(1);
            record.setConfirmMethod("AUTO_VISION");

            if (vision.hasFire) {
                record.setAlarmStatus("CONFIRMED");

                // 6. AI 确认火情：查询设备位置，下发疏散广播
                String building = (device != null && device.getLocationBuilding() != null)
                        ? device.getLocationBuilding() : "未知楼栋";
                String floor = (device != null && device.getLocationFloor() != null)
                        ? device.getLocationFloor() : "未知楼层";
                String broadcastContent = "【火警紧急通知】" + building + floor + "区域检测到火情，请立即按照疏散通道有序撤离！";

                String cmdPayload = String.format(
                    "{\"cmd\":\"evacuate\",\"building\":\"%s\",\"floor\":\"%s\"}",
                    building, floor
                );
                if (device != null) {
                    mqttPublisher.sendCommand(device.getDeviceId(), cmdPayload);
                }

                // 记录广播下发日志
                BroadcastRecord bc = new BroadcastRecord();
                bc.setAlarmId(record.getId());
                bc.setDeviceId(data.getDeviceId());
                bc.setBroadcastArea(building + floor);
                bc.setBroadcastContent(broadcastContent);
                bc.setBroadcastType("EMERGENCY");
                bc.setSendStatus("SENT");
                bc.setSendTime(LocalDateTime.now());
                bc.setTriggerMode("AUTO");
                broadcastRecordMapper.insert(bc);

                record.setIsBroadcastSent(1);
            }
            alarmRecordService.updateById(record);
        }
    }
}
