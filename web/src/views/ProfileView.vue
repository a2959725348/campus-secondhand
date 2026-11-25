<script setup>
import {ref,reactive,onMounted} from 'vue';
import {ElMessage} from 'element-plus';
import {useUserStore} from '../stores/user';
import {fetchMe,updateMe,fetchOverview} from '../api';
const user=useUserStore(),stats=ref(null),loading=ref(true),saving=ref(false),error=ref('');
const form=reactive({nickname:'',campus:'',phone:''});
async function load(){loading.value=true;error.value='';try{const [me,overview]=await Promise.all([fetchMe(),fetchOverview()]);Object.assign(form,{nickname:me.nickname||'',campus:me.campus||'',phone:me.phone||''});stats.value=overview;}catch{error.value='资料加载失败，请稍后重试。';}finally{loading.value=false;}}
async function save(){if(!form.nickname.trim()){ElMessage.warning('请填写昵称');return;}saving.value=true;try{await updateMe({...form});await user.refresh();ElMessage.success('个人资料已更新');}catch{}finally{saving.value=false;}}
onMounted(load);
</script>
<template>
 <div class="page"><div class="container profile-page"><div class="page-heading"><div><span class="eyebrow">MY CAMPUS SPACE</span><h1>我的校园小站</h1><p>你的闲置、收藏和每一次愉快交易，都在这里。</p></div></div>
 <div v-if="error" class="inline-error">{{error}}<el-button @click="load">重新加载</el-button></div><el-skeleton v-if="loading" :rows="7" animated/>
 <template v-else-if="stats"><div class="profile-banner"><div class="profile-avatar">{{user.user?.nickname?.[0]||'我'}}</div><div><h2>{{user.user?.nickname}}</h2><p>{{user.user?.campus||'还没有填写校区'}} · 账号 {{user.user?.username}}</p></div><div class="profile-rating"><strong>{{stats.reviewCount?`${Number(stats.rating).toFixed(1)} / 5`:'暂无评价'}}</strong><span>{{stats.reviewCount}} 条真实成交反馈</span></div></div>
 <div class="stats-grid"><RouterLink :to="{name:'mine'}"><b>{{stats.published}}</b><span>我发布的</span></RouterLink><RouterLink :to="{name:'mine'}"><b>{{stats.onSale}}</b><span>正在出售</span></RouterLink><RouterLink :to="{name:'orders'}"><b>{{stats.completed}}</b><span>已完成购买</span></RouterLink><RouterLink :to="{name:'favorites'}"><b>{{stats.favorites}}</b><span>我的收藏</span></RouterLink></div>
 <div class="profile-columns"><section class="card profile-form"><span class="eyebrow">ABOUT YOU</span><h2>让同学更了解你</h2><p class="text-sub">昵称和校区用于展示；手机号仅在自己的资料中可见。</p><el-form label-position="top" @submit.prevent="save"><el-form-item label="昵称"><el-input v-model="form.nickname" maxlength="30" show-word-limit/></el-form-item><el-form-item label="所在校区"><el-input v-model="form.campus" maxlength="50" placeholder="例如：东校区"/></el-form-item><el-form-item label="手机号（选填，仅本人可见）"><el-input v-model="form.phone" maxlength="11" placeholder="填写常用手机号" inputmode="tel"/></el-form-item><el-button type="primary" native-type="submit" :loading="saving">保存个人资料</el-button></el-form></section><aside class="profile-links card"><h2>下一件好物，从这里开始</h2><RouterLink :to="{name:'addresses'}"><el-icon><Location/></el-icon><span><b>管理收货地址</b><small>为邮寄交易设置常用地址</small></span></RouterLink><RouterLink :to="{name:'publish'}"><el-icon><Plus/></el-icon><div><b>发布闲置</b><p>让用不上的东西找到新主人</p></div></RouterLink><RouterLink :to="{name:'mine'}"><el-icon><Box/></el-icon><div><b>管理我的商品</b><p>编辑内容，查看出售状态</p></div></RouterLink><RouterLink :to="{name:'orders'}"><el-icon><Tickets/></el-icon><div><b>查看交易记录</b><p>完成面交后，记得留下真实评价</p></div></RouterLink><div class="profile-note">建议选择校内公共场所面交，验清物品后再确认交易完成。</div></aside></div>
 </template></div></div>
</template>
