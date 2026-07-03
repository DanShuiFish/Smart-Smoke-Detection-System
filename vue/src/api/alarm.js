import request from './request'

export function listAlarms(params) {
  return request({ url: '/alarms', method: 'get', params })
}

export function getAlarm(id) {
  return request({ url: '/alarms/' + id, method: 'get' })
}

export function confirmAlarm(id, confirmMethod) {
  return request({ url: '/alarms/' + id + '/confirm', method: 'put', data: { confirmMethod } })
}

export function resolveAlarm(id, data) {
  return request({ url: '/alarms/' + id + '/resolve', method: 'put', data })
}