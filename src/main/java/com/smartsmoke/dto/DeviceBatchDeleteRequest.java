package com.smartsmoke.dto;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import java.util.List;

@Data
public class DeviceBatchDeleteRequest {
    @NotEmpty(message = "删除ID列表不能为空")
    private List<Long> ids;
}
