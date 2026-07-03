import axios from 'axios'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

request.interceptors.request.use(config => {
  const token = localStorage.getItem('smoke_token')
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
      localStorage.removeItem('smoke_token')
      localStorage.removeItem('smoke_user')
      window.location.href = '/login'
    }
    return Promise.reject(new Error(res.msg || '请求失败'))
  },
  error => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('smoke_token')
      localStorage.removeItem('smoke_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default request
