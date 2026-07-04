const PERMISSION_MAP = {
  SYSTEM_ADMIN: {
    label: '系统管理员', level: 4,
    page: { device: true, alarm: true, chat: true, user: true, config: true },
    action: { deviceCreate: true, deviceEdit: true, deviceDelete: true, alarmConfirm: true, alarmResolve: true, userCreate: true, configEdit: true }
  },
  COMMUNITY_ADMIN: {
    label: '小区管理员', level: 3,
    page: { device: true, alarm: true, chat: true, user: true, config: false },
    action: { deviceCreate: true, deviceEdit: true, deviceDelete: false, alarmConfirm: true, alarmResolve: true, userCreate: true, configEdit: false }
  },
  FIREFIGHTER: {
    label: '消防员', level: 2,
    page: { device: true, alarm: true, chat: true, user: false, config: false },
    action: { deviceCreate: false, deviceEdit: false, deviceDelete: false, alarmConfirm: true, alarmResolve: true, userCreate: false, configEdit: false }
  },
  RESIDENT: {
    label: '居民', level: 1,
    page: { device: true, alarm: true, chat: true, user: false, config: false },
    action: { deviceCreate: false, deviceEdit: false, deviceDelete: false, alarmConfirm: false, alarmResolve: false, userCreate: false, configEdit: false }
  }
}

export function getRole() {
  try {
    const u = JSON.parse(localStorage.getItem('smoke_user') || '{}')
    return u.role || ''
  } catch { return '' }
}

export function getUserId() {
  try {
    const u = JSON.parse(localStorage.getItem('smoke_user') || '{}')
    return u.userId || 0
  } catch { return 0 }
}

export function canAccessPage(pageName) {
  const role = getRole()
  const p = PERMISSION_MAP[role]
  return p ? !!p.page[pageName] : false
}

export function canDo(action) {
  const role = getRole()
  const p = PERMISSION_MAP[role]
  return p ? !!p.action[action] : false
}

export function roleLabel(role) {
  const r = PERMISSION_MAP[role]
  return r ? r.label : role
}

export function hasRole(minLevel) {
  const role = getRole()
  const p = PERMISSION_MAP[role]
  return p ? p.level >= minLevel : false
}
