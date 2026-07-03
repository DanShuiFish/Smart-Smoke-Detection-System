import request from './request'

export function getLatestData(deviceId) {
  return request({ url: '/data/latest/' + deviceId, method: 'get' })
}

export function getHistoryData(deviceId, params) {
  return request({ url: '/data/history/' + deviceId, method: 'get', params })
}