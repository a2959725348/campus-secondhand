<script setup>
import {ref,onMounted} from 'vue';
import {fetchItems,fetchCategories} from '../api';
import ItemCard from '../components/ItemCard.vue';
import {useRouter} from 'vue-router';
const router=useRouter(),categories=ref([]),latest=ref([]),books=ref([]),total=ref(0),bookTotal=ref(0),loading=ref(true),error=ref(''),keyword=ref('');
async function load(){
 loading.value=true;error.value='';
 try{
  const [c,l,b]=await Promise.all([fetchCategories(),fetchItems({pageSize:8,sort:'latest'}),fetchItems({kind:'book',pageSize:4,sort:'latest'})]);
  categories.value=c;latest.value=l.list;books.value=b.list;total.value=l.total;bookTotal.value=b.total;
 }catch{error.value='集市暂时没能加载，请稍后再试。';}finally{loading.value=false;}
}
function search(){router.push({name:'items',query:keyword.value.trim()?{keyword:keyword.value.trim()}:{}});}
onMounted(load);
</script>
<template>
 <div class="home-page campus-editorial"><div class="container">
  <div class="campus-strip"><span><i></i> 同校相遇 · 好物接力</span><span>让喜欢循环，让生活轻一点。</span></div>
  <section class="editorial-hero">
   <div class="editorial-copy"><span class="editorial-kicker">SECOND HAND. FIRST CHOICE.</span><h1>好东西，<br/><span>不止一个学期。</span></h1>
    <p class="hero-intro">你的下一件心动，<br class="mobile-break"/>可能刚好在隔壁宿舍。</p>
    <p class="hero-description">把读过的书交给下一位同学，<br/>让用不上的好物，遇见刚好需要的人。</p>
    <div class="editorial-actions"><RouterLink class="publish-button" :to="{name:'items'}">发现校园好物</RouterLink><RouterLink class="outline-button" :to="{name:'books'}">去买二手书</RouterLink></div>
    <RouterLink class="sell-book-link" :to="{name:'publish',query:{kind:'book'}}"><el-icon><Reading/></el-icon> 有课本闲置？发布我的旧书</RouterLink>
    <div class="editorial-footnote"><span>同校面交</span><span>先问清楚</span><span>验物再确认</span></div>
   </div>
   <div class="editorial-photo"><img :src="'/uploads/photos/study-hero.jpg'" alt="书本、耳机与铅笔构成的学习桌面，授权场景摄影" fetchpriority="high"/><span class="photo-caption">THE NEXT CHAPTER STARTS HERE.</span><div class="photo-note"><span>THE CAMPUS EDIT</span><strong>旧物新学期</strong><p>换一个主人，接着发光。</p><RouterLink :to="{name:'books'}">翻翻校园书架</RouterLink></div><span class="photo-sticker">好物<br/>有下文</span></div>
  </section>
  <form class="discovery-bar" @submit.prevent="search"><span><el-icon><Search/></el-icon> 找点喜欢的</span><input v-model="keyword" aria-label="搜索校园闲置" placeholder="试试：高等数学、耳机、台灯…"/><button class="publish-button" type="submit">搜索好物</button><small>{{total}} 件在售好物 · {{bookTotal}} 本旧书待接力</small></form>
  <section class="campus-portals" aria-label="校园集市快捷入口">
   <RouterLink :to="{name:'books'}" class="portal-card portal-books"><div><span>CAMPUS BOOK CLUB</span><h2>把旧书，读成新故事。</h2><p>课本、考研资料、四六级与闲读书单</p><b>逛校园书市</b></div><img :src="'/uploads/photos/books-stack.jpg'" alt="旧书堆实物摄影" loading="lazy"/></RouterLink>
   <RouterLink :to="{name:'items',query:{maxPrice:50}}" class="portal-card portal-budget"><el-icon><Coin/></el-icon><span>SMALL BUDGET. GOOD FINDS.</span><h2>50 元，也能淘到心头好。</h2><p>预算轻一点，快乐多一点。</p><b>看看低价好物</b></RouterLink>
   <RouterLink :to="{name:'publish'}" class="portal-card portal-sell"><el-icon><Box/></el-icon><span>A LITTLE SPACE TO BREATHE.</span><h2>你的闲置，TA 的刚需。</h2><p>腾出一点空间，接住新的生活。</p><b>发布我的闲置</b></RouterLink>
  </section>
  <section class="category-section"><div class="section-heading"><div><span class="eyebrow">PICK YOUR CORNER</span><h2>在校园里，淘一点喜欢。</h2></div><RouterLink :to="{name:'items'}">全部分类</RouterLink></div><div class="category-rail"><RouterLink v-for="(cat,i) in categories" :key="cat.id" :to="cat.slug==='book'?{name:'books'}:{name:'items',query:{categoryId:cat.id}}" class="category-link"><span :class="'category-icon tone-'+i%4"><el-icon><component :is="cat.icon||'Goods'"/></el-icon></span><b>{{cat.name}}</b><small>{{cat.itemCount}} 件在售</small></RouterLink></div></section>
  <div v-if="error" class="inline-error">{{error}} <el-button @click="load">重新加载</el-button></div>
  <section class="market-section book-shelf-section"><div class="section-heading"><div><span class="eyebrow">PASS THE BOOK, KEEP THE STORY</span><h2>读过的，值得接着读。</h2></div><RouterLink :to="{name:'books'}">全部二手书</RouterLink></div><el-skeleton v-if="loading" :rows="5" animated/><div v-else-if="books.length" class="item-grid"><ItemCard v-for="item in books" :key="item.id" :item="item"/></div><div v-else class="quiet-empty">书架等你上新。<RouterLink :to="{name:'publish',query:{kind:'book'}}">发布一本旧书</RouterLink></div></section>
  <section class="market-section"><div class="section-heading"><div><span class="eyebrow">FRESH FROM NEXT DOOR</span><h2>隔壁同学，刚刚上新。</h2></div><RouterLink :to="{name:'items'}">浏览全部好物</RouterLink></div><el-skeleton v-if="loading" :rows="5" animated/><div v-else-if="latest.length" class="item-grid"><ItemCard v-for="item in latest" :key="item.id" :item="item"/></div><div v-else class="quiet-empty">第一件校园好物，等你发布。</div></section>
  <section class="campus-bottom-banner"><span>LESS WASTE. MORE CAMPUS LIFE.</span><h2>闲置不是故事的结尾，<br/>下一位同学，才是新的开始。</h2><RouterLink class="outline-button" :to="{name:'publish'}">给好物找个新主人</RouterLink></section>
 </div></div>
</template>
