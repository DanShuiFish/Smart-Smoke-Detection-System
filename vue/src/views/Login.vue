<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="login-logo">
          <el-icon :size="40" color="#409eff"><WarningFilled /></el-icon>
        </div>
        <h2 class="login-title">智慧烟感预警系统</h2>
        <p class="login-subtitle">{{ isRegister ? '创建新账户' : '请登录您的账户' }}</p>
      </div>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        @keyup.enter="handleSubmit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" :prefix-icon="User" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" :prefix-icon="Lock" show-password />
        </el-form-item>
        <template v-if="isRegister">
          <el-form-item label="姓名" prop="realName">
            <el-input v-model="form.realName" placeholder="请输入真实姓名（选填）" :prefix-icon="EditPen" />
          </el-form-item>
          <el-form-item label="手机号" prop="phone">
            <el-input v-model="form.phone" placeholder="请输入手机号（选填）" :prefix-icon="Iphone" />
          </el-form-item>
          <el-form-item label="注册身份" prop="role">
            <el-select v-model="form.role" placeholder="选择身份" style="width:100%">
              <el-option label="居民" value="RESIDENT" />
              <el-option label="小区管理员" value="COMMUNITY_ADMIN" />
              <el-option label="消防员" value="FIREFIGHTER" />
            </el-select>
          </el-form-item>
        </template>
        <el-form-item>
          <el-button type="primary" :loading="loading" class="submit-btn" @click="handleSubmit">
            {{ isRegister ? '注 册' : '登 录' }}
          </el-button>
        </el-form-item>
      </el-form>
      <div class="login-footer">
        <span v-if="!isRegister">
          还没有账户？
          <el-link type="primary" :underline="false" @click="toggleMode">立即注册</el-link>
        </span>
        <span v-else>
          已有账户？
          <el-link type="primary" :underline="false" @click="toggleMode">返回登录</el-link>
        </span>
      </div>
      <div class="test-accounts" v-if="!isRegister">
        <p class="test-title">测试账号</p>
        <div class="test-item" @click="fillAccount('admin', 'admin123')">
          <el-tag size="small" type="danger">系统管理员</el-tag>
          <span>admin / admin123</span>
        </div>
        <div class="test-item" @click="fillAccount('fireman1', 'admin123')">
          <el-tag size="small" type="warning">消防员</el-tag>
          <span>fireman1 / admin123</span>
        </div>
        <div class="test-item" @click="fillAccount('manager1', 'admin123')">
          <el-tag size="small">小区管理员</el-tag>
          <span>manager1 / admin123</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock, EditPen, Iphone, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { login as loginApi, register as registerApi } from '../api/auth.js'

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)
const isRegister = ref(false)

const form = reactive({
  username: '',
  password: '',
  realName: '',
  phone: '',
  role: 'RESIDENT'
})

const rules = computed(() => ({
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 32, message: '用户名长度 2-32 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 4, max: 32, message: '密码长度 4-32 个字符', trigger: 'blur' }
  ],
  role: isRegister.value
    ? [{ required: true, message: '请选择注册身份', trigger: 'change' }]
    : []
}))

function toggleMode() {
  isRegister.value = !isRegister.value
  form.realName = ''
  form.phone = ''
  form.role = 'RESIDENT'
}

function fillAccount(username, password) {
  form.username = username
  form.password = password
}

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    let res
    if (isRegister.value) {
      res = await registerApi({
        username: form.username,
        password: form.password,
        realName: form.realName || undefined,
        phone: form.phone || undefined,
        role: form.role
      })
      ElMessage.success('注册成功！')
    } else {
      res = await loginApi({
        username: form.username,
        password: form.password
      })
      ElMessage.success('登录成功！')
    }
    if (res.code === 200 && res.data) {
      localStorage.setItem('smoke_token', res.data.token)
      const u = res.data.user || res.data
      localStorage.setItem('smoke_user', JSON.stringify({
        userId: u.id || u.userId,
        username: u.username,
        realName: u.realName,
        role: u.role
      }))
      window.location.href = '/fe2/dashboard-enhanced.html'
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.msg || e.message || '网络异常')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #0a1628 0%, #1a3a5c 50%, #0a1628 100%);
  background-size: 400% 400%;
  animation: gradientMove 8s ease infinite;
}
@keyframes gradientMove {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
.login-card {
  width: 420px;
  padding: 40px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.login-header { text-align: center; margin-bottom: 32px; }
.login-logo { margin-bottom: 16px; }
.login-title { font-size: 24px; font-weight: 600; color: #1a1a2e; margin: 0 0 8px; }
.login-subtitle { font-size: 14px; color: #909399; margin: 0; }
.submit-btn { width: 100%; height: 44px; font-size: 16px; }
.login-footer { text-align: center; font-size: 14px; color: #606266; margin-top: 16px; }
.test-accounts { margin-top: 24px; padding-top: 20px; border-top: 1px solid #ebeef5; }
.test-title { font-size: 12px; color: #c0c4cc; margin: 0 0 12px; text-align: center; }
.test-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; margin-bottom: 6px; border-radius: 6px;
  cursor: pointer; font-size: 13px; color: #606266; transition: background 0.2s;
}
.test-item:hover { background: #f0f5ff; }
.test-item span { flex: 1; }
</style>
