package com.smartsmoke.common;

import java.time.format.DateTimeFormatter;

/**
 * 项目共享的日期时间格式常量
 */
public final class DateTimeConst {

    private DateTimeConst() {}

    /** yyyy-MM-dd HH:mm:ss — API 请求/响应的标准时间格式 */
    public static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** yyyyMMdd — 用于生成告警编号日期段 */
    public static final DateTimeFormatter FMT_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");

    /** HHmmss — 用于生成告警编号时间段 */
    public static final DateTimeFormatter FMT_TIME = DateTimeFormatter.ofPattern("HHmmss");
}
