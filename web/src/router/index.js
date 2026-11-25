import { createRouter, createWebHashHistory } from 'vue-router';
import {fetchMe} from '../api';

/**
 * 用 hash 路由而不是 history 路由：部署到 GitHub Pages / 校园静态服务器时
 * 不需要额外配 rewrite 规则，刷新页面不会 404。
 * 代价是地址里有个 #，对简历项目来说可以接受。
 */
const routes = [
  {path:'/admin',name:'admin',component:()=>import('../views/AdminView.vue'),meta:{requiresAuth:true,requiresAdmin:true,adminLayout:true}},
  {path:'/addresses',name:'addresses',component:()=>import('../views/AddressView.vue'),meta:{requiresAuth:true}},
  { path:'/books', name:'books', component:()=>import('../views/BookMarketView.vue') },
  {path:'/profile',name:'profile',component:()=>import('../views/ProfileView.vue'),meta:{requiresAuth:true}},
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  {
    path: '/items',
    name: 'items',
    component: () => import('../views/ItemListView.vue'),
  },
  {
    path: '/items/:id',
    name: 'itemDetail',
    component: () => import('../views/ItemDetailView.vue'),
  },
  {
    path: '/publish',
    name: 'publish',
    component: () => import('../views/PublishView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('../views/OrderListView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: () => import('../views/FavoriteListView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/mine',
    name: 'mine',
    component: () => import('../views/MyItemsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

// 需要登录的页面被游客访问时，带去登录页并把原目标带上，登录完跳回去
router.beforeEach(async (to) => {
  const token = localStorage.getItem('token');
  if (to.meta.requiresAuth && !token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if(to.meta.requiresAdmin){
    try{const me=await fetchMe();localStorage.setItem('user',JSON.stringify(me));if(me.role!=='admin')return {name:'home'};}catch{return {name:'login',query:{redirect:to.fullPath}};}
  }
  return true;
});

export default router;
