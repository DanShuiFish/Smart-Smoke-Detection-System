package com.smartsmoke.common;
import com.baomidou.mybatisplus.core.metadata.IPage;
import lombok.Data;
import java.util.List;
@Data
public class PageResult<T> {
    private long page; private long pageSize; private long total; private long pages; private List<T> records;
    public static <T> PageResult<T> of(IPage<T> p) {
        PageResult<T> r = new PageResult<>();
        r.page = p.getCurrent(); r.pageSize = p.getSize(); r.total = p.getTotal(); r.pages = p.getPages(); r.records = p.getRecords();
        return r;
    }
}