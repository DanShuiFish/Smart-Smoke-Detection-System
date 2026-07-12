package com.smartsmoke.controller;

import com.smartsmoke.common.Result;
import com.smartsmoke.entity.SensorData;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.mapper.DeviceMapper;
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
import java.util.concurrent.ConcurrentHashMap;
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

    // 心跳状态存储（仅内存，重启后根据设备 DB 状态重新判断）
    private final Set<String> heartbeatActiveDevices = ConcurrentHashMap.newKeySet();

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

        // 写入 Redis 心跳 Key
        stringRedisTemplate.opsForValue().set(
                "device:heartbeat:" + code,
                String.valueOf(System.currentTimeMillis()),
                dev.getHeartbeatTimeout() != null ? dev.getHeartbeatTimeout() : 30,
                TimeUnit.SECONDS
        );

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
        heartbeatActiveDevices.add(code);
        // 恢复上线
        SmokeDevice dev = resolveDevice(code);
        SmokeDevice upd = new SmokeDevice();
        upd.setId(dev.getId());
        upd.setStatus("ONLINE");
        upd.setLastOnlineTime(LocalDateTime.now());
        deviceMapper.updateById(upd);
        notifyDataChanged(code, "heartbeat_start");
        log.info("模拟器心跳启动: {}", code);
        return Result.success(Map.of("deviceCode", code, "heartbeatActive", true));
    }

    @PostMapping("/heartbeat/stop")
    public Result<Map<String, Object>> stopHeartbeat(@RequestBody Map<String, Object> body) {
        String code = str(body, "deviceCode");
        if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");
        heartbeatActiveDevices.remove(code);
        // 删除 Redis 心跳 Key，触发离线检测
        stringRedisTemplate.delete("device:heartbeat:" + code);
        notifyDataChanged(code, "heartbeat_stop");
        log.info("模拟器心跳停止: {}", code);
        return Result.success(Map.of("deviceCode", code, "heartbeatActive", false));
    }

    @GetMapping("/heartbeat/status")
    public Result<Map<String, Object>> heartbeatStatus(@RequestParam(defaultValue = "") String deviceCode) {
        if (deviceCode.isEmpty()) {
            // 返回所有设备心跳状态
            Map<String, Boolean> all = new LinkedHashMap<>();
            List<SmokeDevice> devices = deviceMapper.selectList(null);
            for (SmokeDevice d : devices) {
                all.put(d.getDeviceId(), heartbeatActiveDevices.contains(d.getDeviceId()));
            }
            return Result.success(Map.of("activeDevices", heartbeatActiveDevices, "deviceStatus", all));
        }
        return Result.success(Map.of("deviceCode", deviceCode, "active", heartbeatActiveDevices.contains(deviceCode)));
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
            entry.put("heartbeatActive", heartbeatActiveDevices.contains(d.getDeviceId()));
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
