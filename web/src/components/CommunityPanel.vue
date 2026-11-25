<script setup>
import {ref,onMounted,watch} from 'vue';
import {useRoute} from 'vue-router';
import {ElMessage} from 'element-plus';
import {useUserStore} from '../stores/user';
import {fetchQuestions,postQuestion,replyQuestion,fetchReviews} from '../api';
import {timeAgo} from '../utils/format';
const props=defineProps({itemId:{type:Number,required:true},isOwner:Boolean});
const user=useUserStore(),route=useRoute();
const questions=ref([]),reviews=ref({list:[],total:0,average:0}),total=ref(0),page=ref(1),draft=ref(''),replies=ref({}),replyOpen=ref(null),busy=ref(false),loading=ref(true),error=ref('');
async function load(){loading.value=true;error.value='';try{const [q,r]=await Promise.all([fetchQuestions(props.itemId,{page:page.value,pageSize:10}),fetchReviews(props.itemId,{pageSize:10})]);questions.value=q.list;total.value=q.total;reviews.value=r;}catch{error.value='暂时无法加载交流内容，请重试。';}finally{loading.value=false;}}
async function ask(){if(!draft.value.trim()||busy.value)return;busy.value=true;try{await postQuestion(props.itemId,{content:draft.value});draft.value='';page.value=1;await load();ElMessage.success('留言已发布');}catch{}finally{busy.value=false;}}
async function reply(q){if(!replies.value[q.id]?.trim()||busy.value)return;busy.value=true;try{await replyQuestion(q.id,{content:replies.value[q.id]});replyOpen.value=null;await load();ElMessage.success('回复已保存');}catch{}finally{busy.value=false;}}
watch(()=>props.itemId,()=>{page.value=1;load();});onMounted(load);
</script>
<template>
 <section class="community-grid">
  <div class="community-card card">
   <div class="title-bar"><div><span class="eyebrow">BEFORE YOU BUY</span><h2>先聊清楚，再带回去</h2></div><span class="count-pill">{{total}} 条留言</span></div>
   <p class="text-sub">问问成色、配件和面交地点，让交易多一份安心。</p>
   <form v-if="user.isLogin" class="question-form" @submit.prevent="ask">
    <label for="question-content">你的问题</label><el-input id="question-content" v-model="draft" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="这件好物，你还想了解什么？" />
    <el-button type="primary" native-type="submit" :loading="busy" :disabled="!draft.trim()">发布留言</el-button>
   </form>
   <div v-else class="signin-hint">登录后可以提问，与卖家公开交流。<RouterLink :to="{name:'login',query:{redirect:route.fullPath}}">去登录</RouterLink></div>
   <div v-if="error" class="inline-error">{{error}} <el-button text @click="load">重新加载</el-button></div>
   <el-skeleton v-else-if="loading" :rows="3" animated />
   <template v-else>
    <article v-for="q in questions" :key="q.id" class="question-entry">
     <header><span class="small-avatar">{{q.authorName?.[0]}}</span><strong>{{q.authorName}}</strong><time>{{timeAgo(q.createdAt)}}</time></header>
     <p>{{q.content}}</p><div v-if="q.reply" class="seller-reply"><span>卖家回复</span><p>{{q.reply}}</p></div>
     <template v-if="isOwner"><el-button text @click="replyOpen=replyOpen===q.id?null:q.id">{{q.reply?'编辑回复':'回复同学'}}</el-button><div v-if="replyOpen===q.id" class="reply-compose"><el-input v-model="replies[q.id]" :aria-label="`回复${q.authorName}`" type="textarea" maxlength="500" placeholder="填写你的回复"/><el-button :loading="busy" :disabled="!replies[q.id]?.trim()" @click="reply(q)">保存回复</el-button></div></template>
    </article>
    <div v-if="!questions.length" class="quiet-empty"><el-icon><ChatDotRound/></el-icon><p>还没有留言，来问第一个问题吧。</p></div>
    <el-pagination v-if="total>10" v-model:current-page="page" :page-size="10" :total="total" layout="prev,pager,next" @current-change="load"/>
   </template>
  </div>
  <aside class="community-card card review-area"><span class="eyebrow">REAL TRANSACTIONS</span><h2>成交后的真实反馈</h2><div class="review-score"><b>{{reviews.total?Number(reviews.average).toFixed(1):'—'}}</b><div><el-rate :model-value="Number(reviews.average)" disabled/><span>{{reviews.total}} 位买家评价</span></div></div><p v-if="!reviews.total" class="text-sub">完成交易后，买家可以在订单中留下评价。真实体验值得被看见。</p><article v-for="r in reviews.list" :key="r.id" class="review-entry"><div><strong>{{r.authorName}}</strong><el-rate :model-value="r.rating" disabled size="small"/></div><p>{{r.content}}</p><time>{{timeAgo(r.createdAt)}}</time></article></aside>
 </section>
</template>
