package com.smartsmoke.service.impl;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import cn.smartjavaai.common.entity.DetectionResponse;
import cn.smartjavaai.common.enums.DeviceEnum;
import cn.smartjavaai.objectdetection.config.DetectorModelConfig;
import cn.smartjavaai.objectdetection.enums.DetectorModelEnum;
import cn.smartjavaai.objectdetection.model.DetectorModel;
import cn.smartjavaai.objectdetection.model.ObjectDetectionModelFactory;
import com.smartsmoke.config.MaxkbConfig;
import com.smartsmoke.service.AiService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiServiceImpl implements AiService {

    private final MaxkbConfig maxkbConfig;
    private final StringRedisTemplate redisTemplate;

    @Value("${smart-java-ai.threshold:0.3}")
    private double threshold;

    private volatile DetectorModel fireSmokeDetector;
    private final Object detectorLock = new Object();

    private static final String CHAT_CACHE_PREFIX = "maxkb:chat:";
    private static final Duration CHAT_CACHE_TTL = Duration.ofMinutes(30);

    // ──────────────────────────────────────────────
    // 视觉复核（SmartJavaAI YOLO 烟雾检测）
    // ──────────────────────────────────────────────
    @Override
    public boolean verifyFireVision(String imagePath) {
        if (fireSmokeDetector == null) {
            log.warn("火焰烟雾检测模型未初始化，视觉复核跳过。请检查: ./smart-smoke-models/best.onnx");
            return false;
        }

        try {
            log.info("视觉复核开始: imagePath={}", imagePath);
            long start = System.currentTimeMillis();

            DetectionResponse response = fireSmokeDetector.detect(imagePath);

            long elapsed = System.currentTimeMillis() - start;
            if (response == null || response.getDetectionInfoList() == null
                    || response.getDetectionInfoList().isEmpty()) {
                log.info("视觉复核完成: 无检出对象, 耗时={}ms", elapsed);
                return false;
            }

            for (var detection : response.getDetectionInfoList()) {
                String className = detection.getObjectDetInfo().getClassName();
                double score = detection.getScore();
                log.info("视觉检测: class={}, confidence={:.2f}%", className, score * 100);

                // 火焰 或 烟雾，任一类别置信度达标即判定为火情
                if (("fire".equalsIgnoreCase(className) || "smoke".equalsIgnoreCase(className))
                        && score >= threshold) {
                    log.info("视觉复核: 确认火情! class={}, confidence={:.2f}%, 耗时={}ms",
                            className, score * 100, elapsed);
                    return true;
                }
            }

            log.info("视觉复核完成: 未达阈值(>{}) 耗时={}ms", threshold, elapsed);
            return false;

        } catch (Exception e) {
            log.error("AI 视觉检测异常: {}", e.getMessage(), e);
            return false;
        }
    }

    // ──────────────────────────────────────────────
    // 智能问答（MaxKB RAG 智能体）
    // ──────────────────────────────────────────────
    @Override
    public String chat(String question, String sessionId) {
        long start = System.currentTimeMillis();

        String chatId = getOrCreateChatId(sessionId);

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
    // 模型初始化（启动时自动加载）
    // ──────────────────────────────────────────────

    @PostConstruct
    public void initDetector() {
        try {
            synchronized (detectorLock) {
                String onnxPath = "./smart-smoke-models/best.onnx";
                log.info("正在加载火焰烟雾检测模型(YOLOv8n): {}", onnxPath);

                DetectorModelConfig config = new DetectorModelConfig();
                config.setModelEnum(DetectorModelEnum.YOLOV8_CUSTOM_ONNX);
                config.setModelPath(onnxPath);
                config.setThreshold((float) threshold);
                config.setDevice(DeviceEnum.CPU);

                fireSmokeDetector = ObjectDetectionModelFactory.getInstance().getModel(config);
                log.info("火焰烟雾检测模型加载成功");
            }
        } catch (Exception e) {
            log.error("模型加载失败: {}。请检查: ./smart-smoke-models/best.onnx", e.getMessage());
            fireSmokeDetector = null;
        }
    }

    // ──────────────────────────────────────────────
    // 私有辅助方法
    // ──────────────────────────────────────────────

    private String getOrCreateChatId(String sessionId) {
        String cacheKey = CHAT_CACHE_PREFIX + sessionId;

        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (StrUtil.isNotBlank(cached)) {
            log.debug("命中 chat_id 缓存: sessionId={} → chat_id={}", sessionId, cached);
            return cached;
        }

        String openUrl = maxkbConfig.getBaseUrl() + "/open";
        log.debug("创建 MaxKB 对话: url={}", openUrl);

        String respBody;
        try (HttpResponse resp = HttpRequest
                .get(openUrl)
                .header("Authorization", "Bearer " + maxkbConfig.getApiKey())
                .timeout(maxkbConfig.getTimeout())
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

        String chatId = respJson.getStr("data");
        if (StrUtil.isBlank(chatId)) {
            throw new RuntimeException("创建 AI 对话失败: 未获取到 chat_id");
        }

        redisTemplate.opsForValue().set(cacheKey, chatId, CHAT_CACHE_TTL);
        log.info("新建 MaxKB chat_id: sessionId={} → chat_id={}", sessionId, chatId);

        return chatId;
    }
}
