<template>
  <div class="alarm-page">
    <el-alert
      v-if="isResident" title="您当前为居民角色，仅展示与您绑定的设备告警"
      type="info" show-icon :closable="false" style="margin-bottom:8px"
    />
    <el-card class="search-card">
      <el-form :inline="true" :model="query" size="small" @keyup.enter="handleSearch">
        <el-form-item label="告警状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width:140px">
            <el-option label="待确认" value="PENDING" />
            <el-option label="确认中" value="CONFIRMING" />
            <el-option label="已确认" value="CONFIRMED" />
            <el-option label="已处置" value="RESOLVED" />
            <el-option label="已归档" value="ARCHIVED" />
          </el-select>
        </el-form-item>
        <el-form-item label="告警类型">
          <el-select v-model="query.type" placeholder="全部" clearable style="width:140px">
            <el-option label="烟雾超标" value="SMOKE_OVERFLOW" />
            <el-option label="设备离线" value="DEVICE_OFFLINE" />
            <el-option label="设备故障" value="DEVICE_ERROR" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange" type="datetimerange"
            value-format="YYYY-MM-DDTHH:mm:ss"
            range-separator="至" start-placeholder="开始" end-placeholder="结束"
            style="width:340px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleSearch">查询</el-button>
          <el-button icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table :data="alarms" v-loading="loading" border stripe style="width:100%">
        <el-table-column prop="alarmCode" label="告警编号" width="170" fixed />
        <el-table-column label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="typeType(row.alarmType)" size="small">{{ typeLabel(row.alarmType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="levelType(row.alarmLevel)" size="small" effect="dark">{{ levelLabel(row.alarmLevel) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.alarmStatus)" size="small">{{ statusLabel(row.alarmStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deviceId" label="设备ID" width="70" align="center" />
        <el-table-column label="浓度" width="90" align="center">
          <template #default="{ row }">{{ row.smokeConcentration ?? "-" }}</template>
        </el-table-column>
        <el-table-column label="告警时间" width="160">
          <template #default="{ row }">{{ row.alarmTime || "-" }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" link icon="View" @click="handleView(row)">详情</el-button>
            <el-button v-if="canDo('alarmConfirm') && (row.alarmStatus==='PENDING'||row.alarmStatus==='CONFIRMING')"
              size="small" type="warning" link icon="Select" @click="handleConfirm(row)">确认</el-button>
            <el-button v-if="canDo('alarmResolve') && row.alarmStatus==='CONFIRMED'"
              size="small" type="success" link icon="Check" @click="openResolve(row)">处置</el-button>
            <span v-if="!canDo('alarmConfirm') && !canDo('alarmResolve')">-</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page" v-model:page-size="pageSize"
        :total="total" layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[10, 20, 50]"
        @current-change="fetchAlarms" @size-change="fetchAlarms"
        class="pagination"
      />
    </el-card>

    <el-dialog v-model="detailVisible" title="告警详情" width="600px">
      <el-descriptions :column="2" border size="small" v-if="detail">
        <el-descriptions-item label="告警编号">{{ detail.alarmCode }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ typeLabel(detail.alarmType) }}</el-descriptions-item>
        <el-descriptions-item label="级别">{{ levelLabel(detail.alarmLevel) }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(detail.alarmStatus) }}</el-descriptions-item>
        <el-descriptions-item label="烟雾浓度">{{ detail.smokeConcentration }}</el-descriptions-item>
        <el-descriptions-item label="阈值">{{ detail.thresholdValue }}</el-descriptions-item>
        <el-descriptions-item label="设备ID">{{ detail.deviceId }}</el-descriptions-item>
        <el-descriptions-item label="告警时间">{{ detail.alarmTime }}</el-descriptions-item>
        <el-descriptions-item label="确认人">{{ detail.confirmUserId || "-" }}</el-descriptions-item>
        <el-descriptions-item label="确认方式">{{ detail.confirmMethod || "-" }}</el-descriptions-item>
        <el-descriptions-item label="处置方式">{{ detail.resolveMethod || "-" }}</el-descriptions-item>
        <el-descriptions-item label="处置详情" :span="2">{{ detail.resolveDetail || "-" }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <el-dialog v-model="resolveVisible" title="处置告警" width="500px">
      <el-form ref="resolveFormRef" :model="resolveForm" :rules="resolveRules" label-width="90px" size="small">
        <el-form-item label="处置方式" prop="resolveMethod">
          <el-select v-model="resolveForm.resolveMethod" style="width:100%">
            <el-option label="现场处置" value="ON_SITE" />
            <el-option label="远程处置" value="REMOTE" />
            <el-option label="误报忽略" value="IGNORE" />
          </el-select>
        </el-form-item>
        <el-form-item label="处置详情" prop="resolveDetail">
          <el-input v-model="resolveForm.resolveDetail" type="textarea" :rows="4" placeholder="描述处置过程..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveVisible = false">取消</el-button>
        <el-button type="primary" :loading="resolving" @click="handleResolve">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, View, Select, Check } from '@element-plus/icons-vue'
import { canDo, getRole } from '../../utils/permissions.js'
import { listAlarms, getAlarm, confirmAlarm, resolveAlarm } from '../../api/alarm.js'

const isResident = computed(() => getRole() === 'RESIDENT')
const alarms = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const query = reactive({ status: '', type: '' })
const dateRange = ref(null)

function typeType(v) { return { SMOKE_OVERFLOW: 'danger', DEVICE_OFFLINE: 'warning', DEVICE_ERROR: 'danger' }[v] || 'info' }
function typeLabel(v) { return { SMOKE_OVERFLOW: '烟雾超标', DEVICE_OFFLINE: '设备离线', DEVICE_ERROR: '设备故障' }[v] || v }
function levelType(v) { return { LOW: 'info', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' }[v] || 'info' }
function levelLabel(v) { return { LOW: '一般', MEDIUM: '中等', HIGH: '严重', CRITICAL: '紧急' }[v] || v }
function statusType(v) { return { PENDING: 'danger', CONFIRMING: 'warning', CONFIRMED: 'primary', RESOLVED: 'success', ARCHIVED: 'info' }[v] || 'info' }
function statusLabel(v) { return { PENDING: '待确认', CONFIRMING: '确认中', CONFIRMED: '已确认', RESOLVED: '已处置', ARCHIVED: '已归档' }[v] || v }

async function fetchAlarms() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (query.status) params.status = query.status
    if (query.type) params.type = query.type
    if (dateRange.value) {
      params.start = dateRange.value[0]
      params.end = dateRange.value[1]
    }
    const res = await listAlarms(params)
    if (res.code === 200 && res.data) {
      alarms.value = res.data.records || []
      total.value = res.data.total || 0
    }
  } catch (e) {
    ElMessage.error('加载告警列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() { page.value = 1; fetchAlarms() }
function handleReset() { query.status = ''; query.type = ''; dateRange.value = null; page.value = 1; fetchAlarms() }

const detailVisible = ref(false)
const detail = ref(null)
async function handleView(row) {
  try {
    const res = await getAlarm(row.id)
    if (res.code === 200) { detail.value = res.data; detailVisible.value = true }
  } catch (e) { ElMessage.error('获取详情失败') }
}

async function handleConfirm(row) {
  ElMessageBox.confirm('确认告警【' + row.alarmCode + '】？', '提示', {
    confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning'
  }).then(async () => {
    await confirmAlarm(row.id, 'MANUAL')
    ElMessage.success('已确认')
    fetchAlarms()
  }).catch(() => {})
}

const resolveVisible = ref(false)
const resolveFormRef = ref(null)
const resolveForm = reactive({ resolveMethod: 'ON_SITE', resolveDetail: '' })
const resolveRules = { resolveMethod: [{ required: true, message: '请选择处置方式', trigger: 'change' }] }
const resolving = ref(false)
let resolveTarget = null

function openResolve(row) {
  resolveTarget = row
  resolveForm.resolveMethod = 'ON_SITE'
  resolveForm.resolveDetail = ''
  resolveVisible.value = true
}

async function handleResolve() {
  const valid = await resolveFormRef.value.validate().catch(() => false)
  if (!valid || !resolveTarget) return
  resolving.value = true
  try {
    await resolveAlarm(resolveTarget.id, {
      resolveUserId: JSON.parse(localStorage.getItem('smoke_user') || '{}').userId || 1,
      resolveMethod: resolveForm.resolveMethod,
      resolveDetail: resolveForm.resolveDetail
    })
    ElMessage.success('处置成功')
    resolveVisible.value = false
    fetchAlarms()
  } catch (e) { ElMessage.error('处置失败') }
  finally { resolving.value = false }
}

onMounted(fetchAlarms)
</script>

<style scoped>
.alarm-page { display: flex; flex-direction: column; gap: 16px; }
.search-card .el-form { margin-bottom: -18px; }
.pagination { margin-top: 16px; justify-content: center; }
</style>