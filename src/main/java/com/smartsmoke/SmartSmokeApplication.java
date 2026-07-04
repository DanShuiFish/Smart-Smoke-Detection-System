package com.smartsmoke;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SmartSmokeApplication {

    public static void main(String[] args) {
        SpringApplication.run(SmartSmokeApplication.class, args);
        System.out.println("========================================");
        System.out.println("  智慧烟感预警系统启动成功");
        System.out.println("  http://localhost:8080");
        System.out.println("========================================");
    }
    //测试推送1
}
