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
}
