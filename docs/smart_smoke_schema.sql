-- ================================================================
-- 智慧烟感预警系统 - 数据库初始化脚本 v1.0
-- 字符集: utf8mb4 | 引擎: InnoDB
-- 使用: Navicat 打开此文件 -> 全选 -> 运行
-- ================================================================

CREATE DATABASE IF NOT EXISTS `smart_smoke`
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci
    COMMENT '智慧烟感预警系统数据库';

USE `smart_smoke`;

-- --------------------------------------------------------------------------
-- system_config - 系统配置表（key-value结构，新增配置无需改表）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_config` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `config_key` VARCHAR(100)    NOT NULL  COMMENT '配置键（唯一标识）',
    `config_value` TEXT            NULL  COMMENT '配置值',
    `config_group` VARCHAR(50)     NULL DEFAULT 'DEFAULT'  COMMENT '配置分组',
    `description` VARCHAR(255)    NULL  COMMENT '配置说明',
    `sort_order` INT             NULL DEFAULT 0  COMMENT '排序号',
    `is_deleted` TINYINT         NOT NULL DEFAULT 0  COMMENT '逻辑删除：0-未删 1-已删',
    `create_by` VARCHAR(50)     NULL  COMMENT '创建人',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50)     NULL  COMMENT '更新人',
    `update_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    UNIQUE KEY `uk_config_key` (config_key)  COMMENT '配置键唯一索引',
    KEY `idx_config_group` (config_group)  COMMENT '配置分组索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表（key-value结构，新增配置无需改表）';

-- --------------------------------------------------------------------------
-- smoke_device - 烟感设备表（设备基础信息与当前状态）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `smoke_device` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `device_id` VARCHAR(64)     NOT NULL  COMMENT '设备唯一编号（与硬件烧录ID一致）',
    `device_name` VARCHAR(128)    NULL  COMMENT '设备名称',
    `device_model` VARCHAR(64)     NULL  COMMENT '设备型号（如Hi3861V100）',
    `device_secret` VARCHAR(128)    NULL  COMMENT '设备密钥（接入认证用）',
    `firmware_version` VARCHAR(32)     NULL  COMMENT '固件版本号',
    `status` VARCHAR(16)     NOT NULL DEFAULT 'OFFLINE'  COMMENT '设备状态：ONLINE-在线 OFFLINE-离线 ERROR-故障 INACTIVE-未激活',
    `battery` INT             NULL DEFAULT 100  COMMENT '电池电量（百分比0~100）',
    `signal_strength` INT             NULL  COMMENT '信号强度（RSSI dBm）',
    `location_building` VARCHAR(128)    NULL  COMMENT '所在楼栋',
    `location_floor` VARCHAR(32)     NULL  COMMENT '所在楼层',
    `location_room` VARCHAR(128)    NULL  COMMENT '具体位置描述',
    `location_lat` DECIMAL(10,6)   NULL  COMMENT 'GPS纬度（地图展示预留）',
    `location_lng` DECIMAL(10,6)   NULL  COMMENT 'GPS经度（地图展示预留）',
    `extra_attrs` JSON            NULL  COMMENT '扩展属性（设备特有字段，无需改表）',
    `install_date` DATETIME        NULL  COMMENT '安装日期',
    `last_online_time` DATETIME        NULL  COMMENT '最后上线时间',
    `last_offline_time` DATETIME        NULL  COMMENT '最后离线时间',
    `last_heartbeat` DATETIME        NULL  COMMENT '最后心跳时间',
    `heartbeat_timeout` INT             NULL DEFAULT 30  COMMENT '心跳超时阈值（秒），可单独配置',
    `sort_order` INT             NULL DEFAULT 0  COMMENT '排序号',
    `remark` VARCHAR(500)    NULL  COMMENT '备注',
    `is_deleted` TINYINT         NOT NULL DEFAULT 0  COMMENT '逻辑删除：0-未删 1-已删',
    `create_by` VARCHAR(50)     NULL  COMMENT '创建人',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50)     NULL  COMMENT '更新人',
    `update_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    UNIQUE KEY `uk_device_id` (device_id)  COMMENT '设备编号唯一索引',
    KEY `idx_status` (status)  COMMENT '设备状态过滤',
    KEY `idx_location` (location_building, location_floor)  COMMENT '楼栋+楼层联合查询',
    KEY `idx_last_heartbeat` (last_heartbeat)  COMMENT '心跳时间索引（离线判定）',
    KEY `idx_is_deleted` (is_deleted)  COMMENT '逻辑删除过滤'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='烟感设备表（设备基础信息与当前状态）';

-- --------------------------------------------------------------------------
-- sys_user - 系统用户表（支持居民/小区管理员/系统管理员/消防员四种角色）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sys_user` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `username` VARCHAR(64)     NOT NULL  COMMENT '登录用户名',
    `password` VARCHAR(256)    NOT NULL  COMMENT '登录密码（BCrypt加密）',
    `real_name` VARCHAR(64)     NULL  COMMENT '真实姓名',
    `phone` VARCHAR(20)     NULL  COMMENT '手机号码',
    `email` VARCHAR(128)    NULL  COMMENT '电子邮箱',
    `avatar` VARCHAR(256)    NULL  COMMENT '头像URL',
    `role` VARCHAR(32)     NOT NULL DEFAULT 'RESIDENT'  COMMENT '角色：RESIDENT-居民 COMMUNITY_ADMIN-小区管理员 SYSTEM_ADMIN-系统管理员 FIREFIGHTER-消防员',
    `status` VARCHAR(16)     NOT NULL DEFAULT 'ENABLED'  COMMENT '状态：ENABLED-启用 DISABLED-禁用 LOCKED-锁定',
    `user_ext` JSON            NULL  COMMENT '扩展字段（不同角色存不同属性）',
    `last_login_ip` VARCHAR(64)     NULL  COMMENT '最后登录IP',
    `last_login_time` DATETIME        NULL  COMMENT '最后登录时间',
    `login_count` INT             NULL DEFAULT 0  COMMENT '累计登录次数',
    `is_deleted` TINYINT         NOT NULL DEFAULT 0  COMMENT '逻辑删除：0-未删 1-已删',
    `create_by` VARCHAR(50)     NULL  COMMENT '创建人',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50)     NULL  COMMENT '更新人',
    `update_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    UNIQUE KEY `uk_username` (username)  COMMENT '用户名唯一索引',
    KEY `idx_role` (role)  COMMENT '按角色查询用户列表',
    KEY `idx_phone` (phone)  COMMENT '手机号索引',
    KEY `idx_status` (status)  COMMENT '状态过滤'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户表（支持居民/小区管理员/系统管理员/消防员四种角色）';

-- --------------------------------------------------------------------------
-- device_binding - 设备-用户绑定关系表（多对多，支持解绑历史留痕）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `device_binding` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `device_id` BIGINT          NOT NULL  COMMENT '设备ID（关联smoke_device.id）',
    `user_id` BIGINT          NOT NULL  COMMENT '用户ID（关联sys_user.id）',
    `bind_type` VARCHAR(16)     NOT NULL DEFAULT 'OWNER'  COMMENT '绑定类型：OWNER-拥有者 ADMIN-管理员 VIEWER-观察者',
    `bind_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '绑定时间',
    `unbind_time` DATETIME        NULL  COMMENT '解绑时间',
    `status` VARCHAR(16)     NOT NULL DEFAULT 'BOUND'  COMMENT '绑定状态：BOUND-已绑定 UNBOUND-已解绑',
    `remark` VARCHAR(500)    NULL  COMMENT '备注',
    `is_deleted` TINYINT         NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50)     NULL  COMMENT '创建人',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50)     NULL  COMMENT '更新人',
    `update_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    UNIQUE KEY `uk_device_user` (device_id, user_id, status)  COMMENT '同一用户对同一设备仅一条有效绑定',
    KEY `idx_device_id` (device_id)  COMMENT '按设备查用户',
    KEY `idx_user_id` (user_id)  COMMENT '按用户查设备',
    KEY `idx_bind_status` (status)  COMMENT '过滤有效/已解绑'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备-用户绑定关系表（多对多，支持解绑历史留痕）';

-- --------------------------------------------------------------------------
-- sensor_data - 传感器数据表（只追加不修改，量大按时间分区）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sensor_data` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `device_id` BIGINT          NOT NULL  COMMENT '设备ID（关联smoke_device.id）',
    `smoke_concentration` DECIMAL(10,4)   NOT NULL  COMMENT '烟雾浓度值（mg/m3）',
    `temperature` DECIMAL(6,2)    NULL  COMMENT '温度值（°C）',
    `humidity` DECIMAL(5,2)    NULL  COMMENT '湿度值（%RH）',
    `unit` VARCHAR(16)     NULL DEFAULT 'mg/m3'  COMMENT '浓度单位',
    `is_alert` TINYINT         NOT NULL DEFAULT 0  COMMENT '是否触发告警：0-未触发 1-已触发',
    `extra_data` JSON            NULL  COMMENT '扩展数据（附加传感器字段）',
    `collect_time` DATETIME        NOT NULL  COMMENT '数据采集时间',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '入库时间',
    KEY `idx_device_time` (device_id, collect_time)  COMMENT '按设备+时间查询（历史趋势核心索引）',
    KEY `idx_collect_time` (collect_time)  COMMENT '按时间范围检索',
    KEY `idx_create_time` (create_time)  COMMENT '入库时间索引',
    KEY `idx_is_alert` (is_alert, collect_time)  COMMENT '告警标记+时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='传感器数据表（只追加不修改，量大按时间分区）';

-- --------------------------------------------------------------------------
-- alert_threshold - 告警阈值配置表（全局默认+设备级覆盖+分时段多级阈值）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `alert_threshold` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `device_id` BIGINT          NULL  COMMENT '设备ID（NULL=全局默认，非NULL=设备个性覆盖）',
    `threshold_type` VARCHAR(32)     NOT NULL  COMMENT '类型：SMOKE_CONCENTRATION-烟雾 TEMPERATURE-温度',
    `alarm_level` VARCHAR(16)     NOT NULL DEFAULT 'MEDIUM'  COMMENT '级别：LOW-轻度 MEDIUM-中度 HIGH-重度 CRITICAL-严重',
    `threshold_min` DECIMAL(10,4)   NULL  COMMENT '阈值下限',
    `threshold_max` DECIMAL(10,4)   NOT NULL  COMMENT '阈值上限',
    `duration_seconds` INT             NULL DEFAULT 0  COMMENT '持续秒数（防抖）',
    `effective_start` TIME            NULL DEFAULT '00:00:00'  COMMENT '生效时段-开始',
    `effective_end` TIME            NULL DEFAULT '23:59:59'  COMMENT '生效时段-结束',
    `silent_period` INT             NULL DEFAULT 300  COMMENT '告警静默期（秒）',
    `is_default` TINYINT         NOT NULL DEFAULT 0  COMMENT '是否为全局默认',
    `status` VARCHAR(16)     NOT NULL DEFAULT 'ENABLED'  COMMENT '状态：ENABLED-启用 DISABLED-禁用',
    `sort_order` INT             NULL DEFAULT 0  COMMENT '排序号（越小越优先匹配）',
    `remark` VARCHAR(500)    NULL  COMMENT '备注',
    `is_deleted` TINYINT         NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50)     NULL  COMMENT '创建人',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50)     NULL  COMMENT '更新人',
    `update_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    KEY `idx_device_type` (device_id, threshold_type)  COMMENT '设备+类型查询阈值',
    KEY `idx_threshold_type` (threshold_type)  COMMENT '按类型查全局阈值'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警阈值配置表（全局默认+设备级覆盖+分时段多级阈值）';

-- --------------------------------------------------------------------------
-- alarm_record - 告警记录表（核心业务：触发 -> 复核 -> 处置 -> 归档全链路）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `alarm_record` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `device_id` BIGINT          NOT NULL  COMMENT '设备ID（关联smoke_device.id）',
    `sensor_data_id` BIGINT          NULL  COMMENT '触发告警的传感器数据ID',
    `alarm_code` VARCHAR(64)     NOT NULL  COMMENT '告警编号（业务唯一标识）',
    `alarm_type` VARCHAR(32)     NOT NULL  COMMENT '类型：SMOKE_OVERFLOW-烟雾超标 DEVICE_OFFLINE-离线 DEVICE_ERROR-故障',
    `alarm_level` VARCHAR(16)     NOT NULL  COMMENT '级别：LOW-一般 MEDIUM-中等 HIGH-严重 CRITICAL-紧急',
    `alarm_status` VARCHAR(20)     NOT NULL DEFAULT 'PENDING'  COMMENT '状态机：PENDING-CONFIRMING-CONFIRMED-RESOLVED-ARCHIVED-CLOSED',
    `smoke_concentration` DECIMAL(10,4)   NULL  COMMENT '触发时的烟雾浓度',
    `threshold_value` DECIMAL(10,4)   NULL  COMMENT '触发时的阈值',
    `alarm_time` DATETIME        NOT NULL  COMMENT '告警触发时间',
    `confirm_time` DATETIME        NULL  COMMENT '确认时间',
    `confirm_user_id` BIGINT          NULL  COMMENT '确认人ID',
    `confirm_method` VARCHAR(32)     NULL  COMMENT '确认方式：MANUAL-人工 AUTO_VISION-AI视觉',
    `resolve_time` DATETIME        NULL  COMMENT '处置时间',
    `resolve_user_id` BIGINT          NULL  COMMENT '处置人ID',
    `resolve_method` VARCHAR(32)     NULL  COMMENT '处置方式：ON_SITE-现场 REMOTE-远程 IGNORE-误报',
    `resolve_detail` TEXT            NULL  COMMENT '处置详情',
    `is_vision_reviewed` TINYINT         NOT NULL DEFAULT 0  COMMENT '是否已视觉复核',
    `is_broadcast_sent` TINYINT         NOT NULL DEFAULT 0  COMMENT '是否已下发广播',
    `alarm_ext` JSON            NULL  COMMENT '扩展字段',
    `remark` VARCHAR(500)    NULL  COMMENT '备注',
    `is_deleted` TINYINT         NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50)     NULL  COMMENT '创建人',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50)     NULL  COMMENT '更新人',
    `update_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    UNIQUE KEY `uk_alarm_code` (alarm_code)  COMMENT '告警编号唯一',
    KEY `idx_device_id` (device_id)  COMMENT '按设备查告警',
    KEY `idx_alarm_status` (alarm_status)  COMMENT '按状态过滤',
    KEY `idx_alarm_type` (alarm_type)  COMMENT '按类型查询',
    KEY `idx_alarm_level` (alarm_level)  COMMENT '按级别查询',
    KEY `idx_alarm_time` (alarm_time)  COMMENT '按时间查询（趋势分析）',
    KEY `idx_device_status_time` (device_id, alarm_status, alarm_time)  COMMENT '设备+状态+时间联合索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警记录表（核心业务：触发 -> 复核 -> 处置 -> 归档全链路）';

-- --------------------------------------------------------------------------
-- ai_review_record - AI视觉复核记录表（SmartJavaAI视觉分析结果持久化）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_review_record` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `alarm_id` BIGINT          NOT NULL  COMMENT '关联告警ID',
    `device_id` BIGINT          NOT NULL  COMMENT '设备ID（冗余，方便独立查询）',
    `image_url` VARCHAR(512)    NULL  COMMENT '摄像头画面URL',
    `camera_id` VARCHAR(64)     NULL  COMMENT '摄像头编号',
    `review_type` VARCHAR(32)     NOT NULL DEFAULT 'SMOKE_FIRE'  COMMENT '复核类型：SMOKE_FIRE-烟雾明火检测',
    `review_result` VARCHAR(20)     NULL  COMMENT '结果：FIRE_CONFIRMED-确认 NO_FIRE-排除 UNCERTAIN-不确定',
    `confidence` DECIMAL(5,2)    NULL  COMMENT 'AI置信度（0.00~100.00）',
    `is_manual_review` TINYINT         NOT NULL DEFAULT 0  COMMENT '是否人工复核确认',
    `manual_review_user_id` BIGINT          NULL  COMMENT '人工复核人ID',
    `manual_review_result` VARCHAR(32)     NULL  COMMENT '人工复核结果：CONFIRMED-确认 DISMISSED-排除',
    `ai_raw_response` TEXT            NULL  COMMENT 'AI原始返回（JSON字符串）',
    `processing_time_ms` INT             NULL  COMMENT 'AI处理耗时（毫秒）',
    `remark` VARCHAR(500)    NULL  COMMENT '备注',
    `is_deleted` TINYINT         NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50)     NULL  COMMENT '创建人',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50)     NULL  COMMENT '更新人',
    `update_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    KEY `idx_alarm_id` (alarm_id)  COMMENT '按告警查复核',
    KEY `idx_device_id` (device_id)  COMMENT '按设备查复核历史',
    KEY `idx_review_result` (review_result)  COMMENT '按结果统计',
    KEY `idx_create_time` (create_time)  COMMENT '时间排序'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI视觉复核记录表（SmartJavaAI视觉分析结果持久化）';

-- --------------------------------------------------------------------------
-- broadcast_record - 广播指令记录表（告警联动广播全链路追踪）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `broadcast_record` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `alarm_id` BIGINT          NOT NULL  COMMENT '关联告警ID',
    `device_id` BIGINT          NOT NULL  COMMENT '设备ID（冗余）',
    `broadcast_area` VARCHAR(128)    NULL  COMMENT '广播区域描述',
    `broadcast_content` TEXT            NOT NULL  COMMENT '广播内容',
    `broadcast_type` VARCHAR(32)     NOT NULL DEFAULT 'EMERGENCY'  COMMENT '类型：EMERGENCY-紧急疏散 NOTIFICATION-通知 TEST-测试',
    `send_status` VARCHAR(16)     NOT NULL DEFAULT 'PENDING'  COMMENT '状态：PENDING-SENDING-SENT/DELIVERED/FAILED',
    `send_time` DATETIME        NULL  COMMENT '发送时间',
    `deliver_time` DATETIME        NULL  COMMENT '送达时间',
    `failure_reason` TEXT            NULL  COMMENT '失败原因',
    `mqtt_topic` VARCHAR(128)    NULL  COMMENT 'MQTT下发Topic',
    `mqtt_message_id` VARCHAR(64)     NULL  COMMENT 'MQTT消息ID',
    `retry_count` INT             NULL DEFAULT 0  COMMENT '重试次数',
    `trigger_mode` VARCHAR(16)     NOT NULL DEFAULT 'AUTO'  COMMENT '触发模式：AUTO-自动 MANUAL-手动',
    `trigger_user_id` BIGINT          NULL  COMMENT '触发人ID',
    `remark` VARCHAR(500)    NULL  COMMENT '备注',
    `is_deleted` TINYINT         NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_by` VARCHAR(50)     NULL  COMMENT '创建人',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `update_by` VARCHAR(50)     NULL  COMMENT '更新人',
    `update_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  COMMENT '更新时间',
    KEY `idx_alarm_id` (alarm_id)  COMMENT '按告警查广播',
    KEY `idx_device_id` (device_id)  COMMENT '按设备查广播',
    KEY `idx_send_status` (send_status)  COMMENT '按状态过滤',
    KEY `idx_send_time` (send_time)  COMMENT '时间排序'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广播指令记录表（告警联动广播全链路追踪）';

-- --------------------------------------------------------------------------
-- conversation_log - 智能问答日志表（AI智能体对话记录，RAG效果审计）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conversation_log` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `user_id` BIGINT          NOT NULL  COMMENT '提问用户ID',
    `alarm_id` BIGINT          NULL  COMMENT '关联告警ID（可选）',
    `session_id` VARCHAR(64)     NOT NULL  COMMENT '会话ID（同一轮对话上下文）',
    `question` TEXT            NOT NULL  COMMENT '用户提问',
    `answer` TEXT            NULL  COMMENT 'AI回答',
    `source_type` VARCHAR(32)     NULL DEFAULT 'RAG'  COMMENT '来源：RAG-知识库 LLM-大模型 HYBRID-混合',
    `knowledge_refs` JSON            NULL  COMMENT '引用的知识片段列表',
    `ai_processing_ms` INT             NULL  COMMENT 'AI处理耗时（毫秒）',
    `user_rating` TINYINT         NULL  COMMENT '用户评分（1~5，NULL=未评）',
    `is_deleted` TINYINT         NOT NULL DEFAULT 0  COMMENT '逻辑删除',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '提问时间',
    KEY `idx_user_id` (user_id)  COMMENT '按用户查对话',
    KEY `idx_alarm_id` (alarm_id)  COMMENT '按告警查相关问答',
    KEY `idx_session_id` (session_id)  COMMENT '追踪同一轮对话',
    KEY `idx_create_time` (create_time)  COMMENT '时间排序'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能问答日志表（AI智能体对话记录，RAG效果审计）';

-- --------------------------------------------------------------------------
-- operation_log - 操作审计日志表（用户关键操作全记录，安全追溯）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `operation_log` (
    `id` BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
    `user_id` BIGINT          NULL  COMMENT '操作用户ID',
    `username` VARCHAR(64)     NULL  COMMENT '用户名（冗余，用户删除后仍可追溯）',
    `operation_type` VARCHAR(32)     NOT NULL  COMMENT '类型：LOGIN DEVICE_BIND ALARM_CONFIRM ALARM_RESOLVE BROADCAST_SEND THRESHOLD_CONFIG SYSTEM_CONFIG',
    `operation_target` VARCHAR(64)     NULL  COMMENT '操作对象标识',
    `operation_detail` TEXT            NULL  COMMENT '操作详情',
    `request_ip` VARCHAR(64)     NULL  COMMENT '请求IP',
    `request_url` VARCHAR(512)    NULL  COMMENT '请求URL',
    `request_method` VARCHAR(16)     NULL  COMMENT 'HTTP方法',
    `result_code` VARCHAR(16)     NULL  COMMENT '结果：SUCCESS-成功 FAILED-失败',
    `error_message` TEXT            NULL  COMMENT '错误信息',
    `execution_time_ms` INT             NULL  COMMENT '执行耗时（毫秒）',
    `user_agent` VARCHAR(512)    NULL  COMMENT '用户代理',
    `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '操作时间',
    KEY `idx_user_id` (user_id)  COMMENT '按用户查操作',
    KEY `idx_operation_type` (operation_type)  COMMENT '按类型统计',
    KEY `idx_create_time` (create_time)  COMMENT '时间范围查询',
    KEY `idx_target` (operation_target)  COMMENT '按对象追溯'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作审计日志表（用户关键操作全记录，安全追溯）';

-- ================================================================
-- 初始化数据
-- ================================================================

-- 系统默认配置
INSERT INTO `system_config` (config_key, config_value, config_group, description, sort_order) VALUES
('heartbeat_timeout_seconds',  '30',       'DEVICE',   '设备心跳超时判定阈值（秒）',    1),
('default_smoke_threshold',    '1.0000',   'ALERT',    '全局默认烟雾浓度告警阈值',       2),
('default_temp_threshold',     '60.00',    'ALERT',    '全局默认温度告警阈值（C）',      3),
('alarm_silent_period_seconds','300',      'ALERT',    '告警静默期（秒）',              4),
('data_retention_days',        '180',      'DATA',     '传感器数据保留天数',             5),
('mock_device_count',          '5',        'MOCK',     '模拟设备数量',                  6),
('mqtt_broker_url',            'tcp://localhost:1883', 'MQTT', 'MQTT Broker地址',      7),
('broker_down_max_retry',      '3',        'MQTT',     'MQTT重连最大重试次数',          8),
('websocket_enabled',          'true',     'SYSTEM',   '是否启用WebSocket实时推送',      9);

-- 全局默认告警阈值
INSERT INTO `alert_threshold` (threshold_type, alarm_level, threshold_min, threshold_max, duration_seconds, is_default, status, sort_order, remark) VALUES
('SMOKE_CONCENTRATION', 'LOW',      0.5000, 1.0000, 10, 1, 'ENABLED', 1, '轻度：浓度0.5~1.0持续10秒'),
('SMOKE_CONCENTRATION', 'MEDIUM',   1.0000, 2.0000, 5,  1, 'ENABLED', 2, '中度：浓度1.0~2.0持续5秒'),
('SMOKE_CONCENTRATION', 'HIGH',     2.0000, 5.0000, 3,  1, 'ENABLED', 3, '重度：浓度2.0~5.0持续3秒'),
('SMOKE_CONCENTRATION', 'CRITICAL', 5.0000, 99.9999, 0, 1, 'ENABLED', 4, '严重：浓度>5.0立即触发'),
('TEMPERATURE',         'HIGH',     60.00,  80.00,   10, 1, 'ENABLED', 5, '高温：温度60~80C持续10秒'),
('TEMPERATURE',         'CRITICAL', 80.00,  200.00,  0,  1, 'ENABLED', 6, '严重高温：温度>80C立即触发');

-- 测试用户（密码为占位值，需BCrypt加密后替换）
INSERT INTO `sys_user` (username, password, real_name, role, status, remark) VALUES
('admin',    '$2a$10$PlaceholderHashHere', '系统管理员', 'SYSTEM_ADMIN',    'ENABLED', '系统内置管理员'),
('fireman1', '$2a$10$PlaceholderHashHere', '消防员张三', 'FIREFIGHTER',     'ENABLED', '消防员账号'),
('manager1', '$2a$10$PlaceholderHashHere', '小区管理员李四', 'COMMUNITY_ADMIN', 'ENABLED', '小区管理员账号');
