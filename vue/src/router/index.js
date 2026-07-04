import { createRouter, createWebHistory } from 'vue-router'
import { canAccessPage } from '../utils/permissions.js'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录' }
  },
  {
    path: '/',
    component: () => import('../views/layout/MainLayout.vue'),
    redirect: '/device',
    children: [
      {
        path: 'device',
        name: 'DeviceManagement',
        component: () => import('../views/device/DeviceManagement.vue'),
        meta: { title: '设备管理', icon: 'Monitor', pageKey: 'device' }
      },
      {
        path: 'alarm',
        name: 'AlarmLog',
        component: () => import('../views/alarm/AlarmLog.vue'),
        meta: { title: '告警日志', icon: 'WarningFilled', pageKey: 'alarm' }
      },
      {
        path: 'ai-chat',
        name: 'ChatView',
        component: () => import('../views/ai-chat/ChatView.vue'),
        meta: { title: '智能问答', icon: 'ChatDotSquare', pageKey: 'chat' }
      },
      {
        path: 'system/user',
        name: 'UserManagement',
        component: () => import('../views/system/UserManagement.vue'),
        meta: { title: '用户管理', icon: 'User', pageKey: 'user' }
      },
      {
        path: 'system/config',
        name: 'SystemConfig',
        component: () => import('../views/system/SystemConfig.vue'),
        meta: { title: '系统配置', icon: 'Setting', pageKey: 'config' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('smoke_token')
  if (to.path !== '/login' && !token) {
    next('/login')
    return
  }
  // 路由级权限校验
  const pageKey = to.meta.pageKey
  if (pageKey && !canAccessPage(pageKey)) {
    next('/device')
    return
  }
  document.title = to.meta.title ? '智慧烟感 - ' + to.meta.title : '智慧烟感预警系统'
  next()
})

export default router