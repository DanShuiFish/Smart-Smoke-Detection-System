package com.smartsmoke.service.impl;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.smartsmoke.config.MaxkbConfig;
import com.smartsmoke.service.AiService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiServiceImpl implements AiService {

    private final MaxkbConfig maxkbConfig;
    private final StringRedisTemplate redisTemplate;

    private static final String CHAT_CACHE_PREFIX = "maxkb:chat:";
    private static final Duration CHAT_CACHE_TTL = Duration.ofMinutes(30);

    // ──────────────────────────────────────────────
    // 视觉复核（保留原有占位逻辑，待 SmartJavaAI 接入后完善）
    // ──────────────────────────────────────────────
    @Override
    public boolean verifyFireVision(String imageUrl) {
        try {
            String body = String.format("{\"image\":\"%s\"}", imageUrl);
            String response = HttpRequest
                    .post("http://api.smartjavaai.com/vision/fire")
                    .body(body)
                    .timeout(3000)
                    .execute()
                    .body();

            JSONObject json = JSONUtil.parseObj(response);
            return json.getBool("hasFire", false);
        } catch (Exception e) {
            log.error("AI 视觉复核调用异常: {}", e.getMessage());
            return false;
        }
    }

    // ──────────────────────────────────────────────
    // 智能问答（MaxKB RAG 智能体）
    // ──────────────────────────────────────────────
    @Override
    public String chat(String question, String sessionId) {
        long start = System.currentTimeMillis();

        // 1. 从 Redis 获取缓存的 chat_id，没找到则调用 MaxKB 创建
        String chatId = getOrCreateChatId(sessionId);

        // 2. 调用 MaxKB 对话接口
        String url = maxkbConfig.getBaseUrl() + "/chat_message/" + chatId;
        JSONObject body = new JSONObject();
        body.set("message", question);
        body.set("stream", false);
        body.set("re_chat", true);

        log.debug("MaxKB 问答请求: url={}, question={}", url, question);

        String respBody;
        try (HttpResponse resp = HttpRequest
                .post(url)
                .header("Authorization", "Bearer " + maxkbConfig.getApiKey())
                .header("Content-Type", "application/json")
                .body(body.toString())
                .timeout(maxkbConfig.getTimeout())
                .execute()) {

            respBody = resp.body();
        } catch (Exception e) {
            log.error("MaxKB 问答调用失败: {}", e.getMessage(), e);
            throw new RuntimeException("AI 智能体调用失败，请稍后重试", e);
        }

        // 3. 解析响应
        JSONObject respJson = JSONUtil.parseObj(respBody);
        int code = respJson.getInt("code", -1);
        if (code != 200) {
            String msg = respJson.getStr("message", "未知错误");
            log.error("MaxKB 返回异常: code={}, message={}", code, msg);
            throw new RuntimeException("AI 智能体返回异常: " + msg);
        }

        JSONObject data = respJson.getJSONObject("data");
        String answer = data.getStr("content", "");

        long elapsed = System.currentTimeMillis() - start;
        log.info("MaxKB 问答成功: chatId={}, 耗时={}ms, answer长度={}",
                chatId, elapsed, answer != null ? answer.length() : 0);

        return StrUtil.isNotBlank(answer) ? answer : "抱歉，AI 未能生成有效回答，请换一种方式提问。";
    }

    // ──────────────────────────────────────────────
    // 私有辅助方法
    // ──────────────────────────────────────────────

    /**
     * 获取或创建 MaxKB 对话 chat_id，以 sessionId 为键缓存在 Redis 中
     */
    private String getOrCreateChatId(String sessionId) {
        String cacheKey = CHAT_CACHE_PREFIX + sessionId;

        // 先查缓存
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (StrUtil.isNotBlank(cached)) {
            log.debug("命中 chat_id 缓存: sessionId={} → chat_id={}", sessionId, cached);
            return cached;
        }

        // 调 MaxKB 创建新对话
        String openUrl = maxkbConfig.getBaseUrl() + "/open";
        log.debug("创建 MaxKB 对话: url={}", openUrl);

        String respBody;
        try (HttpResponse resp = HttpRequest
                .get(openUrl)
                .header("Authorization", "Bearer " + maxkbConfig.getApiKey())
                .timeout(10000)
                .execute()) {

            respBody = resp.body();
        } catch (Exception e) {
            log.error("MaxKB 创建对话失败: {}", e.getMessage(), e);
            throw new RuntimeException("创建 AI 对话失败，请稍后重试", e);
        }

        JSONObject respJson = JSONUtil.parseObj(respBody);
        int code = respJson.getInt("code", -1);
        if (code != 200) {
            String msg = respJson.getStr("message", "未知错误");
            log.error("MaxKB open 接口异常: code={}, message={}", code, msg);
            throw new RuntimeException("创建 AI 对话失败: " + msg);
        }

        // GET /chat/api/open 返回 data 直接就是 chat_id 字符串
        String chatId = respJson.getStr("data");
        if (StrUtil.isBlank(chatId)) {
            throw new RuntimeException("创建 AI 对话失败: 未获取到 chat_id");
        }

        // 写入 Redis 缓存
        redisTemplate.opsForValue().set(cacheKey, chatId, CHAT_CACHE_TTL);
        log.info("新建 MaxKB chat_id: sessionId={} → chat_id={}", sessionId, chatId);

        return chatId;
    }
}
