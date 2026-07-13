package com.smartsmoke.websocket;

import cn.dev33.satoken.stp.StpUtil;
import com.smartsmoke.entity.DeviceBinding;
import com.smartsmoke.entity.SmokeDevice;
import com.smartsmoke.entity.SysUser;
import com.smartsmoke.mapper.DeviceMapper;
import com.smartsmoke.mapper.UserMapper;
import com.smartsmoke.service.DeviceBindingService;
import jakarta.websocket.*;
import jakarta.websocket.server.ServerEndpoint;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 告警 WebSocket — 按用户角色和绑定关系精准推送。
 * ADMIN 收到全部告警，RESIDENT 只收到已绑定设备的告警。
 */
@Slf4j
@Component
@ServerEndpoint("/ws/alarm")
public class AlarmWebSocket {

    private static final Map<Session, Long> SESSION_USER = new ConcurrentHashMap<>();
    private static final Map<Session, String> SESSION_ROLE = new ConcurrentHashMap<>();

    private static UserMapper userMapper;
    private static DeviceMapper deviceMapper;
    private static DeviceBindingService deviceBindingService;

    @Autowired
    public void setUserMapper(UserMapper mapper) { AlarmWebSocket.userMapper = mapper; }

    @Autowired
    public void setDeviceMapper(DeviceMapper mapper) { AlarmWebSocket.deviceMapper = mapper; }

    @Autowired
    public void setDeviceBindingService(DeviceBindingService service) { AlarmWebSocket.deviceBindingService = service; }

    @OnOpen
    public void onOpen(Session session) {
        Long userId = null;
        String role = "RESIDENT";
        try {
            // 从 URL 参数中获取 token（兼容 satoken / token 两种参数名）
            Map<String, List<String>> params = session.getRequestParameterMap();
            List<String> tokenList = params.get("satoken");
            if (tokenList == null || tokenList.isEmpty()) {
                tokenList = params.get("token");
            }
            if (tokenList != null && !tokenList.isEmpty()) {
                String token = tokenList.get(0);
                Object loginId = StpUtil.getLoginIdByToken(token);
                if (loginId != null) {
                    userId = Long.valueOf(loginId.toString());
                    if (userMapper != null) {
                        SysUser user = userMapper.selectById(userId);
                        if (user != null) role = user.getRole() != null ? user.getRole() : "RESIDENT";
                    }
                }
            }
        } catch (Exception e) {
            log.warn("WebSocket 解析 token 失败: {}", e.getMessage());
        }
        // ConcurrentHashMap 不允许 null value，未登录用 0L
        SESSION_USER.put(session, userId != null ? userId : 0L);
        SESSION_ROLE.put(session, role != null ? role : "RESIDENT");
        log.info("WS connected: session={}, userId={}, role={}", session.getId(), userId, role);
    }

    @OnClose
    public void onClose(Session session) {
        SESSION_USER.remove(session);
        SESSION_ROLE.remove(session);
        log.info("WS disconnected: {}", session.getId());
    }

    @OnMessage
    public void onMessage(String msg, Session session) {
        log.debug("WS msg: {}", msg);
    }

    @OnError
    public void onError(Session s, Throwable e) {
        // 打印完整堆栈以便诊断断开原因（e.getMessage() 在 TCP 异常时常为 null）
        log.error("WS error on session {}: type={}, message={}", s.getId(),
                e != null ? e.getClass().getSimpleName() : "null",
                e != null ? e.getMessage() : "null", e);
        SESSION_USER.remove(s);
        SESSION_ROLE.remove(s);
    }

    /**
     * 全量广播（保留兼容，用于非告警类消息）
     */
    public static void broadcast(String msg) {
        for (Session s : SESSION_USER.keySet()) {
            trySend(s, msg);
        }
    }

    /**
     * 向所有已连接的客户端广播消息（不分角色/地址）
     */
    public static void broadcastAll(String message) {
        for (Session session : SESSION_USER.keySet()) {
            trySend(session, message);
        }
    }

    /**
     * 按设备归属推送告警：管理员全收，居民按地址匹配 + DeviceBinding 双通道接收。
     */
    public static void broadcastByDevice(Long deviceId, String msg) {
        SmokeDevice device = (deviceMapper != null && deviceId != null) ? deviceMapper.selectById(deviceId) : null;

        // 1. 地址匹配的用户 ID
        Set<Long> addressMatched = new java.util.HashSet<>();
        if (device != null && userMapper != null) {
            String bld = device.getLocationBuilding();
            String flr = device.getLocationFloor();
            if (bld != null && !bld.isEmpty() && flr != null && !flr.isEmpty()) {
                List<SysUser> matched = userMapper.selectList(
                        new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysUser>()
                                .eq(SysUser::getRole, "RESIDENT")
                                .eq(SysUser::getResidentBuilding, bld)
                                .eq(SysUser::getResidentFloor, flr));
                addressMatched = matched.stream().map(SysUser::getId).collect(Collectors.toSet());
            }
        }

        // 2. DeviceBinding 绑定的用户 ID（双通道兜底）
        Set<Long> boundUserIds = new java.util.HashSet<>();
        if (deviceBindingService != null && deviceId != null) {
            List<DeviceBinding> bindings = deviceBindingService.lambdaQuery()
                    .eq(DeviceBinding::getDeviceId, deviceId)
                    .eq(DeviceBinding::getStatus, "BOUND")
                    .eq(DeviceBinding::getIsDeleted, 0).list();
            boundUserIds = bindings.stream().map(DeviceBinding::getUserId).collect(Collectors.toSet());
        }
        // 合并两个渠道
        Set<Long> targetUserIds = new java.util.HashSet<>(addressMatched);
        targetUserIds.addAll(boundUserIds);

        for (Map.Entry<Session, Long> entry : SESSION_USER.entrySet()) {
            Session s = entry.getKey();
            Long uid = entry.getValue();
            String role = SESSION_ROLE.getOrDefault(s, "RESIDENT");
            String upper = role != null ? role.toUpperCase() : "";
            if (upper.equals("ADMIN") || upper.equals("SYSTEM_ADMIN") || upper.equals("COMMUNITY_ADMIN") || upper.equals("FIREFIGHTER")) {
                trySend(s, msg);
                continue;
            }
            // 未登录用户（uid=0L）→ 演示/监控模式，接收所有消息
            if (uid == null || uid == 0L) {
                trySend(s, msg);
                continue;
            }
            // 居民 → 地址匹配 OR DeviceBinding
            if (targetUserIds.contains(uid)) {
                trySend(s, msg);
            }
        }

        log.info("broadcastByDevice: device={}, addressMatched={}, bound={}, targetTotal={}",
                device != null ? device.getLocationBuilding()+device.getLocationFloor() : "null",
                addressMatched.size(), boundUserIds.size(), targetUserIds.size());
    }

    private static void trySend(Session s, String msg) {
        if (s == null || !s.isOpen()) return;
        s.getAsyncRemote().sendText(msg, result -> {
            if (!result.isOK()) {
                log.error("WS async send error: {}",
                        result.getException() != null ? result.getException().getMessage() : "unknown");
            }
        });
    }

    /**
     * 广播 data_changed 事件 — 通知所有已连接客户端刷新设备列表/数据。
     * 模拟器发送心跳、设备上线/离线、阈值变更后调用。
     */
    public static void broadcastDataChanged(String deviceCode) {
        cn.hutool.json.JSONObject payload = new cn.hutool.json.JSONObject();
        payload.set("kind", "data_changed");
        payload.set("deviceId", deviceCode);
        payload.set("ts", System.currentTimeMillis());
        broadcastAll(payload.toString());
    }

    /**
     * 广播告警结果 — 模拟器发送数据后触发告警或正常结果通知。
     */
    public static void broadcastAlarmResult(String deviceCode, String deviceName,
                                             String alarmType, String alarmLevel,
                                             double smoke, double temp, double thresholdValue,
                                             String building, String floor, Long alarmId) {
        cn.hutool.json.JSONObject payload = new cn.hutool.json.JSONObject();
        payload.set("kind", "alarm_result");
        payload.set("deviceId", deviceCode);
        payload.set("deviceName", deviceName);
        payload.set("alarmType", alarmType);
        payload.set("alarmLevel", alarmLevel);
        payload.set("smoke", smoke);
        payload.set("temp", temp);
        payload.set("thresholdValue", thresholdValue);
        payload.set("building", building);
        payload.set("floor", floor);
        payload.set("alarmId", alarmId);
        payload.set("ts", System.currentTimeMillis());
        // 告警结果广播给所有连接（管理员需要看到，居民由地址匹配过滤）
        broadcastAll(payload.toString());
    }

    /**
     * 广播设备配置变更 — 阈值修改后调用。
     */
    public static void broadcastDeviceConfigChanged(String deviceCode, String changeType) {
        cn.hutool.json.JSONObject payload = new cn.hutool.json.JSONObject();
        payload.set("kind", "device_config_changed");
        payload.set("deviceId", deviceCode);
        payload.set("changeType", changeType);
        payload.set("ts", System.currentTimeMillis());
        broadcastAll(payload.toString());
    }

    /**
     * 广播设备上线通知。
     */
    public static void broadcastDeviceOnline(String deviceCode, String deviceName) {
        cn.hutool.json.JSONObject payload = new cn.hutool.json.JSONObject();
        payload.set("kind", "device_online");
        payload.set("deviceId", deviceCode);
        payload.set("deviceName", deviceName);
        payload.set("ts", System.currentTimeMillis());
        broadcastAll(payload.toString());
    }

    /**
     * 广播设备离线通知。
     */
    public static void broadcastDeviceOffline(String deviceCode, String deviceName) {
        cn.hutool.json.JSONObject payload = new cn.hutool.json.JSONObject();
        payload.set("kind", "device_offline");
        payload.set("deviceId", deviceCode);
        payload.set("deviceName", deviceName);
        payload.set("ts", System.currentTimeMillis());
        broadcastAll(payload.toString());
    }
}
