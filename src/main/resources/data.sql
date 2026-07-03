-- ================================================================
-- 初始化数据（Spring Boot 启动时自动导入）
-- ================================================================

-- 系统配置
INSERT IGNORE INTO `system_config` (config_key, config_value, config_group, description, sort_order) VALUES
('heartbeat_timeout_seconds','30','DEVICE','心跳超时(秒)',1),
('default_smoke_threshold','1.0000','ALERT','烟雾阈值',2),
('default_temp_threshold','60.00','ALERT','温度阈值(C)',3),
('alarm_silent_period_seconds','300','ALERT','静默期(秒)',4),
('data_retention_days','180','DATA','数据保留天数',5),
('mock_device_count','5','MOCK','模拟设备数',6),
('mqtt_broker_url','tcp://localhost:1883','MQTT','Broker地址',7),
('websocket_enabled','true','SYSTEM','WebSocket',8);

-- 告警阈值
INSERT IGNORE INTO `alert_threshold` (threshold_type, alarm_level, threshold_min, threshold_max, duration_seconds, is_default, status, sort_order, remark) VALUES
('SMOKE_CONCENTRATION','LOW',0.5,1.0,10,1,'ENABLED',1,'轻度'),
('SMOKE_CONCENTRATION','MEDIUM',1.0,2.0,5,1,'ENABLED',2,'中度'),
('SMOKE_CONCENTRATION','HIGH',2.0,5.0,3,1,'ENABLED',3,'重度'),
('SMOKE_CONCENTRATION','CRITICAL',5.0,99.9999,0,1,'ENABLED',4,'严重'),
('TEMPERATURE','HIGH',60.0,80.0,10,1,'ENABLED',5,'高温'),
('TEMPERATURE','CRITICAL',80.0,200.0,0,1,'ENABLED',6,'严重高温');

-- 模拟设备(5台)
INSERT IGNORE INTO `smoke_device` (device_id, device_name, status, location_building, location_floor, location_room, battery) VALUES
('SDS-001','1栋大厅烟感','ONLINE','1栋','1F','入户大厅',85),
('SDS-002','1栋走廊烟感','ONLINE','1栋','3F','走廊',72),
('SDS-003','2栋电梯前室','ONLINE','2栋','5F','电梯前室',90),
('SDS-004','3栋车库烟感','OFFLINE','3栋','B1','车库C区',15),
('SDS-005','4栋消防通道','ONLINE','4栋','2F','消防通道',68);

-- 测试用户
INSERT IGNORE INTO `sys_user` (username, password, real_name, role, status, remark) VALUES
('admin','$2a$10$W/Pyj3Hk4t1cTutG0i2rjeAJx559u5cuOdaFpeOmKtw5tJgdnVsau','系统管理员','SYSTEM_ADMIN','ENABLED','内置管理员'),
('fireman1','$2a$10$Tf8b0kdpFLE66x8N4Jp9JevA0hNIhbopFnNxF8lJKL0U32ZUTRwVi','消防员张三','FIREFIGHTER','ENABLED','消防员'),
('manager1','$2a$10$hXxUChyTPEnJoC3Cg9aU7OjM.mL4REQQQWQ0OvhvoPFQJhTbql7aC','管理员李四','COMMUNITY_ADMIN','ENABLED','小区管理员');

-- Sample: device bindings
INSERT IGNORE INTO `device_binding` (`device_id`,`user_id`,`bind_type`,`status`) VALUES
(1,1,'OWNER','BOUND'),
(2,3,'ADMIN','BOUND'),
(3,1,'OWNER','BOUND'),
(5,2,'VIEWER','BOUND');


-- Sensor data samples (for history trend charts)
INSERT IGNORE INTO `sensor_data` (`device_id`,`smoke_concentration`,`temperature`,`humidity`,`collect_time`) VALUES
(1,0.0521,23.5,45.2,NOW()-INTERVAL 30 DAY),
(1,0.0613,24.1,44.8,NOW()-INTERVAL 29 DAY),
(1,0.0487,22.8,46.1,NOW()-INTERVAL 28 DAY),
(1,0.0725,24.3,43.5,NOW()-INTERVAL 27 DAY),
(1,0.0559,23.9,45.0,NOW()-INTERVAL 26 DAY),
(1,0.0832,25.1,42.7,NOW()-INTERVAL 24 HOUR),
(1,0.0914,25.6,42.1,NOW()-INTERVAL 12 HOUR),
(1,0.1020,26.2,41.5,NOW()-INTERVAL 6 HOUR),
(1,0.1125,26.8,40.9,NOW()-INTERVAL 1 HOUR),
(2,0.0331,22.1,47.3,NOW()-INTERVAL 30 DAY),
(2,0.0418,22.7,46.8,NOW()-INTERVAL 25 DAY),
(2,0.0385,23.0,46.2,NOW()-INTERVAL 20 DAY),
(2,0.0452,23.5,45.6,NOW()-INTERVAL 15 DAY),
(2,0.0527,24.0,44.9,NOW()-INTERVAL 10 DAY),
(2,0.0481,23.8,45.3,NOW()-INTERVAL 5 DAY),
(2,0.0553,24.2,44.5,NOW()-INTERVAL 1 DAY);

-- Alarm record sample
INSERT IGNORE INTO `alarm_record` (`device_id`,`alarm_code`,`alarm_type`,`alarm_level`,`alarm_status`,`smoke_concentration`,`threshold_value`,`alarm_time`) VALUES
(1,'ALG-20260701-001','SMOKE_OVERFLOW','HIGH','PENDING',2.3500,2.0000,NOW()-INTERVAL 1 HOUR);
