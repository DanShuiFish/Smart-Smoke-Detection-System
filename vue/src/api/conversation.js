import request from './request'

export function sendMessage(data) {
  return request({ url: '/conversations', method: 'post', data })
}

export function listConversations(params) {
  return request({ url: '/conversations', method: 'get', params })
}