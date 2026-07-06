-- ================================================================
-- 清空测试数据（保留系统配置、设备、用户、阈值）
-- 没有物理外键，放心 TRUNCATE
-- ================================================================

TRUNCATE TABLE sensor_data;
TRUNCATE TABLE broadcast_record;
TRUNCATE TABLE ai_review_record;
TRUNCATE TABLE alarm_record;
TRUNCATE TABLE conversation_log;
TRUNCATE TABLE operation_log;
TRUNCATE TABLE device_binding;

-- 重建初始设备绑定
INSERT INTO device_binding (device_id, user_id, bind_type, status) VALUES
(1, 1, 'OWNER', 'BOUND'),
(2, 3, 'ADMIN', 'BOUND'),
(3, 1, 'OWNER', 'BOUND'),
(5, 2, 'VIEWER', 'BOUND');

-- 验证
SELECT 'sensor_data' AS tbl, COUNT(*) AS cnt FROM sensor_data
UNION ALL SELECT 'alarm_record', COUNT(*) FROM alarm_record
UNION ALL SELECT 'ai_review_record', COUNT(*) FROM ai_review_record
UNION ALL SELECT 'broadcast_record', COUNT(*) FROM broadcast_record
UNION ALL SELECT 'conversation_log', COUNT(*) FROM conversation_log
UNION ALL SELECT 'operation_log', COUNT(*) FROM operation_log
UNION ALL SELECT 'device_binding', COUNT(*) FROM device_binding;
