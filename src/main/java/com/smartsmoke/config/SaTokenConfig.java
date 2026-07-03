package com.smartsmoke.config;

import cn.dev33.satoken.interceptor.SaInterceptor;
import cn.dev33.satoken.router.SaRouter;
import cn.dev33.satoken.stp.StpUtil;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class SaTokenConfig implements WebMvcConfigurer {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 注册 Sa-Token 拦截器
//        registry.addInterceptor(new SaInterceptor(handle -> {
//          SaRouter.match("/api/**")       // 拦截所有 /api 开头的请求
//                    .notMatch("/api/auth/login") // 排除登录接口
//                    .check(r -> StpUtil.checkLogin()); // 校验是否登录
//        })).addPathPatterns("/**");
        registry.addInterceptor(new SaInterceptor(handle -> {
            SaRouter.match("/api/**")
                    .notMatch("/api/auth/login")
                    .notMatch("/api/auth/register")
                    .check(r -> StpUtil.checkLogin());
        })).addPathPatterns("/**");
    }
}
