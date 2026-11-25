<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { fetchFavorites, removeFavorite } from '../api';
import { formatPrice, resolveImage, timeAgo } from '../utils/format';

const router = useRouter();
const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 12;
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await fetchFavorites({ page: page.value, pageSize });
    list.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function onRemove(item) {
  await removeFavorite(item.itemId);
  ElMessage.success('已取消收藏');
  load();
}

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="container">
      <div class="title-bar">
        <h2>我的收藏</h2>
        <span class="hint">共 {{ total }} 件</span>
      </div>

      <div v-loading="loading" class="fav-wrap">
        <div v-if="list.length" class="item-grid">
          <div v-for="item in list" :key="item.itemId" class="fav-card card">
            <RouterLink :to="{ name: 'itemDetail', params: { id: item.itemId } }">
              <img :src="resolveImage(item.cover)" class="cover" />
            </RouterLink>
            <div class="body">
              <RouterLink
                :to="{ name: 'itemDetail', params: { id: item.itemId } }"
                class="title"
              >
                {{ item.title }}
              </RouterLink>
              <span class="price">{{ formatPrice(item.price) }}</span>
              <div class="foot">
                <span class="text-sub">{{ timeAgo(item.favoritedAt) }}收藏</span>
                <el-button text size="small" @click="onRemove(item)">取消</el-button>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="!loading" class="empty-block">
          还没有收藏任何闲置，看到喜欢的点个收藏就会出现在这里
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
  </div>
</template>

<style scoped>
.fav-wrap {
  min-height: 200px;
}

.fav-card {
  overflow: hidden;
}

.cover {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: #f0f2f5;
  display: block;
}

.body {
  padding: 10px 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  font-size: 13.5px;
  font-weight: 500;
  height: 2.9em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}
</style>
