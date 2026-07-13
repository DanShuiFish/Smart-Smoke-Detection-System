# Task 1 Report: Bug 修复 — 关闭后台 DEBUG 和 SQL 日志

## Changes Made

**File:** `src/main/resources/application.yml`

1. Changed `logging.level.com.smartsmoke` from `debug` to `warn`
2. Removed `mybatis-plus.configuration.log-impl: org.apache.ibatis.logging.slf4j.Slf4jImpl` (SQL logging)

## Verification

Both changes confirmed by reading the file after edits:
- Line 64: `com.smartsmoke: warn` -- only WARN and ERROR will appear in console
- Lines 49-50: The `configuration` block now only has `map-underscore-to-camel-case: true` -- no more MyBatis SQL logging

## Commit

`722c084` - "fix: 关闭 DEBUG 日志和 MyBatis SQL 日志输出"

## Fix Report

**Problem:** Commit 722c084 included 5 unintended config changes beyond the task scope:
- DB_URL default: localhost -> 10.100.42.60
- DB_PASSWORD default: 123456 -> root
- REDIS_HOST default: 192.168.142.128 -> 10.100.42.60
- MQTT_BROKER_URL default: 192.168.142.128 -> 10.100.42.60
- MAXKB_BASE_URL default: 10.120.67.60 -> 10.100.42.60

**Fix applied:** Reverted all 5 IP/password defaults back to original values while preserving the 2 intended logging changes (`com.smartsmoke: warn` and removal of `log-impl`).

**Status:** DONE
**Commit SHA:** `a6b34a8`
**What was fixed:** Reverted 5 unrelated config defaults in `src/main/resources/application.yml` (DB_URL, DB_PASSWORD, REDIS_HOST, MQTT_BROKER_URL, MAXKB_BASE_URL) to their pre-722c084 values.
