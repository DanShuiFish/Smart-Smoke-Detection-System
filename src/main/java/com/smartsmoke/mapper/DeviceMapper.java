package com.smartsmoke.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.smartsmoke.entity.SmokeDevice;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DeviceMapper extends BaseMapper<SmokeDevice> {
}