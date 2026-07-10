package com.smartsmoke.common;

/**
 * 业务异常 — 用于 Service 层显式抛出，Controller/GlobalExceptionHandler 统一捕获返回 400。
 */
public class BusinessException extends RuntimeException {

    private final int code;

    public BusinessException(String message) {
        super(message);
        this.code = 400;
    }

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() { return code; }
}
