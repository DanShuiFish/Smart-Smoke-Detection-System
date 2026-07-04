package com.smartsmoke.controller;

import com.smartsmoke.common.Result;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/health")
public class HealthController {

    @GetMapping
    public Result<Map<String, Object>> health() {
        return Result.success(Map.of(
            "status", "UP",
            "components", Map.of(
                "mqtt", "UP",
                "redis", "UP"
            )
        ));
    }
}