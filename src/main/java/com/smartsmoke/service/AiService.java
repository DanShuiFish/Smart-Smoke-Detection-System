package com.smartsmoke.service;

/**
 * AI 视觉复核服务接口 — BE3
 * 封装 SmartJavaAI 视觉识别调用，供 PM 的 AlarmRuleEngine 使用。
 */
public interface AiService {

    /**
     * 视觉复核：根据设备信息抓取摄像头画面，调用 AI 判定是否存在明火。
     *
     * @param deviceId  设备数据库主键 ID
     * @param deviceCode 设备硬件编号（如 "SDS-001"）
     * @param cameraId   关联摄像头编号（可选，从设备扩展属性提取）
     * @return AI 复核结果（含判定结论、置信度、图片 URL、耗时等）
     */
    ReviewResult verifyFireVision(Long deviceId, String deviceCode, String cameraId);

    /**
     * 视觉复核（简化版，兼容 PM 旧代码）。
     * 当 imageUrl 为空时，内部使用 CameraStrategy 抓图。
     *
     * @param imageUrl 图片 URL（可为空字符串）
     * @return true: 确认为明火, false: 误报或未确信
     * @deprecated 建议使用 {@link #verifyFireVision(Long, String, String)} 获取完整结果
     */
    @Deprecated
    boolean verifyFireVision(String imageUrl);

    // ====== 内部类 ======

    /** AI 视觉复核完整结果 */
    class ReviewResult {
        public final boolean hasFire;
        public final String imageUrl;
        public final String reviewResult;    // FIRE_CONFIRMED / NO_FIRE / UNCERTAIN
        public final double confidence;      // 0.00 ~ 100.00
        public final String aiRawResponse;   // AI 原始返回 JSON
        public final int processingTimeMs;

        public ReviewResult(boolean hasFire, String imageUrl, String reviewResult,
                            double confidence, String aiRawResponse, int processingTimeMs) {
            this.hasFire = hasFire;
            this.imageUrl = imageUrl;
            this.reviewResult = reviewResult;
            this.confidence = confidence;
            this.aiRawResponse = aiRawResponse;
            this.processingTimeMs = processingTimeMs;
        }

        /** 创建一个空结果（无摄像头时） */
        public static ReviewResult noCamera() {
            return new ReviewResult(false, null, "UNCERTAIN", 0, "无关联摄像头", 0);
        }
    }
}
