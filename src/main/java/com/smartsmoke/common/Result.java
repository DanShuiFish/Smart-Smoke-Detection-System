package com.smartsmoke.common;
import lombok.Data;
@Data
public class Result<T> {
    private Integer code;
    private String msg;
    private T data;
    private Long timestamp;
    public Result() { this.timestamp = System.currentTimeMillis(); }
    public static <T> Result<T> success(T data) {
        Result<T> r = new Result<>(); r.code = 200; r.msg = "success"; r.data = data; return r;
    }
    public static <T> Result<T> success() { return success(null); }
    public static <T> Result<T> error(Integer code, String msg) {
        Result<T> r = new Result<>(); r.code = code; r.msg = msg; return r;
    }
    public static <T> Result<T> error(String msg) { return error(500, msg); }
}