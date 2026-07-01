package com.smartsmoke.rule;

import com.smartsmoke.entity.SensorData;
import com.smartsmoke.service.SensorDataService;
import com.smartsmoke.websocket.AlarmWebSocket;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class AlarmRuleEngine {

    @Autowired
    private SensorDataService sensorDataService;

    // PM 核心掌控的方法
    public void processData(SensorData data) {
        // 1. 数据无条件入库
        sensorDataService.save(data);

        // 2. 多模态融合判定规则 (烟雾 > 0.1 且 温度 > 60)
        boolean isSmokeDanger = data.getSmokeConcentration().doubleValue() > 0.1;
        boolean isTempDanger = data.getTemperature() != null && data.getTemperature().doubleValue() > 60.0;

        if (isSmokeDanger || isTempDanger) {
            // 3. 触发系统内部分发逻辑（记录报警表、推送WebSocket、调取AI复核）
            triggerAlarm(data);
        }
    }

    private void triggerAlarm(SensorData data) {
        // TODO: 写入 AlarmRecord，调用 AlarmWebSocket 推送前端
    }
}