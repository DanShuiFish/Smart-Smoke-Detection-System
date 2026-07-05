<template>
  <el-container class="layout-container">
    <el-aside :width="isCollapse ? '64px' : '220px'" class="layout-aside">
      <div class="aside-header">
        <el-icon :size="28" color="#409eff" v-show="!isCollapse">
          <WarningFilled />
        </el-icon>
        <span v-show="!isCollapse" class="aside-title">智慧烟感</span>
        <el-icon :size="24" color="#409eff" v-show="isCollapse">
          <WarningFilled />
        </el-icon>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapse"
        :router="true"
        background-color="#1a1a2e"
        text-color="#a0aec0"
        active-text-color="#409eff"
        class="aside-menu"
      >
        <el-menu-item index="/device">
          <el-icon><Monitor /></el-icon>
          <template #title>设备管理</template>
        </el-menu-item>
        <el-menu-item index="/alarm">
          <el-icon><WarningFilled /></el-icon>
          <template #title>告警日志</template>
        </el-menu-item>
        <el-menu-item index="/ai-chat">
          <el-icon><ChatDotSquare /></el-icon>
          <template #title>智能问答</template>
        </el-menu-item>
        <el-sub-menu index="/system" v-if="showUserMgmt || showConfigMgmt">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>后台管理</span>
          </template>
          <el-menu-item index="/system/user" v-if="showUserMgmt">
            <el-icon><User /></el-icon>
            <template #title>用户管理</template>
          </el-menu-item>
          <el-menu-item index="/system/config" v-if="showConfigMgmt">
            <el-icon><Tools /></el-icon>
            <template #title>系统配置</template>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="layout-header">
        <div class="header-left">
          <el-icon
            :size="20"
            class="collapse-btn"
            @click="isCollapse = !isCollapse"
          >
            <Fold v-if="!isCollapse" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/" class="header-breadcrumb">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentTitle">{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-tag size="small" type="warning" class="role-tag" v-if="roleName">{{ roleName }}</el-tag>
          <el-dropdown trigger="click" @command="handleCommand">
            <span class="user-info">
              <el-avatar :size="32" icon="UserFilled" class="user-avatar" />
              <span class="user-name">{{ user.realName || user.username }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-item command="profile">
                <el-icon><InfoFilled /></el-icon>个人信息
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>退出登录
              </el-dropdown-item>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  WarningFilled, Monitor, Setting, User, Tools,
  Fold, Expand, ArrowDown, UserFilled,
  InfoFilled, SwitchButton, ChatDotSquare
} from '@element-plus/icons-vue'
import { logout as logoutApi } from '../../api/auth.js'
import { canAccessPage, roleLabel } from '../../utils/permissions.js'
import { getUser, removeToken } from '../../utils/token.js'

const route = useRoute()
const router = useRouter()
const isCollapse = ref(false)

const user = computed(() => {
  return getUser() || {}
})

const roleName = computed(() => roleLabel(user.value.role || ''))
const showUserMgmt = computed(() => canAccessPage('user'))
const showConfigMgmt = computed(() => canAccessPage('config'))
const activeMenu = computed(() => route.path)
const currentTitle = computed(() => route.meta?.title || '')

function handleCommand(cmd) {
  if (cmd === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(async () => {
      try {
        await logoutApi()
      } catch (e) {}
      removeToken()
      router.push('/login')
    }).catch(() => {})
  }
}
</script>

<style scoped>
.layout-container { height: 100vh; }
.layout-aside { background: #1a1a2e; transition: width 0.3s; overflow: hidden; }
.aside-header {
  height: 60px; display: flex; align-items: center; justify-content: center;
  gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08);
}
.aside-title { font-size: 18px; font-weight: 600; color: #e2e8f0; white-space: nowrap; }
.aside-menu { border-right: none; }
.layout-header {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; border-bottom: 1px solid #e8e8e8;
  padding: 0 20px; height: 60px;
}
.header-left { display: flex; align-items: center; gap: 16px; }
.collapse-btn { cursor: pointer; color: #606266; }
.collapse-btn:hover { color: #409eff; }
.header-breadcrumb { font-size: 14px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.role-tag { font-size: 12px; }
.user-info {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  padding: 4px 8px; border-radius: 6px; transition: background 0.2s;
}
.user-info:hover { background: #f0f5ff; }
.user-name { font-size: 14px; color: #303133; }
.user-avatar { background: #409eff; }
.layout-main { background: #f0f2f5; padding: 20px; overflow-y: auto; }
</style>