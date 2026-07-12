package com.smartsmoke.service;

import com.smartsmoke.entity.AlarmRecord;
import com.smartsmoke.entity.BroadcastRecord;
import com.smartsmoke.entity.SmokeDevice;

public interface BroadcastService {

    BroadcastRecord createManualBroadcast(Long alarmId,
                                          Long deviceId,
                                          String broadcastArea,
                                          String broadcastContent,
                                          String broadcastType,
                                          String triggerMode,
                                          Long triggerUserId);

    boolean tryAutoBroadcast(AlarmRecord alarmRecord, SmokeDevice device, String triggerReason);

    /**
     * 区域广播：向同一楼栋+楼层的所有在线设备下发广播。
     * 火情确认后触发，通知同区域所有人员疏散。
     */
    int broadcastAreaByAlarm(AlarmRecord record, SmokeDevice device);
}
