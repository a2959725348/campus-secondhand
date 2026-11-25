<script setup>
import {ref,watch} from 'vue';import {useRoute,useRouter} from 'vue-router';import {useUserStore} from '../stores/user';import {ElMessageBox,ElMessage} from 'element-plus';
const router=useRouter(),route=useRoute(),user=useUserStore(),keyword=ref(route.query.keyword||'');
watch(()=>route.query.keyword,v=>keyword.value=v||'');
function search(){router.push({name:'items',query:keyword.value.trim()?{keyword:keyword.value.trim()}: {}});}
async function logout(){try{await ElMessageBox.confirm('确定退出当前账号吗？','退出登录');user.logout();router.push({name:'home'});ElMessage.success('已退出登录');}catch{}}
const links=[['home','首页','House'],['books','书市','Reading'],['publish','发布','Plus'],['orders','订单','Tickets'],['profile','我的','User']];
</script>
<template>
 <header class="site-header"><div class="container masthead"><RouterLink :to="{name:'home'}" class="brand"><span class="brand-mark">拾<span>✦</span></span><span><b>拾光集市</b><small>CAMPUS MARKET</small></span></RouterLink>
 <nav class="desktop-nav" aria-label="主要导航"><RouterLink :to="{name:'home'}">首页</RouterLink><RouterLink :to="{name:'items'}">逛集市</RouterLink><RouterLink :to="{name:'books'}">校园书市</RouterLink><RouterLink :to="{name:'favorites'}">我的收藏</RouterLink></nav>
 <form class="header-search" @submit.prevent="search"><el-icon><Search/></el-icon><input v-model="keyword" aria-label="搜索闲置" placeholder="搜一搜，校园里的好物"/><button type="submit" aria-label="提交搜索">搜索</button></form>
 <div class="account-actions"><template v-if="user.isLogin"><el-dropdown><button class="account-button"><span class="small-avatar">{{user.user?.nickname?.[0]||'我'}}</span><span>{{user.user?.nickname}}</span><el-icon><ArrowDown/></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item v-if="user.user?.role==='admin'" @click="router.push({name:'admin'})">后台管理系统</el-dropdown-item><el-dropdown-item @click="router.push({name:'addresses'})">地址管理</el-dropdown-item><el-dropdown-item @click="router.push({name:'profile'})">个人资料中心</el-dropdown-item><el-dropdown-item @click="router.push({name:'mine'})">我发布的</el-dropdown-item><el-dropdown-item @click="router.push({name:'orders'})">我的订单</el-dropdown-item><el-dropdown-item divided @click="logout">退出登录</el-dropdown-item></el-dropdown-menu></template></el-dropdown></template><RouterLink v-else :to="{name:'login'}" class="login-link">登录 / 注册</RouterLink><RouterLink :to="{name:'publish'}" class="publish-button"><el-icon><Plus/></el-icon>发布闲置</RouterLink></div></div></header>
 <nav class="mobile-nav" aria-label="手机导航"><RouterLink v-for="[name,label,icon] in links" :key="name" :to="{name}" :class="{publish:name==='publish'}"><el-icon><component :is="icon"/></el-icon><span>{{label}}</span></RouterLink></nav>
</template>
