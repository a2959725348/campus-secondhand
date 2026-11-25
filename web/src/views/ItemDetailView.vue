<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchItemDetail, addFavorite, removeFavorite, deleteItem } from '../api';
import { useUserStore } from '../stores/user';
import { CONDITION_LABELS, STATUS_LABELS, formatPrice, resolveImage, timeAgo } from '../utils/format';

import CommunityPanel from '../components/CommunityPanel.vue';
import OrderCheckout from '../components/OrderCheckout.vue';
const checkoutOpen=ref(false);
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const detail = ref(null);
const loading = ref(true);
const activeImage = ref(0);
const favorited = ref(false);
const submitting = ref(false);
const bookGenres={textbook:'课程教材',exam:'考试资料',reading:'课外阅读',other:'其他书籍'};
const bookNotes={none:'无笔记划线',light:'少量笔记',heavy:'较多笔记',unknown:'待卖家确认'};

const isOwner = computed(
  () => detail.value && userStore.user && detail.value.seller_id === userStore.user.id,
);

async function load() {
  loading.value = true;
  try {
    const data = await fetchItemDetail(route.params.id);
    detail.value = data;
    favorited.value = data.favorited;
  } catch {
    detail.value = null;
  } finally {
    loading.value = false;
  }
}

async function toggleFavorite() {
  if (!userStore.isLogin) {
    ElMessage.warning('请先登录再收藏');
    router.push({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  if (favorited.value) {
    await removeFavorite(detail.value.id);
    favorited.value = false;
    ElMessage.success('已取消收藏');
  } else {
    await addFavorite(detail.value.id);
    favorited.value = true;
    ElMessage.success('已加入收藏');
  }
}

async function onBuy() {
  if (!userStore.isLogin) {
    router.push({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  checkoutOpen.value=true;
}

async function onDelete() {
  await ElMessageBox.confirm('删除后不可恢复，确定删除这件商品吗？', '提示', { type: 'warning' });
  await deleteItem(detail.value.id);
  ElMessage.success('已删除');
  router.push({ name: 'mine' });
}

watch(()=>route.params.id,()=>{checkoutOpen.value=false;activeImage.value=0;load();});
onMounted(load);
</script>

<template>
  <div class="page">
    <div class="container">
      <el-breadcrumb separator="/" class="crumb">
        <el-breadcrumb-item :to="{ name: 'home' }">首页</el-breadcrumb-item>
        <el-breadcrumb-item :to="{ name: 'items' }">逛一逛</el-breadcrumb-item>
        <el-breadcrumb-item>{{ detail?.categoryName || '商品详情' }}</el-breadcrumb-item>
      </el-breadcrumb>

      <el-skeleton v-if="loading" :rows="8" animated />

      <div v-else-if="!detail" class="empty-block">
        <p>商品不存在或已被删除</p>
        <el-button @click="router.push({ name: 'items' })">返回列表</el-button>
      </div>

      <div v-else class="detail-layout">
        <!-- 左侧图集 -->
        <div class="gallery card">

          <img
            :src="resolveImage(detail.images?.[activeImage]?.url)"
            :alt="detail.title"
            class="main-img"
          />
          <div v-if="detail.images?.length > 1" class="thumbs">
            <img
              v-for="(img, idx) in detail.images"
              :key="img.id"
              :src="resolveImage(img.url)"
              class="thumb"
              :class="{ active: idx === activeImage }"
              @click="activeImage = idx"
            />
          </div>
        </div>

        <!-- 右侧信息 -->
        <div class="info card">
          <h1>{{ detail.title }}</h1>

          <div class="price-row">
            <span class="price-big">{{ formatPrice(detail.price) }}</span>
            <span v-if="detail.original_price" class="origin">
              原价 {{ formatPrice(detail.original_price) }}
            </span>
            <el-tag
              :type="detail.status === 'on_sale' ? 'success' : 'info'"
              size="small"
              effect="light"
            >
              {{ STATUS_LABELS[detail.status] }}
            </el-tag>
          </div>

          <div class="meta-grid">
            <div><span class="k">成色</span><span>{{ CONDITION_LABELS[detail.item_condition] }}</span></div>
            <div><span class="k">分类</span><span>{{ detail.categoryName }}</span></div>
            <div><span class="k">面交地点</span><span>{{ detail.trade_place || '面议' }}</span></div>
            <div><span class="k">浏览</span><span>{{ detail.view_count }} 次</span></div>
            <div><span class="k">发布时间</span><span>{{ timeAgo(detail.created_at) }}</span></div>
          </div>

          <el-divider />

          <div class="seller">
            <div class="avatar">{{ detail.sellerNickname?.[0] }}</div>
            <div class="seller-info">
              <strong>{{ detail.sellerNickname }}</strong>
              <span class="text-sub">{{ detail.sellerCampus || '校区未填' }} · 信用 {{ detail.sellerCredit }}</span>
            </div>
          </div>

          <div class="desc">
            <h4>商品描述</h4>
            <p>{{ detail.description }}</p>
          </div>

          <section v-if="detail.book" class="book-detail-info"><h3>买书前，先核对这些</h3><dl><div><dt>书籍类型</dt><dd>{{bookGenres[detail.book.genre]}}</dd></div><div><dt>作者</dt><dd>{{detail.book.author||'待卖家补充'}}</dd></div><div><dt>出版社</dt><dd>{{detail.book.publisher||'待卖家补充'}}</dd></div><div><dt>版本 / 版次</dt><dd>{{detail.book.edition||'待卖家确认'}}</dd></div><div><dt>适用课程</dt><dd>{{detail.book.course||'未填写'}}</dd></div><div><dt>笔记程度</dt><dd>{{bookNotes[detail.book.annotation]}}</dd></div><div v-if="detail.book.isbn"><dt>ISBN</dt><dd>{{detail.book.isbn}}</dd></div></dl><p>建议留言确认版次、目录和内页情况，校内面交验书后再确认收货。</p></section>

          <div class="actions">
            <template v-if="isOwner">
              <el-button type="primary" plain @click="router.push({ name: 'mine' })">
                管理我的商品
              </el-button>
              <el-button type="danger" plain :disabled="detail.status === 'sold'" @click="onDelete">
                删除
              </el-button>
            </template>
            <template v-else>
              <el-button
                type="primary"
                size="large"
                :loading="submitting"
                :disabled="detail.status !== 'on_sale'"
                @click="onBuy"
              >
                {{ detail.status === 'on_sale' ? (detail.book?'买下这本书':'我想要，下单') : '该商品不可购买' }}
              </el-button>
              <el-button size="large" @click="toggleFavorite">
                {{ favorited ? '已收藏' : '收藏' }}
              </el-button>
            </template>
          </div>
        </div>
      </div>
      <OrderCheckout v-if="detail" v-model="checkoutOpen" :item="detail" @created="router.push({name:'orders'})" />
      <CommunityPanel v-if="detail" :key="detail.id" :item-id="detail.id" :is-owner="isOwner" />
    </div>
  </div>
</template>

<style scoped>
.crumb {
  margin-bottom: 16px;
}

.detail-layout {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 22px;
  align-items: start;
}

.gallery {
  padding: 12px;
}

.main-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  background: #f0f2f5;
  display: block;
}

.thumbs {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
}

.thumb.active {
  border-color: var(--brand);
}

.info {
  padding: 24px 26px;
}

.info h1 {
  margin: 0 0 14px;
  font-size: 21px;
  line-height: 1.45;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 18px;
}

.price-big {
  font-size: 27px;
  font-weight: 700;
  color: var(--price);
}

.origin {
  color: var(--text-sub);
  font-size: 13px;
  text-decoration: line-through;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 18px;
  font-size: 13px;
}

.meta-grid .k {
  display: inline-block;
  width: 68px;
  color: var(--text-sub);
}

.seller {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--brand-light);
  color: var(--brand);
  display: grid;
  place-items: center;
  font-weight: 600;
}

.seller-info {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.seller-info .text-sub {
  font-size: 12px;
}

.desc h4 {
  margin: 18px 0 6px;
  font-size: 14px;
}

.desc p {
  margin: 0;
  color: #374151;
  white-space: pre-wrap;
}

.actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

@media (max-width: 900px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }
}
</style>
