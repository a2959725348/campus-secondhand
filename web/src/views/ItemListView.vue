<script setup>
import {ref,reactive,watch,onMounted} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {ElMessage} from 'element-plus';
import {fetchItems,fetchCategories} from '../api';
import {SORT_OPTIONS} from '../utils/format';
import ItemCard from '../components/ItemCard.vue';
const route=useRoute(),router=useRouter();
const categories=ref([]),list=ref([]),total=ref(0),loading=ref(false),error=ref('');
const filters=reactive({keyword:'',categoryId:null,minPrice:null,maxPrice:null,sort:'latest',page:1,pageSize:12});
let requestId=0;
const price=v=>typeof v==='string'&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
function readQuery(){
 filters.keyword=typeof route.query.keyword==='string'?route.query.keyword:'';
 filters.categoryId=/^[1-9]\d*$/.test(route.query.categoryId||'')?Number(route.query.categoryId):null;
 filters.minPrice=price(route.query.minPrice);filters.maxPrice=price(route.query.maxPrice);
 filters.sort=SORT_OPTIONS.some(o=>o.value===route.query.sort)?route.query.sort:'latest';
 filters.page=/^[1-9]\d*$/.test(route.query.page||'')?Number(route.query.page):1;
}
async function load(){
 const own=++requestId;loading.value=true;error.value='';
 try{
  const data=await fetchItems({page:filters.page,pageSize:filters.pageSize,sort:filters.sort,
   ...(filters.keyword?{keyword:filters.keyword}:{}),...(filters.categoryId?{categoryId:filters.categoryId}:{}),
   ...(filters.minPrice!=null?{minPrice:filters.minPrice}:{}),...(filters.maxPrice!=null?{maxPrice:filters.maxPrice}:{})});
  if(own!==requestId)return;list.value=data.list;total.value=data.total;
 }catch{if(own===requestId)error.value='暂时无法加载商品，请重试。';}
 finally{if(own===requestId)loading.value=false;}
}
async function applyFilter(resetPage=true){
 if(filters.minPrice!=null&&filters.maxPrice!=null&&filters.minPrice>filters.maxPrice){ElMessage.warning('最低价不能高于最高价');return;}
 if(resetPage)filters.page=1;
 const query={...(filters.keyword?{keyword:filters.keyword}:{}),...(filters.categoryId?{categoryId:String(filters.categoryId)}:{}),
  ...(filters.minPrice!=null?{minPrice:String(filters.minPrice)}:{}),...(filters.maxPrice!=null?{maxPrice:String(filters.maxPrice)}:{}),
  ...(filters.sort!=='latest'?{sort:filters.sort}:{}),...(filters.page>1?{page:String(filters.page)}:{})};
 const target=router.resolve({name:'items',query});
 if(target.fullPath===route.fullPath)await load();else await router.push({name:'items',query});
}
function resetFilter(){Object.assign(filters,{keyword:'',categoryId:null,minPrice:null,maxPrice:null,sort:'latest',page:1});applyFilter();}
watch(()=>route.fullPath,()=>{readQuery();load();});
onMounted(()=>{readQuery();load();fetchCategories().then(data=>{categories.value=data;}).catch(()=>{});});
</script>

<template>
  <div class="page">
    <div class="container">
      <div class="title-bar">
        <h2>{{ filters.keyword ? `搜索「${filters.keyword}」` : '逛一逛' }}</h2>
        <span class="hint">共 {{ total }} 件在售</span>
      </div>

      <!-- 筛选栏 -->
      <div class="filter card">
        <div class="filter-row">
          <span class="label">分类</span>
          <div class="chips">
            <button
              class="chip"
              :class="{ active: !filters.categoryId }"
              @click="filters.categoryId = null; applyFilter()"
            >
              全部
            </button>
            <button
              v-for="cat in categories"
              :key="cat.id"
              class="chip"
              :class="{ active: filters.categoryId === cat.id }"
              @click="filters.categoryId = cat.id; applyFilter()"
            >
              {{ cat.name }}
            </button>
          </div>
        </div>

        <div class="filter-row">
          <span class="label">价格</span>
          <div class="price-inputs">
            <el-input-number v-model="filters.minPrice" :min="0" :max="999999" :precision="2" :controls="false" placeholder="最低价" aria-label="最低价" @change="applyFilter()" />
            <span>—</span>
            <el-input-number v-model="filters.maxPrice" :min="0" :max="999999" :precision="2" :controls="false" placeholder="最高价" aria-label="最高价" @change="applyFilter()" />
            <span class="text-sub">元</span>
          </div>
        </div>

        <div class="filter-row">
          <span class="label">排序</span>
          <el-radio-group v-model="filters.sort" size="small" @change="applyFilter()">
            <el-radio-button v-for="opt in SORT_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
          <el-button text class="reset" @click="resetFilter">重置条件</el-button>
        </div>
      </div>

      <!-- 列表 -->
      <div v-loading="loading" class="list-wrap">
        <div v-if="error" class="inline-error">{{error}} <el-button @click="load">重新加载</el-button></div>
        <div v-else-if="list.length" class="item-grid">
          <ItemCard v-for="item in list" :key="item.id" :item="item" />
        </div>
        <div v-else-if="!loading" class="empty-block">
          没有找到符合条件的闲置，换个关键词或放宽价格试试
        </div>
      </div>

      <div v-if="total > filters.pageSize" class="pager">
        <el-pagination
          v-model:current-page="filters.page"
          :page-size="filters.pageSize"
          :total="total"
          layout="prev, pager, next"
          background
          @current-change="applyFilter(false)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.price-inputs{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.price-inputs :deep(.el-input-number){width:120px}@media(max-width:700px){.price-inputs{gap:7px}.price-inputs :deep(.el-input-number){width:105px}}
.filter {
  padding: 16px 18px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.label {
  width: 42px;
  flex-shrink: 0;
  color: var(--text-sub);
  font-size: 13px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 14px;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-main);
  font-family: inherit;
  transition: all 0.15s;
}

.chip:hover {
  border-color: var(--brand);
  color: var(--brand);
}

.chip.active {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.slider {
  flex: 1;
  max-width: 320px;
}

.reset {
  margin-left: auto;
  color: var(--text-sub);
}

.list-wrap {
  min-height: 260px;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 28px;
}
</style>
