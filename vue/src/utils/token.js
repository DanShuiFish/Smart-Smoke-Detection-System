/**
 * Token 工具 — 统一管理 localStorage 中的 token 读写
 * 防止 setItem('null') / setItem('undefined') 等无效值污染
 */

const TOKEN_KEY = 'smoke_token'
const USER_KEY = 'smoke_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  // 只存储有效的 token 字符串
  if (token && token !== 'null' && token !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token)
  }
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setUser(user) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify({
      userId: user.id || user.userId,
      username: user.username,
      realName: user.realName,
      role: user.role
    }))
  }
}
