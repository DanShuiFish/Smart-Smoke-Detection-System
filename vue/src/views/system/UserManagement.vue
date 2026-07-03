<template>
  <div class="user-page">
    <el-card class="search-card">
      <el-form :inline="true" size="small">
        <el-form-item label="角色">
          <el-select v-model="roleFilter" placeholder="全部" clearable style="width:140px">
            <el-option label="系统管理员" value="SYSTEM_ADMIN" />
            <el-option label="小区管理员" value="COMMUNITY_ADMIN" />
            <el-option label="消防员" value="FIREFIGHTER" />
            <el-option label="居民" value="RESIDENT" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="page=1;fetchUsers()">查询</el-button>
          <el-button type="success" icon="Plus" @click="openDialog()" v-if="canDo('userCreate')">新增用户</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card class="table-card">
      <el-table :data="users" v-loading="loading" border stripe style="width:100%">
        <el-table-column prop="username" label="用户名" width="130" fixed />
        <el-table-column prop="realName" label="姓名" width="110" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column label="角色" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="roleType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status==='ENABLED'?'success':'danger'" size="small" effect="dark">
              {{ row.status==='ENABLED'?'启用':'禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastLoginTime" label="最后登录" width="160" />
        <el-table-column prop="loginCount" label="登录次数" width="80" align="center" />
        <el-table-column prop="createTime" label="创建时间" width="160" />
      </el-table>
      <el-pagination
        v-model:current-page="page" v-model:page-size="pageSize"
        :total="total" layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[10, 20, 50]"
        @current-change="fetchUsers" @size-change="fetchUsers"
        class="pagination"
      />
    </el-card>
    <el-dialog v-model="dialogVisible" title="新增用户" width="500px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px" size="small">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="姓名" prop="realName">
          <el-input v-model="form.realName" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" style="width:100%">
            <el-option label="居民" value="RESIDENT" />
            <el-option label="小区管理员" value="COMMUNITY_ADMIN" />
            <el-option label="消防员" value="FIREFIGHTER" />
            <el-option label="系统管理员" value="SYSTEM_ADMIN" />
          </el-select>
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
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { canDo } from '../../utils/permissions.js'
import { listUsers, createUser } from '../../api/user.js'

const users = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const roleFilter = ref('')

function roleType(v) { return { SYSTEM_ADMIN: 'danger', COMMUNITY_ADMIN: 'warning', FIREFIGHTER: 'success', RESIDENT: 'info' }[v] || 'info' }
function roleLabel(v) { return { SYSTEM_ADMIN: '系统管理员', COMMUNITY_ADMIN: '小区管理员', FIREFIGHTER: '消防员', RESIDENT: '居民' }[v] || v }

async function fetchUsers() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (roleFilter.value) params.role = roleFilter.value
    const res = await listUsers(params)
    if (res.code === 200 && res.data) {
      users.value = res.data.records || []
      total.value = res.data.total || 0
    }
  } catch (e) { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = ref({ username: '', password: '', realName: '', phone: '', role: 'RESIDENT' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }, { min: 4, message: '至少4位', trigger: 'blur' }]
}

function openDialog() {
  form.value = { username: '', password: '', realName: '', phone: '', role: 'RESIDENT' }
  dialogVisible.value = true
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await createUser(form.value)
    ElMessage.success('创建成功')
    dialogVisible.value = false
    fetchUsers()
  } catch (e) { ElMessage.error(e.response?.data?.msg || '创建失败') }
  finally { saving.value = false }
}

onMounted(fetchUsers)
</script>

<style scoped>
.user-page { display: flex; flex-direction: column; gap: 16px; }
.pagination { margin-top: 16px; justify-content: center; }
</style>