import { defineStore } from 'pinia';
import { ref, computed, onScopeDispose } from 'vue';
import { login as loginApi, register as registerApi, fetchMe } from '../api';

/**
 * 用户状态。token 和 user 都落 localStorage，
 * 刷新页面后不用重新登录；退出时一起清掉。
 */
export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '');
  let savedUser=null;try{savedUser=JSON.parse(localStorage.getItem('user')||'null');}catch{localStorage.removeItem('user');}
  const user = ref(savedUser);

  const isLogin = computed(() => Boolean(token.value));

  function persist(newToken, newUser) {
    token.value = newToken;
    user.value = newUser;
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  }

  async function login(payload) {
    const data = await loginApi(payload);
    persist(data.token, data.user);
    return data;
  }

  async function register(payload) {
    const data = await registerApi(payload);
    persist(data.token, data.user);
    return data;
  }

  /** 刷新用户信息，token 失效时返回 null 而不抛错 */
  async function refresh() {
    const requestToken = localStorage.getItem('token') || '';
    if (!requestToken) return null;
    try {
      const data = await fetchMe();
      if (localStorage.getItem('token') !== requestToken) return null;
      token.value = requestToken;
      user.value = data;
      localStorage.setItem('user', JSON.stringify(data));
      return data;
    } catch {
      if ((localStorage.getItem('token') || '') !== requestToken) return null;
      logout();
      return null;
    }
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  const onExpired=()=>logout();
  const onStorage=event=>{
    if(!['token','user',null].includes(event.key))return;
    // storage 事件可能延迟：只同步本标签状态，绝不删除共享的新会话。
    const latestToken=localStorage.getItem('token')||'';
    const identityChanged=latestToken!==token.value;
    let latestUser=null;try{latestUser=JSON.parse(localStorage.getItem('user')||'null');}catch{}
    token.value=latestToken;user.value=latestToken?latestUser:null;
    // 整页重建会卸载旧账号的地址、订单弹窗与后台，并重新执行路由权限校验。
    if(identityChanged)window.location.reload();
  };
  window.addEventListener('campus:auth-expired',onExpired);
  window.addEventListener('storage',onStorage);
  onScopeDispose(()=>{window.removeEventListener('campus:auth-expired',onExpired);window.removeEventListener('storage',onStorage);});

  return { token, user, isLogin, login, register, refresh, logout };
});
