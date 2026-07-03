<template>
  <div class="device-page">
    <el-card class="search-card">
      <el-form :inline="true" :model="query" size="small" @keyup.enter="handleSearch">
        <el-form-item label="设备名称">
          <el-input v-model="query.deviceName" placeholder="搜索名称" clearable style="width:180px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width:140px">
            <el-option label="在线" value="ONLINE" />
            <el-option label="离线" value="OFFLINE" />
            <el-option label="故障" value="ERROR" />
            <el-option label="未激活" value="INACTIVE" />
          </el-select>
        </el-form-item>
        <el-form-item label="楼栋">
          <el-input v-model="query.building" placeholder="输入楼栋" clearable style="width:150px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleSearch">查询</el-button>
          <el-button icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
        <el-form-item v-if="canDo('deviceCreate')">
          <el-button type="success" icon="Plus" @click="openDialog()">新增设备</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table :data="devices" v-loading="loading" border stripe style="width:100%">
        <el-table-column prop="deviceId" label="设备编号" width="130" fixed />
        <el-table-column prop="deviceName" label="设备名称" min-width="140" />
        <el-table-column prop="deviceModel" label="型号" width="110" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="dark">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="位置" min-width="160">
          <template #default="{ row }">
            {{ [row.locationBuilding, row.locationFloor, row.locationRoom].filter(Boolean).join(" - ") || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="battery" label="电量" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="batteryType(row.battery)" size="small">{{ row.battery ?? "-" }}%</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="signalStrength" label="信号" width="70" align="center">
          <template #default="{ row }">{{ row.signalStrength ?? "-" }}</template>
        </el-table-column>
        <el-table-column label="最后心跳" width="160">
          <template #default="{ row }">{{ row.lastHeartbeat || "-" }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" link icon="Edit" @click="openDialog(row)" v-if="canDo('deviceEdit')">编辑</el-button>
            <el-button size="small" type="danger" link icon="Delete" @click="handleDelete(row)" v-if="canDo('deviceDelete')">删除</el-button>
            <span v-if="!canDo('deviceEdit') && !canDo('deviceDelete')">-</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page" v-model:page-size="pageSize"
        :total="total" layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[10, 20, 50]"
        @current-change="fetchDevices" @size-change="fetchDevices"
        class="pagination"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑设备' : '新增设备'" width="600px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" size="small">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="设备编号" prop="deviceId">
              <el-input v-model="form.deviceId" :disabled="isEdit" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备名称" prop="deviceName">
              <el-input v-model="form.deviceName" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="设备型号" prop="deviceModel">
              <el-input v-model="form.deviceModel" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="form.status" style="width:100%">
                <el-option label="在线" value="ONLINE" />
                <el-option label="离线" value="OFFLINE" />
                <el-option label="故障" value="ERROR" />
                <el-option label="未激活" value="INACTIVE" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="楼栋" prop="locationBuilding">
              <el-input v-model="form.locationBuilding" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="楼层" prop="locationFloor">
              <el-input v-model="form.locationFloor" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="位置" prop="locationRoom">
              <el-input v-model="form.locationRoom" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="电量(%)" prop="battery">
              <el-input-number v-model="form.battery" :min="0" :max="100" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="固件版本" prop="firmwareVersion">
              <el-input v-model="form.firmwareVersion" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus, Edit, Delete } from '@element-plus/icons-vue'
import { canDo } from '../../utils/permissions.js'
import { listDevices, createDevice, updateDevice, deleteDevice } from '../../api/device.js'

const devices = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const query = reactive({ deviceName: '', status: '', building: '' })

function statusType(s) {
  return { ONLINE: 'success', OFFLINE: 'info', ERROR: 'danger', INACTIVE: 'warning' }[s] || 'info'
}
function statusLabel(s) {
  return { ONLINE: '在线', OFFLINE: '离线', ERROR: '故障', INACTIVE: '未激活' }[s] || s
}
function batteryType(v) {
  if (v == null) return 'info'
  if (v <= 20) return 'danger'
  if (v <= 50) return 'warning'
  return 'success'
}

async function fetchDevices() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (query.status) params.status = query.status
    if (query.building) params.building = query.building
    if (query.deviceName) params.keyword = query.deviceName
    const res = await listDevices(params)
    if (res.code === 200 && res.data) {
      devices.value = res.data.records || []
      total.value = res.data.total || 0
    }
  } catch (e) {
    ElMessage.error('加载设备列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() { page.value = 1; fetchDevices() }
function handleReset() { query.deviceName = ''; query.status = ''; query.building = ''; page.value = 1; fetchDevices() }

const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = reactive({
  deviceId: '', deviceName: '', deviceModel: '', status: 'ONLINE',
  locationBuilding: '', locationFloor: '', locationRoom: '',
  battery: 100, firmwareVersion: '', remark: ''
})
const rules = {
  deviceId: [{ required: true, message: '请输入设备编号', trigger: 'blur' }],
  deviceName: [{ required: true, message: '请输入设备名称', trigger: 'blur' }]
}

function openDialog(row) {
  isEdit.value = !!row
  if (row) {
    Object.assign(form, row)
  } else {
    Object.assign(form, { deviceId: '', deviceName: '', deviceModel: '', status: 'ONLINE',
      locationBuilding: '', locationFloor: '', locationRoom: '',
      battery: 100, firmwareVersion: '', remark: '' })
  }
  dialogVisible.value = true
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (isEdit.value) {
      await updateDevice(form.id, form)
      ElMessage.success('更新成功')
    } else {
      await createDevice(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchDevices()
  } catch (e) {
    ElMessage.error(e.response?.data?.msg || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  ElMessageBox.confirm('确定删除设备【' + row.deviceName + '】？', '提示', {
    confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
  }).then(async () => {
    await deleteDevice(row.id)
    ElMessage.success('已删除')
    fetchDevices()
  }).catch(() => {})
}

onMounted(fetchDevices)
</script>

<style scoped>
.device-page { display: flex; flex-direction: column; gap: 16px; }
.search-card .el-form { margin-bottom: -18px; }
.table-card { padding-bottom: 0; }
.pagination { margin-top: 16px; justify-content: center; }
</style>