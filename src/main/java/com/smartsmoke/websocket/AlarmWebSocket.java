package com.smartsmoke.websocket;
import jakarta.websocket.*;
import jakarta.websocket.server.ServerEndpoint;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.concurrent.CopyOnWriteArraySet;
@Slf4j
@Component
@ServerEndpoint("/ws/alarm")
public class AlarmWebSocket {
    private static final CopyOnWriteArraySet<Session> SESSIONS = new CopyOnWriteArraySet<>();
    @OnOpen
    public void onOpen(Session session) { SESSIONS.add(session); log.info("WS connected: {}", session.getId()); }
    @OnClose
    public void onClose(Session session) { SESSIONS.remove(session); log.info("WS disconnected: {}", session.getId()); }
    @OnMessage
    public void onMessage(String msg, Session session) { log.debug("WS msg: {}", msg); }
    @OnError
    public void onError(Session s, Throwable e) { log.error("WS error: {}", e.getMessage()); }
    public static void broadcast(String msg) {
        for (Session s : SESSIONS) {
            try { s.getBasicRemote().sendText(msg); } catch (Exception e) { log.error("WS send error: {}", e.getMessage()); }
        }
    }
}