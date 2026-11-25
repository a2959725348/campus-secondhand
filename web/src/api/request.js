import axios from 'axios';
import { ElMessage } from 'element-plus';

/**
 * axios 实例统一处理两件事：
 * 1. 自动带上 token —— 每个请求都手写 header 太容易漏
 * 2. 统一处理业务错误 —— 后端约定 HTTP 恒为 200/4xx，真正的结果看 body.code
 *    这里把 code !== 0 的情况统一弹提示并 reject，页面里只关心成功分支
 */
const request = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

request.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body.code === 0) {
      return body.data;
    }
    // 1002 = 未登录/凭证失效，清掉本地状态并回登录页
    if (body.code === 1002) {
      const activeToken=localStorage.getItem('token');
      const requestToken=response.config.headers?.get?.('Authorization')||response.config.headers?.Authorization;
      if(activeToken&&requestToken!==`Bearer ${activeToken}`){
        return Promise.reject(new Error(body.message||'旧会话请求已失效'));
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('campus:auth-expired'));
      ElMessage.warning(body.message || '请先登录');
      if (!location.hash.includes('/login')) {
        location.hash = '#/login';
      }
      return Promise.reject(new Error(body.message));
    }
    ElMessage.error(body.message || '操作失败');
    return Promise.reject(new Error(body.message));
  },
  (error) => {
    const message = error.response?.data?.message || error.message || '网络异常';
    ElMessage.error(message);
    return Promise.reject(error);
  },
);

export default request;
