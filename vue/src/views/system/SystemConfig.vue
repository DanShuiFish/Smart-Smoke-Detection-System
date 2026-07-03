<template>
  <div class="config-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <el-icon size="20" color="#909399"><Tools /></el-icon>
          <span>系统配置</span>
          <el-tag size="small" type="info" style="margin-left:8px">Key-Value 配置管理</el-tag>
        </div>
      </template>
      <el-table :data="configs" v-loading="loading" border stripe style="width:100%">
        <el-table-column prop="configKey" label="配置键" width="220" />
        <el-table-column label="配置值" min-width="200">
          <template #default="{ row }">
            <el-input v-if="editingId === row.id" v-model="editValue" size="small" />
            <span v-else>{{ row.configValue }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="160" />
        <el-table-column prop="configGroup" label="分组" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ row.configGroup }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button v-if="editingId !== row.id" size="small" type="primary" link icon="Edit" @click="startEdit(row)">编辑</el-button>
            <el-button v-else size="small" type="success" link icon="Check" @click="saveEdit(row)">保存</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Tools, Edit, Check } from '@element-plus/icons-vue'
import request from '../../api/request.js'

const configs = ref([])
const loading = ref(false)
const editingId = ref(null)
const editValue = ref('')

async function fetchConfigs() {
  loading.value = true
  try {
    const res = await request({ url: '/configs', method: 'get', params: { group: '' } })
    if (res.code === 200) {
      const raw = res.data
      configs.value = Array.isArray(raw) ? raw : (raw && raw.records ? raw.records : [])
    }
  } catch (e) { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

function startEdit(row) {
  editingId.value = row.id
  editValue.value = row.configValue
}

async function saveEdit(row) {
  try {
    await request({ url: '/configs/' + row.id, method: 'put', data: { configValue: editValue.value } })
    row.configValue = editValue.value
    ElMessage.success('更新成功')
    editingId.value = null
  } catch (e) { ElMessage.error('更新失败') }
}

onMounted(fetchConfigs)
</script>

<style scoped>
.config-page { display: flex; flex-direction: column; gap: 16px; }
.card-header { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; }
</style>