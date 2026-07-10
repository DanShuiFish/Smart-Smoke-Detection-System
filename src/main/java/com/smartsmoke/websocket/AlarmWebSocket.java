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

import java.io.IOException;
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
            // 从 URL 参数中获取 token
            Map<String, List<String>> params = session.getRequestParameterMap();
            List<String> tokenList = params.get("token");
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
        SESSION_USER.put(session, userId);
        SESSION_ROLE.put(session, role);
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
        log.error("WS error: {}", e.getMessage());
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
            // 居民 → 地址匹配 OR DeviceBinding
            if (uid != null && targetUserIds.contains(uid)) {
                trySend(s, msg);
            }
        }

        log.info("broadcastByDevice: device={}, addressMatched={}, bound={}, targetTotal={}",
                device != null ? device.getLocationBuilding()+device.getLocationFloor() : "null",
                addressMatched.size(), boundUserIds.size(), targetUserIds.size());
    }

    private static void trySend(Session s, String msg) {
        if (s == null || !s.isOpen()) return;
        try {
            s.getBasicRemote().sendText(msg);
        } catch (IOException e) {
            log.error("WS send error: {}", e.getMessage());
        }
    }
}
