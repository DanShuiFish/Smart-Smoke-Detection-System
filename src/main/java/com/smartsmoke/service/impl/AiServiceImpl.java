package com.smartsmoke.service.impl;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.smartsmoke.service.AiService;
import com.smartsmoke.service.CameraStrategy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Random;

/**
 * AI 视觉复核服务实现 — BE3
 * 使用 CameraStrategy 抓取图片，调用 SmartJavaAI 视觉接口判定火情。
 * 模拟期使用 MockCameraServiceImpl，后期切换真实摄像头实现。
 */
@Slf4j
@Service
public class AiServiceImpl implements AiService {

    private final CameraStrategy cameraStrategy;
    private final RestTemplate aiRestTemplate;

    @Value("${smart-java-ai.url:}")
    private String smartJavaAiUrl;

    @Value("${smart-java-ai.key:}")
    private String smartJavaAiKey;

    public AiServiceImpl(CameraStrategy cameraStrategy,
                         @Qualifier("aiRestTemplate") RestTemplate aiRestTemplate) {
        this.cameraStrategy = cameraStrategy;
        this.aiRestTemplate = aiRestTemplate;
    }

    private static final Random RANDOM = new Random();

    /**
     * 完整的视觉复核方法 — 供 PM 的 AlarmRuleEngine 升级后使用。
     */
    @Override
    public ReviewResult verifyFireVision(Long deviceId, String deviceCode, String cameraId) {
        long startMs = System.currentTimeMillis();

        // 1. 抓取摄像头图片
        String imageUrl = cameraStrategy.captureImage(deviceId, deviceCode, cameraId);
        if (imageUrl == null) {
            log.warn("设备 {} 无关联摄像头，跳过视觉复核", deviceCode);
            return ReviewResult.noCamera();
        }

        // 2. 调用 SmartJavaAI 视觉接口（或 Mock 模式）
        ReviewResult result;
        if (smartJavaAiUrl != null && !smartJavaAiUrl.isBlank()) {
            result = callSmartJavaAi(imageUrl, startMs);
        } else {
            log.info("SmartJavaAI 未配置，使用 Mock 模式");
            result = mockVisionAnalysis(deviceId, imageUrl, startMs);
        }

        log.info("视觉复核完成: deviceCode={}, result={}, confidence={}%, time={}ms",
                deviceCode, result.reviewResult, result.confidence, result.processingTimeMs);

        return result;
    }

    /**
     * 简化版视觉复核 — 兼容 PM 旧代码调用。
     * 当 imageUrl 为空时，用 deviceId=0 和空 deviceCode 请求 Mock Camera。
     */
    @Override
    @Deprecated
    public boolean verifyFireVision(String imageUrl) {
        log.warn("使用了已弃用的 verifyFireVision(String) 方法，建议 PM 升级调用 verifyFireVision(Long, String, String)");
        if (imageUrl != null && !imageUrl.isBlank()) {
            // 检查 SmartJavaAI 是否已配置
            if (smartJavaAiUrl == null || smartJavaAiUrl.isBlank()) {
                log.warn("SmartJavaAI 未配置，旧版兼容模式降级为 Mock");
                ReviewResult r = mockVisionAnalysis(null, imageUrl, System.currentTimeMillis());
                return r.hasFire;
            }
            ReviewResult r = callSmartJavaAi(imageUrl, System.currentTimeMillis());
            return r.hasFire;
        }
        // 降级：无可用图片时保守处理，返回 false 由人工确认
        log.info("旧版兼容模式: imageUrl 为空，返回 false（需人工确认）");
        return false;
    }

    // ========== 私有方法 ==========

    /**
     * 调用 SmartJavaAI 视觉识别接口
     */
    private ReviewResult callSmartJavaAi(String imageUrl, long startMs) {
        try {
            String url = smartJavaAiUrl.replaceAll("/+$", "") + "/vision/fire";

            JSONObject body = new JSONObject();
            body.set("image", imageUrl);
            body.set("model", "fire-detection-v1");

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            if (smartJavaAiKey != null && !smartJavaAiKey.isBlank()) {
                headers.setBearerAuth(smartJavaAiKey);
            }

            HttpEntity<String> entity = new HttpEntity<>(body.toString(), headers);
            ResponseEntity<String> response = aiRestTemplate.postForEntity(url, entity, String.class);
            int processingMs = (int) (System.currentTimeMillis() - startMs);

            if (response.getBody() != null) {
                JSONObject json = JSONUtil.parseObj(response.getBody());
                boolean hasFire = json.getBool("hasFire", json.getBool("has_fire", false));
                double confidence = json.getDouble("confidence", json.getDouble("score", 0.0)) * 100;
                return new ReviewResult(hasFire, imageUrl,
                        hasFire ? "FIRE_CONFIRMED" : "NO_FIRE",
                        confidence, response.getBody(), processingMs);
            }

            return new ReviewResult(false, imageUrl, "NO_FIRE", 0, "", processingMs);

        } catch (Exception e) {
            int processingMs = (int) (System.currentTimeMillis() - startMs);
            log.error("SmartJavaAI 调用异常: {} (耗时{}ms)", e.getMessage(), processingMs);
            String errJson = JSONUtil.createObj().set("error", e.getMessage()).toString();
            return new ReviewResult(false, imageUrl, "UNCERTAIN", 0, errJson, processingMs);
        }
    }

    /**
     * Mock 视觉分析 — 模拟期使用。
     * 策略：奇数 deviceId 返回有火，偶数返回无火。
     */
    private ReviewResult mockVisionAnalysis(Long deviceId, String imageUrl, long startMs) {
        // 模拟 AI 处理耗时 500~1500ms
        try {
            Thread.sleep(500 + RANDOM.nextInt(1000));
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }

        int processingMs = (int) (System.currentTimeMillis() - startMs);
        boolean hasFire = (deviceId != null && deviceId % 2 == 1);
        double confidence = hasFire
                ? 78.0 + RANDOM.nextDouble() * 20.0   // 78~98%
                : 5.0 + RANDOM.nextDouble() * 15.0;    // 5~20%

        String aiRaw = String.format(
                "{\"mock\": true, \"hasFire\": %b, \"confidence\": %.2f, \"model\": \"mock-fire-detection-v1\"}",
                hasFire, confidence);

        return new ReviewResult(hasFire, imageUrl,
                hasFire ? "FIRE_CONFIRMED" : "NO_FIRE",
                Math.round(confidence * 100.0) / 100.0,
                aiRaw, processingMs);
    }
}
