-- ================================================================
-- 智慧烟感预警系统 DDL（Spring Boot 启动时自动执行）
-- ================================================================

-- system_config
CREATE TABLE IF NOT EXISTS `system_config` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `config_key` VARCHAR(100) NOT NULL  COMMENT '配置键',
    `config_value` TEXT NULL  COMMENT '配置值',
    `config_group` VARCHAR(50) NULL DEFAULT 'DEFAULT'  COMMENT '分组',
    `description` VARCHAR(255) NULL  COMMENT '说明',
    `sort_order` INT NULL DEFAULT 0  COMMENT '排序',
    `is_deleted` TINYINT NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50) NULL  COMMENT '创建人',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50) NULL  COMMENT '更新人',
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `u_config_key` (config_key)  COMMENT '配置键唯一',
    KEY `idx_cg` (config_group)  COMMENT '分组索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';

-- smoke_device
CREATE TABLE IF NOT EXISTS `smoke_device` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `device_id` VARCHAR(64) NOT NULL  COMMENT '设备编号',
    `device_name` VARCHAR(128) NULL  COMMENT '设备名称',
    `device_model` VARCHAR(64) NULL  COMMENT '型号',
    `device_secret` VARCHAR(128) NULL  COMMENT '密钥',
    `firmware_version` VARCHAR(32) NULL  COMMENT '固件版本',
    `status` VARCHAR(16) NOT NULL DEFAULT 'OFFLINE'  COMMENT '状态',
    `battery` INT NULL DEFAULT 100  COMMENT '电量',
    `signal_strength` INT NULL  COMMENT '信号强度',
    `location_building` VARCHAR(128) NULL  COMMENT '楼栋',
    `location_floor` VARCHAR(32) NULL  COMMENT '楼层',
    `location_room` VARCHAR(128) NULL  COMMENT '位置',
    `location_lat` DECIMAL(10,6) NULL  COMMENT '纬度',
    `location_lng` DECIMAL(10,6) NULL  COMMENT '经度',
    `extra_attrs` JSON NULL  COMMENT '扩展属性',
    `install_date` DATETIME NULL  COMMENT '安装日期',
    `last_online_time` DATETIME NULL  COMMENT '最后上线',
    `last_offline_time` DATETIME NULL  COMMENT '最后离线',
    `last_heartbeat` DATETIME NULL  COMMENT '最后心跳',
    `heartbeat_timeout` INT NULL DEFAULT 30  COMMENT '心跳超时(秒)',
    `sort_order` INT NULL DEFAULT 0  COMMENT '排序',
    `remark` VARCHAR(500) NULL  COMMENT '备注',
    `is_deleted` TINYINT NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50) NULL  COMMENT '创建人',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50) NULL  COMMENT '更新人',
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `u_device_id` (device_id)  COMMENT '设备编号唯一',
    KEY `idx_st` (status)  COMMENT '状态过滤',
    KEY `idx_loc` (location_building, location_floor)  COMMENT '位置查询',
    KEY `idx_lh` (last_heartbeat)  COMMENT '心跳索引',
    KEY `idx_del` (is_deleted)  COMMENT '逻辑删除'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='烟感设备表';

-- sys_user
CREATE TABLE IF NOT EXISTS `sys_user` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `username` VARCHAR(64) NOT NULL  COMMENT '用户名',
    `password` VARCHAR(256) NOT NULL  COMMENT '密码(BCrypt)',
    `real_name` VARCHAR(64) NULL  COMMENT '姓名',
    `phone` VARCHAR(20) NULL  COMMENT '手机',
    `email` VARCHAR(128) NULL  COMMENT '邮箱',
    `avatar` VARCHAR(256) NULL  COMMENT '头像',
    `role` VARCHAR(32) NOT NULL DEFAULT 'RESIDENT'  COMMENT '角色',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ENABLED'  COMMENT '状态',
    `user_ext` JSON NULL  COMMENT '扩展',
    `last_login_ip` VARCHAR(64) NULL  COMMENT '最后IP',
    `last_login_time` DATETIME NULL  COMMENT '最后登录',
    `login_count` INT NULL DEFAULT 0  COMMENT '登录次数',
    `is_deleted` TINYINT NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50) NULL  COMMENT '创建人',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50) NULL  COMMENT '更新人',
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `u_username` (username)  COMMENT '用户名唯一',
    KEY `idx_role` (role)  COMMENT '角色过滤',
    KEY `idx_phone` (phone)  COMMENT '手机查询',
    KEY `idx_st2` (status)  COMMENT '状态过滤'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户表';

-- device_binding
CREATE TABLE IF NOT EXISTS `device_binding` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键',
    `device_id` BIGINT NOT NULL  COMMENT '设备ID',
    `user_id` BIGINT NOT NULL  COMMENT '用户ID',
    `bind_type` VARCHAR(16) NOT NULL DEFAULT 'OWNER'  COMMENT '类型',
    `bind_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '绑定时间',
    `unbind_time` DATETIME NULL  COMMENT '解绑时间',
    `status` VARCHAR(16) NOT NULL DEFAULT 'BOUND'  COMMENT '状态',
    `remark` VARCHAR(500) NULL  COMMENT '备注',
    `is_deleted` TINYINT NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50) NULL  COMMENT '创建人',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50) NULL  COMMENT '更新人',
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `u_du` (device_id, user_id, status)  COMMENT '唯一',
    KEY `idx_did` (device_id)  COMMENT '设备',
    KEY `idx_uid` (user_id)  COMMENT '用户',
    KEY `idx_bs` (status)  COMMENT '状态'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备-用户绑定';

-- sensor_data
CREATE TABLE IF NOT EXISTS `sensor_data` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键',
    `device_id` BIGINT NOT NULL  COMMENT '设备ID',
    `smoke_concentration` DECIMAL(10,4) NOT NULL  COMMENT '烟雾浓度(mg/m3)',
    `temperature` DECIMAL(6,2) NULL  COMMENT '温度(C)',
    `humidity` DECIMAL(5,2) NULL  COMMENT '湿度(%RH)',
    `unit` VARCHAR(16) NULL DEFAULT 'mg/m3'  COMMENT '单位',
    `is_alert` TINYINT NOT NULL DEFAULT 0  COMMENT '告警标记',
    `extra_data` JSON NULL  COMMENT '扩展',
    `collect_time` DATETIME NOT NULL  COMMENT '采集时间',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '入库时间',
    PRIMARY KEY (`id`),
    KEY `idx_dt` (device_id, collect_time)  COMMENT '设备+时间',
    KEY `idx_ct` (collect_time)  COMMENT '时间',
    KEY `idx_crt` (create_time)  COMMENT '入库时间',
    KEY `idx_ia` (is_alert, collect_time)  COMMENT '告警'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='传感器数据';

-- alert_threshold
CREATE TABLE IF NOT EXISTS `alert_threshold` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键',
    `device_id` BIGINT NULL  COMMENT '设备ID(NULL=全局)',
    `threshold_type` VARCHAR(32) NOT NULL  COMMENT '类型',
    `alarm_level` VARCHAR(16) NOT NULL DEFAULT 'MEDIUM'  COMMENT '级别',
    `threshold_min` DECIMAL(10,4) NULL  COMMENT '下限',
    `threshold_max` DECIMAL(10,4) NOT NULL  COMMENT '上限',
    `duration_seconds` INT NULL DEFAULT 0  COMMENT '持续(秒)',
    `effective_start` TIME NULL DEFAULT '00:00:00'  COMMENT '生效开始',
    `effective_end` TIME NULL DEFAULT '23:59:59'  COMMENT '生效结束',
    `silent_period` INT NULL DEFAULT 300  COMMENT '静默(秒)',
    `is_default` TINYINT NOT NULL DEFAULT 0  COMMENT '全局默认',
    `status` VARCHAR(16) NOT NULL DEFAULT 'ENABLED'  COMMENT '状态',
    `sort_order` INT NULL DEFAULT 0  COMMENT '排序',
    `remark` VARCHAR(500) NULL  COMMENT '备注',
    `is_deleted` TINYINT NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50) NULL  COMMENT '创建人',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50) NULL  COMMENT '更新人',
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `idx_dtt` (device_id, threshold_type)  COMMENT '设备+类型',
    KEY `idx_tt` (threshold_type)  COMMENT '类型'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警阈值';

-- alarm_record
CREATE TABLE IF NOT EXISTS `alarm_record` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键',
    `device_id` BIGINT NOT NULL  COMMENT '设备ID',
    `sensor_data_id` BIGINT NULL  COMMENT '触发数据ID',
    `alarm_code` VARCHAR(64) NOT NULL  COMMENT '告警编号',
    `alarm_type` VARCHAR(32) NOT NULL  COMMENT '类型',
    `alarm_level` VARCHAR(16) NOT NULL  COMMENT '级别',
    `alarm_status` VARCHAR(20) NOT NULL DEFAULT 'PENDING'  COMMENT '状态',
    `smoke_concentration` DECIMAL(10,4) NULL  COMMENT '浓度',
    `threshold_value` DECIMAL(10,4) NULL  COMMENT '阈值',
    `alarm_time` DATETIME NOT NULL  COMMENT '告警时间',
    `confirm_time` DATETIME NULL  COMMENT '确认时间',
    `confirm_user_id` BIGINT NULL  COMMENT '确认人',
    `confirm_method` VARCHAR(32) NULL  COMMENT '确认方式',
    `resolve_time` DATETIME NULL  COMMENT '处置时间',
    `resolve_user_id` BIGINT NULL  COMMENT '处置人',
    `resolve_method` VARCHAR(32) NULL  COMMENT '处置方式',
    `resolve_detail` TEXT NULL  COMMENT '处置详情',
    `is_vision_reviewed` TINYINT NOT NULL DEFAULT 0  COMMENT '视觉复核',
    `is_broadcast_sent` TINYINT NOT NULL DEFAULT 0  COMMENT '广播下发',
    `alarm_ext` JSON NULL  COMMENT '扩展',
    `remark` VARCHAR(500) NULL  COMMENT '备注',
    `is_deleted` TINYINT NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50) NULL  COMMENT '创建人',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50) NULL  COMMENT '更新人',
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `u_ac` (alarm_code)  COMMENT '编号唯一',
    KEY `idx_did` (device_id)  COMMENT '设备',
    KEY `idx_as` (alarm_status)  COMMENT '状态',
    KEY `idx_at` (alarm_type)  COMMENT '类型',
    KEY `idx_al` (alarm_level)  COMMENT '级别',
    KEY `idx_alt` (alarm_time)  COMMENT '时间',
    KEY `idx_dst` (device_id, alarm_status, alarm_time)  COMMENT '联合'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警记录';

-- ai_review_record
CREATE TABLE IF NOT EXISTS `ai_review_record` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键',
    `alarm_id` BIGINT NOT NULL  COMMENT '告警ID',
    `device_id` BIGINT NOT NULL  COMMENT '设备ID',
    `image_url` VARCHAR(512) NULL  COMMENT '图片URL',
    `camera_id` VARCHAR(64) NULL  COMMENT '摄像头',
    `review_type` VARCHAR(32) NOT NULL DEFAULT 'SMOKE_FIRE'  COMMENT '类型',
    `review_result` VARCHAR(20) NULL  COMMENT '结果',
    `confidence` DECIMAL(5,2) NULL  COMMENT '置信度',
    `is_manual_review` TINYINT NOT NULL DEFAULT 0  COMMENT '人工复核',
    `manual_review_user_id` BIGINT NULL  COMMENT '复核人',
    `manual_review_result` VARCHAR(32) NULL  COMMENT '人工结果',
    `ai_raw_response` TEXT NULL  COMMENT 'AI原始',
    `processing_time_ms` INT NULL  COMMENT '耗时(ms)',
    `remark` VARCHAR(500) NULL  COMMENT '备注',
    `is_deleted` TINYINT NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50) NULL  COMMENT '创建人',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50) NULL  COMMENT '更新人',
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `idx_aid` (alarm_id)  COMMENT '告警',
    KEY `idx_did2` (device_id)  COMMENT '设备',
    KEY `idx_rr` (review_result)  COMMENT '结果',
    KEY `idx_crt2` (create_time)  COMMENT '时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI视觉复核';

-- broadcast_record
CREATE TABLE IF NOT EXISTS `broadcast_record` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键',
    `alarm_id` BIGINT NOT NULL  COMMENT '告警ID',
    `device_id` BIGINT NOT NULL  COMMENT '设备ID',
    `broadcast_area` VARCHAR(128) NULL  COMMENT '区域',
    `broadcast_content` TEXT NOT NULL  COMMENT '内容',
    `broadcast_type` VARCHAR(32) NOT NULL DEFAULT 'EMERGENCY'  COMMENT '类型',
    `send_status` VARCHAR(16) NOT NULL DEFAULT 'PENDING'  COMMENT '状态',
    `send_time` DATETIME NULL  COMMENT '发送时间',
    `deliver_time` DATETIME NULL  COMMENT '送达时间',
    `failure_reason` TEXT NULL  COMMENT '失败原因',
    `mqtt_topic` VARCHAR(128) NULL  COMMENT 'MQTT Topic',
    `mqtt_message_id` VARCHAR(64) NULL  COMMENT 'MQTT消息',
    `retry_count` INT NULL DEFAULT 0  COMMENT '重试',
    `trigger_mode` VARCHAR(16) NOT NULL DEFAULT 'AUTO'  COMMENT '触发模式',
    `trigger_user_id` BIGINT NULL  COMMENT '触发人',
    `remark` VARCHAR(500) NULL  COMMENT '备注',
    `is_deleted` TINYINT NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50) NULL  COMMENT '创建人',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50) NULL  COMMENT '更新人',
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `idx_aid2` (alarm_id)  COMMENT '告警',
    KEY `idx_did3` (device_id)  COMMENT '设备',
    KEY `idx_ss` (send_status)  COMMENT '状态',
    KEY `idx_st3` (send_time)  COMMENT '时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广播指令';

-- conversation_log
CREATE TABLE IF NOT EXISTS `conversation_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键',
    `user_id` BIGINT NOT NULL  COMMENT '用户ID',
    `alarm_id` BIGINT NULL  COMMENT '告警ID',
    `session_id` VARCHAR(64) NOT NULL  COMMENT '会话ID',
    `question` TEXT NOT NULL  COMMENT '提问',
    `answer` TEXT NULL  COMMENT '回答',
    `source_type` VARCHAR(32) NULL DEFAULT 'RAG'  COMMENT '来源',
    `knowledge_refs` JSON NULL  COMMENT '知识引用',
    `ai_processing_ms` INT NULL  COMMENT '耗时(ms)',
    `user_rating` TINYINT NULL  COMMENT '评分',
    `is_deleted` TINYINT NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_uid2` (user_id)  COMMENT '用户',
    KEY `idx_aid3` (alarm_id)  COMMENT '告警',
    KEY `idx_sid` (session_id)  COMMENT '会话',
    KEY `idx_crt3` (create_time)  COMMENT '时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能问答';

-- operation_log
CREATE TABLE IF NOT EXISTS `operation_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT  COMMENT '主键',
    `user_id` BIGINT NULL  COMMENT '用户ID',
    `username` VARCHAR(64) NULL  COMMENT '用户名',
    `operation_type` VARCHAR(32) NOT NULL  COMMENT '操作类型',
    `operation_target` VARCHAR(64) NULL  COMMENT '操作对象',
    `operation_detail` TEXT NULL  COMMENT '详情',
    `request_ip` VARCHAR(64) NULL  COMMENT 'IP',
    `request_url` VARCHAR(512) NULL  COMMENT 'URL',
    `request_method` VARCHAR(16) NULL  COMMENT '方法',
    `result_code` VARCHAR(16) NULL  COMMENT '结果',
    `error_message` TEXT NULL  COMMENT '错误',
    `execution_time_ms` INT NULL  COMMENT '耗时(ms)',
    `user_agent` VARCHAR(512) NULL  COMMENT 'UA',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '操作时间',
    PRIMARY KEY (`id`),
    KEY `idx_uid3` (user_id)  COMMENT '用户',
    KEY `idx_ot` (operation_type)  COMMENT '类型',
    KEY `idx_crt4` (create_time)  COMMENT '时间',
    KEY `idx_tgt` (operation_target)  COMMENT '对象'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作审计';
