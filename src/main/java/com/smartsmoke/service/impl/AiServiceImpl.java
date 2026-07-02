package com.smartsmoke.service.impl;

import cn.hutool.http.HttpUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.smartsmoke.service.AiService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service // 极其重要：必须加 @Service，让 Spring 把它注册为 Bean
public class AiServiceImpl implements AiService {

    @Override
    public boolean verifyFireVision(String imageUrl) {
        try {
            // 设置超时时间为 3000ms，防止 AI 接口卡死导致我们自己的线程池耗尽
            String response = HttpUtil.createPost("http://api.smartjavaai.com/vision/fire")
                    .body("{\"image\":\"" + imageUrl + "\"}")
                    .timeout(3000)
                    .execute().body();

            JSONObject json = JSONUtil.parseObj(response);
            return json.getBool("hasFire", false);

        } catch (Exception e) {
            log.error("AI 视觉复核调用异常: {}", e.getMessage());
            return false;
        }
    }
}