package com.smartsmoke.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartsmoke.common.Result;
import com.smartsmoke.entity.SystemConfig;
import com.smartsmoke.service.SystemConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/configs")
@RequiredArgsConstructor
public class SystemConfigController {

    private final SystemConfigService configService;

    @GetMapping
    public Result<List<SystemConfig>> list(@RequestParam(required = false) String group) {
        LambdaQueryWrapper<SystemConfig> qw = new LambdaQueryWrapper<>();
        if (group != null && !group.isEmpty()) {
            qw.eq(SystemConfig::getConfigGroup, group);
        }
        qw.orderByAsc(SystemConfig::getSortOrder);
        return Result.success(configService.list(qw));
    }

    @GetMapping("/{id}")
    public Result<SystemConfig> getById(@PathVariable Long id) {
        return Result.success(configService.getById(id));
    }

    @PutMapping("/{id}")
    public Result<SystemConfig> update(@PathVariable Long id, @RequestBody SystemConfig config) {
        SystemConfig target = configService.getById(id);
        if (target == null) return Result.error(404, "配置不存在");
        if (config.getConfigValue() != null) target.setConfigValue(config.getConfigValue());
        if (config.getDescription() != null) target.setDescription(config.getDescription());
        configService.updateById(target);
        return Result.success(target);
    }
}