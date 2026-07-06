-- ================================================================
-- 智慧烟感预警系统 初始数据填充 (PM 维护)
-- ================================================================

-- 默认系统管理员 (密码: admin123)
INSERT IGNORE INTO `sys_user` (`username`, `password`, `real_name`, `phone`, `role`, `status`, `login_count`)
VALUES ('admin', '$2b$12$/E/5i8/dufe63QlXmCZhT.kWCqbwdCjTA/LOzTWsxj2SdDJoh4YHW', '系统管理员', '13800138000', 'SYSTEM_ADMIN', 'ENABLED', 0);

-- 默认小区管理员 (密码: admin123)
INSERT IGNORE INTO `sys_user` (`username`, `password`, `real_name`, `role`, `status`)
VALUES ('community', '$2b$12$/E/5i8/dufe63QlXmCZhT.kWCqbwdCjTA/LOzTWsxj2SdDJoh4YHW', '小区管理员', 'COMMUNITY_ADMIN', 'ENABLED');

-- 示例烟感设备
INSERT IGNORE INTO `smoke_device` (`device_id`, `device_name`, `device_model`, `status`, `battery`, `location_building`, `location_floor`, `location_room`)
VALUES ('SDS-001', '1号楼大厅烟感', 'Hi3861V100', 'ONLINE', 85, '1号楼', '1F', '入户大厅');
INSERT IGNORE INTO `smoke_device` (`device_id`, `device_name`, `device_model`, `status`, `battery`, `location_building`, `location_floor`, `location_room`)
VALUES ('SDS-002', '2号楼走廊烟感', 'Hi3861V100', 'ONLINE', 72, '2号楼', '3F', '走廊东侧');
INSERT IGNORE INTO `smoke_device` (`device_id`, `device_name`, `device_model`, `status`, `battery`, `location_building`, `location_floor`, `location_room`)
VALUES ('SDS-003', '3号楼厨房烟感', 'Hi3861V100', 'OFFLINE', 15, '3号楼', '2F', '厨房');
