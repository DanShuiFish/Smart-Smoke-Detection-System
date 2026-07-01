package com.smartsmoke.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.smartsmoke.entity.SysUser;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper extends BaseMapper<SysUser> {
}