import request from './request'

export function listUsers(params) {
  return request({ url: '/users', method: 'get', params })
}

export function getUser(id) {
  return request({ url: '/users/' + id, method: 'get' })
}

export function createUser(data) {
  return request({ url: '/users', method: 'post', data })
}