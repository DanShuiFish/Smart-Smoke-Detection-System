package com.smartsmoke.service;

public interface AiService {

    /**
     * 视觉复核接口
     * @param imageUrl 监控摄像头的画面图片URL
     * @return true: 确认为明火, false: 误报或未确信
     */
    boolean verifyFireVision(String imageUrl);

    /**
     * 智能问答接口（MaxKB RAG）
     * @param question  用户提问
     * @param sessionId 对话 sessionId（前端生成，后端用于映射 chat_id 实现多轮对话）
     * @return AI 回答文本
     */
    String chat(String question, String sessionId);
}
