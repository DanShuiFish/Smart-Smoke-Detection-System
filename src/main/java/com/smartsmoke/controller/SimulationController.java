package com.smartsmoke.controller;

import com.smartsmoke.common.Result;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.entity.AlertThreshold;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.mapper.AlertThresholdMapper;
import com.smartsmoke.rule.AlarmRuleEngine;
import com.smartsmoke.service.AlarmRecordService;
import com.smartsmoke.websocket.AlarmWebSocket;
import com.smartsmoke.mqtt.MqttConsumer;
import cn.hutool.json.JSONUtil;
import org.springframework.data.redis.core.StringRedisTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * 设备模拟器 API — 接真实硬件后直接删除此文件即可。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/simulation")
@RequiredArgsConstructor
public class SimulationController {

    private final AlarmRuleEngine alarmRuleEngine;
    private final DeviceMapper deviceMapper;
    private final AlarmRecordService alarmRecordService;
    private final StringRedisTemplate stringRedisTemplate;
    private final MqttConsumer mqttConsumer;
    private final AlertThresholdMapper alertThresholdMapper;

    // ===== 模拟设备离线 =====
    @PostMapping("/offline")
    public Result<Map<String, Object>> offline(@RequestBody Map<String, Object> body) {
        String code = str(body, "deviceCode");
        if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");

        SmokeDevice dev = resolveDevice(code);
        // 更新设备状态为 OFFLINE
        SmokeDevice upd = new SmokeDevice();
        upd.setId(dev.getId());
        upd.setStatus("OFFLINE");
        upd.setLastOfflineTime(LocalDateTime.now());
        deviceMapper.updateById(upd);

        // 创建离线告警
        AlarmRecord record = new AlarmRecord();
        record.setDeviceId(dev.getId());
        record.setAlarmType("DEVICE_OFFLINE");
        record.setAlarmLevel("HIGH");
        record.setAlarmStatus("PENDING");
        record.setAlarmTime(LocalDateTime.now());
        record.setAlarmCode("ALG-SIM-OFF-" + code + "-" + System.currentTimeMillis());
        record.setIsVisionReviewed(0);
        record.setIsBroadcastSent(0);
        record.setRemark(code + " 模拟离线 @ " + dev.getLocationBuilding() + dev.getLocationFloor() + dev.getLocationRoom());
        record.setCreateTime(LocalDateTime.now());
        alarmRecordService.save(record);

        // WebSocket 推送
        Map<String, Object> wsPayload = new HashMap<>();
        wsPayload.put("kind", "alarm");
        wsPayload.put("action", "updated");
        wsPayload.put("id", record.getId());
        wsPayload.put("alarmType", "DEVICE_OFFLINE");
        wsPayload.put("alarmTypeText", "设备离线");
        wsPayload.put("alarmLevel", "HIGH");
        wsPayload.put("alarmLevelText", "高");
        wsPayload.put("alarmStatus", "PENDING");
        wsPayload.put("message", record.getRemark());
        wsPayload.put("deviceId", dev.getDeviceId());
        wsPayload.put("deviceName", dev.getDeviceName());
        wsPayload.put("building", dev.getLocationBuilding());
        wsPayload.put("floor", dev.getLocationFloor());
        wsPayload.put("room", dev.getLocationRoom());
        AlarmWebSocket.broadcastByDevice(dev.getId(), JSONUtil.toJsonStr(wsPayload));

        log.info("模拟离线: {}", code);
        notifyDataChanged(code, "device_offline");
        return Result.success(Map.of("deviceCode", code, "offline", true, "alarmId", record.getId()));
    }

    // ===== 模拟设备恢复上线 =====
    @PostMapping("/online")
    public Result<Map<String, Object>> online(@RequestBody Map<String, Object> body) {
        String code = str(body, "deviceCode");
        if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");

        SmokeDevice dev = resolveDevice(code);
        // 更新设备状态为 ONLINE
        SmokeDevice upd = new SmokeDevice();
        upd.setId(dev.getId());
        upd.setStatus("ONLINE");
        upd.setLastOnlineTime(LocalDateTime.now());
        deviceMapper.updateById(upd);

        // 关闭该设备活跃的离线告警
        List<AlarmRecord> active = alarmRecordService.lambdaQuery()
                .eq(AlarmRecord::getDeviceId, dev.getId())
                .eq(AlarmRecord::getAlarmType, "DEVICE_OFFLINE")
                .in(AlarmRecord::getAlarmStatus, List.of("PENDING", "CONFIRMING", "CONFIRMED"))
                .list();
        for (AlarmRecord a : active) {
            a.setAlarmStatus("CLOSED");
            a.setRemark("模拟恢复在线，自动关闭");
            alarmRecordService.updateById(a);
        }

        // WebSocket 推送上线通知
        Map<String, Object> wsPayload = new HashMap<>();
        wsPayload.put("kind", "device_online");
        wsPayload.put("deviceId", dev.getDeviceId());
        wsPayload.put("deviceName", dev.getDeviceName());
        wsPayload.put("building", dev.getLocationBuilding());
        wsPayload.put("floor", dev.getLocationFloor());
        AlarmWebSocket.broadcastByDevice(dev.getId(), JSONUtil.toJsonStr(wsPayload));

        log.info("模拟恢复在线: {}", code);
        notifyDataChanged(code, "device_online");
        return Result.success(Map.of("deviceCode", code, "online", true, "closedAlarms", active.size()));
    }

    /** 单设备发送 */
    @PostMapping("/send")
    public Result<Map<String, Object>> send(@RequestBody Map<String, Object> body) {
        String code = str(body, "deviceCode");
        double smoke = dbl(body, "smoke", 0.05);
        double temp  = dbl(body, "temp", 25.0);
        double humi  = dbl(body, "humi", 50.0);
        if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");

        SmokeDevice dev = resolveDevice(code);
        SensorData sd = buildSensorData(dev.getId(), smoke, temp, humi);
        alarmRuleEngine.processData(sd);

        Map<String, Object> r = new HashMap<>();
        r.put("deviceCode", code);
        r.put("deviceId", dev.getId());
        r.put("smoke", smoke);
        r.put("temp", temp);
        r.put("sent", true);
        log.info("模拟数据: {} smoke={} temp={}", code, smoke, temp);
        notifyDataChanged(code, "sensor_data");
        return Result.success(r);
    }

    /** 批量发送 */
    @PostMapping("/batch")
    public Result<List<Map<String, Object>>> batch(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> devices = (List<Map<String, Object>>) body.getOrDefault("devices", List.of());
        List<Map<String, Object>> results = new ArrayList<>();
        double smoke = dbl(body, "smoke", 0.35);
        double temp  = dbl(body, "temp", 68.0);
        double humi  = dbl(body, "humi", 50.0);

        for (Map<String, Object> d : devices) {
            String code = str(d, "deviceCode");
            if (code == null || code.isEmpty()) continue;
            double s = dbl(d, "smoke", smoke);
            double t = dbl(d, "temp", temp);
            SmokeDevice dev = resolveDevice(code);
            SensorData sd = buildSensorData(dev.getId(), s, t, humi);
            alarmRuleEngine.processData(sd);
            results.add(Map.of("deviceCode", code, "smoke", s, "temp", t, "ok", true));
            log.info("批量模拟: {} smoke={} temp={}", code, s, t);
        }
        return Result.success(results);
    }

    /** 列出可模拟的设备 */
    @GetMapping("/devices")
    public Result<List<Map<String, Object>>> devices() {
        List<SmokeDevice> list = deviceMapper.selectList(null);
        List<Map<String, Object>> r = new ArrayList<>();
        for (SmokeDevice d : list) {
            r.add(Map.of("id", d.getId(), "deviceCode", d.getDeviceId(),
                    "name", d.getDeviceName() != null ? d.getDeviceName() : d.getDeviceId(),
                    "status", d.getStatus() != null ? d.getStatus() : "OFFLINE",
                    "building", d.getLocationBuilding() != null ? d.getLocationBuilding() : "",
                    "floor", d.getLocationFloor() != null ? d.getLocationFloor() : ""));
        }
        return Result.success(r);
    }

    // ===== 模拟器心跳 =====
    @PostMapping("/heartbeat")
    public Result<Map<String, Object>> heartbeat(@RequestBody Map<String, Object> body) {
        String code = str(body, "deviceCode");
        int bat = (int) dbl(body, "bat", 90);
        int rssi = (int) dbl(body, "rssi", -40);
        if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");

        SmokeDevice dev = resolveDevice(code);
        // 更新设备状态为 ONLINE
        SmokeDevice upd = new SmokeDevice();
        upd.setId(dev.getId());
        upd.setStatus("ONLINE");
        upd.setLastOnlineTime(LocalDateTime.now());
        upd.setLastHeartbeat(LocalDateTime.now());
        upd.setBattery(bat);
        upd.setSignalStrength(rssi);
        deviceMapper.updateById(upd);

        // 写入 Redis 心跳 Key（TTL 最小值 15s，演示用）
        int ttl = dev.getHeartbeatTimeout() != null ? dev.getHeartbeatTimeout() : 15;
        stringRedisTemplate.opsForValue().set(
                "device:heartbeat:" + code,
                String.valueOf(System.currentTimeMillis()),
                ttl,
                TimeUnit.SECONDS
        );
        log.debug("Redis heartbeat key refreshed: {} TTL={}s", code, ttl);

        // 关闭该设备的离线告警
        closeOfflineAlarms(dev.getId());

        // WebSocket 通知
        notifyDataChanged(code, "heartbeat");

        Map<String, Object> r = new HashMap<>();
        r.put("deviceCode", code);
        r.put("online", true);
        r.put("heartbeat", true);
        return Result.success(r);
    }

    @PostMapping("/heartbeat/start")
    public Result<Map<String, Object>> startHeartbeat(@RequestBody Map<String, Object> body) {
        String code = str(body, "deviceCode");
        if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");
        // 恢复上线
        SmokeDevice dev = resolveDevice(code);
        SmokeDevice upd = new SmokeDevice();
        upd.setId(dev.getId());
        upd.setStatus("ONLINE");
        upd.setLastOnlineTime(LocalDateTime.now());
        deviceMapper.updateById(upd);

        // 立即设置 Redis 心跳 Key（TTL 最小值 15s，演示用）
        int ttl = dev.getHeartbeatTimeout() != null ? dev.getHeartbeatTimeout() : 15;
        stringRedisTemplate.opsForValue().set(
                "device:heartbeat:" + code,
                String.valueOf(System.currentTimeMillis()),
                ttl,
                TimeUnit.SECONDS
        );

        notifyDataChanged(code, "heartbeat_start");
        // 推送 device_online 通知给所有客户端
        AlarmWebSocket.broadcastDeviceOnline(code, dev.getDeviceName());
        log.info("模拟器心跳启动: {}", code);
        return Result.success(Map.of("deviceCode", code, "status", "ONLINE", "offlineAfterSeconds", ttl));
    }

    @PostMapping("/heartbeat/stop")
    public Result<Map<String, Object>> stopHeartbeat(@RequestBody Map<String, Object> body) {
        String code = str(body, "deviceCode");
        if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");

        SmokeDevice dev = resolveDevice(code);
        // 不立即标离线：保留 Redis 心跳 Key，让其自然过期后由 RedisKeyspaceListener 触发离线判定
        // 设备在 Redis Key 过期前仍保持 ONLINE 状态
        int ttl = dev.getHeartbeatTimeout() != null ? dev.getHeartbeatTimeout() : 15;
        log.info("模拟器心跳停止: {}, 设备将在 Redis Key 过期后（约 {}s）自动判定离线", code, ttl);

        notifyDataChanged(code, "heartbeat_stop");
        return Result.success(Map.of("deviceCode", code, "status", "ONLINE",
                "offlineAfterSeconds", ttl, "message", "设备将在 " + ttl + "s 后自动判定离线"));
    }

    @GetMapping("/heartbeat/ttl")
    public Result<Map<String, Object>> heartbeatTtl(@RequestParam String deviceCode) {
        String key = "device:heartbeat:" + deviceCode;
        Long ttl = stringRedisTemplate.getExpire(key, TimeUnit.SECONDS);
        if (ttl == null || ttl <= 0) {
            return Result.success(Map.of("deviceCode", deviceCode, "ttl", 0,
                    "message", "心跳Key已过期或不存在，设备已离线或未启动仿真"));
        }
        return Result.success(Map.of("deviceCode", deviceCode, "ttl", ttl,
                "message", "剩余 " + ttl + "s"));
    }

    @GetMapping("/heartbeat/status")
    public Result<Map<String, Object>> heartbeatStatus(@RequestParam(defaultValue = "") String deviceCode) {
        if (deviceCode.isEmpty()) {
            // 返回所有设备状态（直接从 DB 读取，这是唯一权威源）
            Map<String, String> deviceStatus = new LinkedHashMap<>();
            List<SmokeDevice> devices = deviceMapper.selectList(null);
            for (SmokeDevice d : devices) {
                deviceStatus.put(d.getDeviceId(), d.getStatus() != null ? d.getStatus() : "OFFLINE");
            }
            return Result.success(Map.of("deviceStatus", deviceStatus));
        }
        SmokeDevice dev = deviceMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SmokeDevice>()
                        .eq(SmokeDevice::getDeviceId, deviceCode));
        String status = (dev != null && dev.getStatus() != null) ? dev.getStatus() : "OFFLINE";
        return Result.success(Map.of("deviceCode", deviceCode, "status", status));
    }

    // ===== 阈值配置（供前端和模拟器使用） =====
    @GetMapping("/device/threshold")
    public Result<Map<String, Object>> getDeviceThreshold(@RequestParam String deviceCode) {
        // 查找设备的个性化阈值或全局阈值
        SmokeDevice dev = deviceMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SmokeDevice>()
                        .eq(SmokeDevice::getDeviceId, deviceCode));
        if (dev == null) return Result.error(404, "设备不存在");

        Map<String, Object> result = new HashMap<>();
        result.put("deviceCode", deviceCode);

        // 查询烟雾 HIGH 阈值
        AlertThreshold smokeHigh = findThreshold(dev.getId(), "SMOKE_CONCENTRATION", "HIGH");
        result.put("smokeHigh", smokeHigh != null ? smokeHigh.getThresholdMax() : BigDecimal.valueOf(0.30));
        // 查询烟雾 MEDIUM 阈值
        AlertThreshold smokeMed = findThreshold(dev.getId(), "SMOKE_CONCENTRATION", "MEDIUM");
        result.put("smokeMedium", smokeMed != null ? smokeMed.getThresholdMax() : BigDecimal.valueOf(0.15));
        // 查询温度 HIGH 阈值
        AlertThreshold tempHigh = findThreshold(dev.getId(), "TEMPERATURE", "HIGH");
        result.put("tempHigh", tempHigh != null ? tempHigh.getThresholdMax() : BigDecimal.valueOf(65));

        return Result.success(result);
    }

    @PostMapping("/device/threshold")
    public Result<Map<String, Object>> saveDeviceThreshold(@RequestBody Map<String, Object> body) {
        String code = str(body, "deviceCode");
        if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");

        SmokeDevice dev = resolveDevice(code);
        double smokeHigh = dbl(body, "smokeHigh", 0.30);
        double smokeMedium = dbl(body, "smokeMedium", 0.15);
        double tempHigh = dbl(body, "tempHigh", 65);

        // UPSERT 烟雾 HIGH
        upsertThreshold(dev.getId(), "SMOKE_CONCENTRATION", "HIGH", BigDecimal.valueOf(smokeHigh));
        // UPSERT 烟雾 MEDIUM
        upsertThreshold(dev.getId(), "SMOKE_CONCENTRATION", "MEDIUM", BigDecimal.valueOf(smokeMedium));
        // UPSERT 温度 HIGH
        upsertThreshold(dev.getId(), "TEMPERATURE", "HIGH", BigDecimal.valueOf(tempHigh));

        // WebSocket 通知阈值变更
        AlarmWebSocket.broadcastDeviceConfigChanged(code, "threshold");
        notifyDataChanged(code, "threshold_update");

        log.info("阈值已更新: {} smokeH={} smokeM={} tempH={}", code, smokeHigh, smokeMedium, tempHigh);
        return Result.success(Map.of("deviceCode", code, "saved", true));
    }

    private AlertThreshold findThreshold(Long deviceDbId, String type, String level) {
        var list = alertThresholdMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AlertThreshold>()
                        .eq(AlertThreshold::getDeviceId, deviceDbId)
                        .eq(AlertThreshold::getThresholdType, type)
                        .eq(AlertThreshold::getAlarmLevel, level)
                        .eq(AlertThreshold::getStatus, "ENABLED")
                        .orderByAsc(AlertThreshold::getSortOrder)
                        .last("LIMIT 1"));
        // 如果设备级阈值不存在，查全局阈值
        if (list.isEmpty()) {
            list = alertThresholdMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AlertThreshold>()
                            .isNull(AlertThreshold::getDeviceId)
                            .eq(AlertThreshold::getThresholdType, type)
                            .eq(AlertThreshold::getAlarmLevel, level)
                            .eq(AlertThreshold::getStatus, "ENABLED")
                            .orderByAsc(AlertThreshold::getSortOrder)
                            .last("LIMIT 1"));
        }
        return list.isEmpty() ? null : list.get(0);
    }

    private void upsertThreshold(Long deviceDbId, String type, String level, BigDecimal maxVal) {
        var existing = alertThresholdMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AlertThreshold>()
                        .eq(AlertThreshold::getDeviceId, deviceDbId)
                        .eq(AlertThreshold::getThresholdType, type)
                        .eq(AlertThreshold::getAlarmLevel, level)
                        .last("LIMIT 1"));
        if (!existing.isEmpty()) {
            AlertThreshold t = existing.get(0);
            t.setThresholdMax(maxVal);
            alertThresholdMapper.updateById(t);
        } else {
            AlertThreshold t = new AlertThreshold();
            t.setDeviceId(deviceDbId);
            t.setThresholdType(type);
            t.setAlarmLevel(level);
            t.setThresholdMin(BigDecimal.ZERO);
            t.setThresholdMax(maxVal);
            t.setStatus("ENABLED");
            t.setSortOrder(1);
            t.setIsDefault(0);
            alertThresholdMapper.insert(t);
        }
    }

    @GetMapping("/status")
    public Result<List<Map<String, Object>>> status() {
        List<SmokeDevice> list = deviceMapper.selectList(null);
        List<Map<String, Object>> r = new ArrayList<>();
        for (SmokeDevice d : list) {
            Map<String, Object> entry = new HashMap<>();
            entry.put("id", d.getId());
            entry.put("deviceCode", d.getDeviceId());
            entry.put("name", d.getDeviceName() != null ? d.getDeviceName() : d.getDeviceId());
            entry.put("status", d.getStatus() != null ? d.getStatus() : "OFFLINE");
            entry.put("building", d.getLocationBuilding() != null ? d.getLocationBuilding() : "");
            entry.put("floor", d.getLocationFloor() != null ? d.getLocationFloor() : "");
            entry.put("room", d.getLocationRoom() != null ? d.getLocationRoom() : "");
            entry.put("battery", d.getBattery() != null ? d.getBattery() : 0);
            entry.put("signalStrength", d.getSignalStrength() != null ? d.getSignalStrength() : 0);
            entry.put("heartbeatTimeout", d.getHeartbeatTimeout() != null ? d.getHeartbeatTimeout() : 30);
            entry.put("lastHeartbeat", d.getLastHeartbeat() != null ? d.getLastHeartbeat().toString() : null);
            // 从 DB 读取真实状态（唯一权威源）
            entry.put("heartbeatActive", "ONLINE".equals(d.getStatus()));
            r.add(entry);
        }
        return Result.success(r);
    }

    // ===== helpers =====
    private SmokeDevice resolveDevice(String code) {
        SmokeDevice d = deviceMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SmokeDevice>()
                        .eq(SmokeDevice::getDeviceId, code));
        if (d != null) return d;
        // 自动注册
        d = new SmokeDevice();
        d.setDeviceId(code); d.setDeviceName(code); d.setStatus("ONLINE");
        d.setBattery(100); d.setSignalStrength(90); d.setHeartbeatTimeout(30);
        d.setSortOrder(999);
        deviceMapper.insert(d);
        log.info("自动注册新设备: {}", code);
        return d;
    }

    private SensorData buildSensorData(Long deviceId, double smoke, double temp, double humi) {
        SensorData sd = new SensorData();
        sd.setDeviceId(deviceId);
        sd.setSmokeConcentration(BigDecimal.valueOf(smoke));
        sd.setTemperature(BigDecimal.valueOf(temp));
        sd.setHumidity(BigDecimal.valueOf(humi));
        sd.setUnit("mg/m3");
        sd.setCollectTime(LocalDateTime.now());
        return sd;
    }

    private String str(Map<String, Object> m, String k) {
        Object v = m.get(k); return v != null ? v.toString() : null;
    }
    private double dbl(Map<String, Object> m, String k, double def) {
        try { Object v = m.get(k); return v != null ? Double.parseDouble(v.toString()) : def; }
        catch (NumberFormatException e) { return def; }
    }

    private void closeOfflineAlarms(Long deviceId) {
        List<AlarmRecord> active = alarmRecordService.lambdaQuery()
                .eq(AlarmRecord::getDeviceId, deviceId)
                .eq(AlarmRecord::getAlarmType, "DEVICE_OFFLINE")
                .in(AlarmRecord::getAlarmStatus, List.of("PENDING", "CONFIRMING", "CONFIRMED"))
                .list();
        for (AlarmRecord a : active) {
            a.setAlarmStatus("CLOSED");
            a.setRemark("设备恢复在线，自动关闭离线告警");
            alarmRecordService.updateById(a);
        }
    }

    private void notifyDataChanged(String deviceCode, String action) {
        Map<String, Object> wsPayload = new HashMap<>();
        wsPayload.put("kind", "data_changed");
        wsPayload.put("source", "simulator");
        wsPayload.put("deviceId", deviceCode);
        wsPayload.put("action", action);
        wsPayload.put("ts", System.currentTimeMillis());
        // 广播给所有连接
        AlarmWebSocket.broadcastAll(JSONUtil.toJsonStr(wsPayload));
    }
}
