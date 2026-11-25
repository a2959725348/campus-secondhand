<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchOrders, completeOrder, cancelOrder, postReview, fetchOrder, shipOrder } from '../api';
import { formatPrice, resolveImage, timeAgo } from '../utils/format';

import OrderDetailDialog from '../components/OrderDetailDialog.vue';
const selectedOrder=ref(null),detailOpen=ref(false),shipTarget=ref(null),shipCarrier=ref(''),shipTracking=ref(''),shipBusy=ref(false),statusFilter=ref(''),searchText=ref('');
async function showDetails(order){try{selectedOrder.value=await fetchOrder(order.id);detailOpen.value=true;}catch{}}
async function startShip(order){shipTarget.value=order;shipCarrier.value='';shipTracking.value='';}
async function saveShipment(){if(!shipCarrier.value.trim()||!shipTracking.value.trim()||shipBusy.value)return;shipBusy.value=true;try{await shipOrder(shipTarget.value.id,{carrier:shipCarrier.value.trim(),trackingNo:shipTracking.value.trim()});shipTarget.value=null;ElMessage.success('发货信息已保存');await load();}catch{}finally{shipBusy.value=false;}}
const reviewOrder=ref(null),reviewText=ref(''),reviewRating=ref(5),reviewBusy=ref(false);
async function saveReview(){if(!reviewText.value.trim())return;reviewBusy.value=true;try{await postReview(reviewOrder.value.id,{rating:reviewRating.value,content:reviewText.value});reviewOrder.value=null;ElMessage.success('评价已发布');await load();}catch{}finally{reviewBusy.value=false;}}
const tabs = [
  { name: 'buyer', label: '我买到的' },
  { name: 'seller', label: '我卖出的' },
];

const role = ref('buyer');
const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const loading = ref(false);
const error = ref('');
let requestRevision=0;

const STATUS = {
  pending: { text: '待交易', type: 'warning' },
  shipped: {text:'已发货',type:'primary'},
  completed: { text: '已完成', type: 'success' },
  cancelled: { text: '已取消', type: 'info' },
};

async function load() {
  const own=++requestRevision;
  loading.value = true;
  error.value='';
  list.value=[];
  total.value=0;
  try {
    const data = await fetchOrders({ role: role.value, page: page.value, pageSize,status:statusFilter.value,keyword:searchText.value.trim() });
    if(own!==requestRevision)return;
    const lastPage=Math.max(1,Math.ceil(data.total/pageSize));
    if(page.value>lastPage){page.value=lastPage;await load();return;}
    list.value = data.list;
    total.value = data.total;
  } catch {if(own===requestRevision)error.value='暂时无法读取订单，请重试。';
  } finally {
    if(own===requestRevision)loading.value = false;
  }
}

function switchRole(name) {
  role.value = name;
  page.value = 1;
  load();
}

async function onComplete(order) {
  try{await ElMessageBox.confirm('确认已收到物品并完成交易？', '确认收货', { type: 'warning' });
  await completeOrder(order.id);ElMessage.success('交易已完成');await load();}catch{}
}

async function onCancel(order) {
  try{await ElMessageBox.confirm('取消后商品会重新上架，确定取消吗？', '取消订单', { type: 'warning' });
  await cancelOrder(order.id);ElMessage.success('订单已取消');await load();}catch{}
}

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="container narrow">
      <div class="title-bar">
        <h2>我的订单</h2>
        <span class="hint">共 {{ total }} 笔</span>
      </div>

      <el-tabs :model-value="role" @tab-change="switchRole">
        <el-tab-pane v-for="t in tabs" :key="t.name" :label="t.label" :name="t.name" />
      </el-tabs>

      <form class="order-filters card" @submit.prevent="page=1;load()"><el-input v-model="searchText" aria-label="搜索我的订单" placeholder="搜索订单号或商品名称" clearable/><el-select v-model="statusFilter" aria-label="筛选订单状态" placeholder="全部状态" clearable @change="page=1;load()"><el-option label="待交易" value="pending"/><el-option label="已发货" value="shipped"/><el-option label="已完成" value="completed"/><el-option label="已取消" value="cancelled"/></el-select><el-button type="primary" native-type="submit">搜索订单</el-button></form>
      <div v-loading="loading" class="order-list">
        <div v-if="error" class="inline-error">{{error}}<el-button @click="load">重新加载</el-button></div>
        <div v-for="order in list" :key="order.id" class="order-card card">
          <div class="order-head">
            <span class="order-no">订单号 {{ order.orderNo }}</span>
            <span class="text-sub">{{ timeAgo(order.createdAt) }}</span>
            <el-tag :type="STATUS[order.status]?.type" size="small" effect="light">
              {{ STATUS[order.status]?.text }}
            </el-tag>
          </div>

          <div class="order-body">
            <img :src="resolveImage(order.cover)" class="thumb" />
            <div class="order-info">
              <RouterLink :to="{ name: 'itemDetail', params: { id: order.itemId } }" class="order-title">
                {{ order.itemTitle }}
              </RouterLink>
              <div class="text-sub parties">
                {{ role === 'buyer' ? `卖家：${order.sellerNickname}` : `买家：${order.buyerNickname}` }}
              </div>
              <div v-if="order.remark" class="text-sub remark">备注：{{ order.remark }}</div>
            </div>
            <div class="order-price">
              <strong>{{ formatPrice(order.price) }}</strong>
            </div>
          </div>

          <div class="order-management-row"><span>{{order.deliveryMode==='shipping'?'邮寄收货':'校内面交'}}</span><el-button text @click="showDetails(order)">订单详情</el-button></div>
          <div v-if="order.status==='completed'" class="order-actions"><span v-if="order.reviewId" class="text-sub">已评价 {{order.reviewRating}} 星</span><el-button v-else-if="role==='buyer'" type="primary" plain @click="reviewOrder=order;reviewRating=5;reviewText=''">评价本次交易</el-button></div>
          <div v-if="['pending','shipped'].includes(order.status)" class="order-actions"><el-button v-if="role==='seller'&&order.status==='pending'&&order.deliveryMode==='shipping'" type="primary" size="small" @click="startShip(order)">填写发货信息</el-button>
            <el-button
              v-if="role === 'buyer'&&(order.status==='shipped'||order.deliveryMode!=='shipping')"
              type="primary"
              size="small"
              @click="onComplete(order)"
            >
              确认收货
            </el-button>
            <el-button v-if="order.status==='pending'" size="small" @click="onCancel(order)">取消订单</el-button>
          </div>
        </div>

        <div v-if="!loading && !error && !list.length" class="empty-block">
          {{ role === 'buyer' ? '还没有买过东西，去逛逛吧' : '还没有卖出东西，完善描述更容易成交' }}
        </div>
      </div>

      <div v-if="total > pageSize" class="pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          background
          @current-change="load"
        />
      </div>
    </div>
    <OrderDetailDialog v-model="detailOpen" :order="selectedOrder"/>
    <el-dialog :model-value="!!shipTarget" title="填写发货信息" width="min(480px,94vw)" :close-on-click-modal="!shipBusy" :show-close="!shipBusy" @close="shipTarget=null"><p>{{shipTarget?.itemTitle}}</p><p class="order-note">请先在订单详情核对买家下单时的收货地址。</p><el-form label-position="top"><el-form-item label="快递公司"><el-input v-model="shipCarrier" maxlength="60" placeholder="如：顺丰速运"/></el-form-item><el-form-item label="快递单号"><el-input v-model="shipTracking" maxlength="80" placeholder="请核对运单号码"/></el-form-item></el-form><template #footer><el-button :disabled="shipBusy" @click="shipTarget=null">取消</el-button><el-button type="primary" :loading="shipBusy" :disabled="!shipCarrier.trim()||!shipTracking.trim()" @click="saveShipment">确认已发货</el-button></template></el-dialog>
    <el-dialog :model-value="!!reviewOrder" title="给这次校园交易一个评价" width="min(480px,92vw)" @close="reviewOrder=null"><p>{{reviewOrder?.itemTitle}}</p><el-form label-position="top"><el-form-item label="成交评分"><el-rate v-model="reviewRating" aria-label="成交评分" /></el-form-item><el-form-item label="评价内容"><el-input v-model="reviewText" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="聊聊物品成色和面交体验"/></el-form-item></el-form><template #footer><el-button @click="reviewOrder=null">暂不评价</el-button><el-button type="primary" :loading="reviewBusy" :disabled="!reviewText.trim()" @click="saveReview">发布评价</el-button></template></el-dialog>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 860px;
}

.order-list {
  min-height: 200px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
}

.order-card {
  padding: 14px 18px;
}

.order-head {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12.5px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f1f3f5;
}

.order-no {
  color: var(--text-sub);
}

.order-head .el-tag {
  margin-left: auto;
}

.order-body {
  display: flex;
  gap: 14px;
  padding: 12px 0;
  align-items: flex-start;
}

.thumb {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  object-fit: cover;
  background: #f0f2f5;
  flex-shrink: 0;
}

.order-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.order-title {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-title:hover {
  color: var(--brand);
}

.parties,
.remark {
  font-size: 12.5px;
}

.order-price strong {
  color: var(--price);
  font-size: 16px;
}

.order-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid #f1f3f5;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 22px;
}
</style>
