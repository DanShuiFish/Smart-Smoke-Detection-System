import axios from 'axios'
import { getToken, removeToken } from '../utils/token.js'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

request.interceptors.request.use(config => {
  const token = getToken()
  if (token) {
    config.headers['Authorization'] = 'Bearer ' + token
  }
  return config
}, error => Promise.reject(error))

request.interceptors.response.use(
  response => {
    const res = response.data
    if (res.code === 200 || res.code === undefined) {
      return res
    }
    if (res.code === 401) {
      removeToken()
      window.location.href = '/login'
    }
    return Promise.reject(new Error(res.msg || '璇锋眰澶辫触'))
  },
  error => {
    if (error.response && error.response.status === 401) {
      removeToken()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default request

