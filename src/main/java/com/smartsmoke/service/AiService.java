package com.smartsmoke.service;

public interface AiService {

    /**
     * 视觉复核接口
     * @param imageUrl 监控摄像头的画面图片URL
     * @return true: 确认为明火, false: 误报或未确信
     */
    boolean verifyFireVision(String imageUrl);

}