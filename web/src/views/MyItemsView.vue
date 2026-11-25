<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchMyItems, updateItem, deleteItem } from '../api';
import { formatPrice, resolveImage, STATUS_LABELS, timeAgo } from '../utils/format';

const router = useRouter();
const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const loading = ref(false);
const status = ref('');

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'on_sale', label: '在售' },
  { value: 'reserved', label: '已预定' },
  { value: 'sold', label: '已售出' },
];

async function load() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize };
    if (status.value) params.status = status.value;
    const data = await fetchMyItems(params);
    list.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function switchStatus(val) {
  status.value = val;
  page.value = 1;
  load();
}

async function toggleShelf(item) {
  const next = item.status === 'on_sale' ? 'off_shelf' : 'on_sale';
  await updateItem(item.id, { status: next });
  ElMessage.success(next === 'on_sale' ? '已重新上架' : '已下架');
  load();
}

async function onDelete(item) {
  await ElMessageBox.confirm(`确定删除「${item.title}」吗？删除后不可恢复。`, '提示', {
    type: 'warning',
  });
  await deleteItem(item.id);
  ElMessage.success('已删除');
  load();
}

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="container narrow">
      <div class="title-bar">
        <h2>我发布的</h2>
        <span class="hint">共 {{ total }} 件</span>
      </div>

      <div class="status-chips">
        <button
          v-for="t in STATUS_TABS"
          :key="t.value"
          class="chip"
          :class="{ active: status === t.value }"
          @click="switchStatus(t.value)"
        >
          {{ t.label }}
        </button>
        <el-button type="primary" class="publish-btn" @click="router.push({ name: 'publish' })">
          发布新闲置
        </el-button>
      </div>

      <div v-loading="loading" class="mine-list">
        <div v-for="item in list" :key="item.id" class="mine-card card">
          <img :src="resolveImage(item.cover)" class="thumb" />
          <div class="info">
            <RouterLink :to="{ name: 'itemDetail', params: { id: item.id } }" class="title">
              {{ item.title }}
            </RouterLink>
            <div class="meta text-sub">
              {{ formatPrice(item.price) }} · {{ item.categoryName }} · {{ timeAgo(item.createdAt) }}
            </div>
            <div class="meta">
              <el-tag
                size="small"
                :type="item.status === 'on_sale' ? 'success' : item.status === 'sold' ? 'info' : 'warning'"
                effect="light"
              >
                {{ STATUS_LABELS[item.status] }}
              </el-tag>
              <span class="text-sub views">{{ item.viewCount }} 次浏览</span>
            </div>
          </div>
          <div class="actions">
            <el-button
              v-if="item.status === 'on_sale' || item.status === 'off_shelf'"
              size="small"
              @click="toggleShelf(item)"
            >
              {{ item.status === 'on_sale' ? '下架' : '上架' }}
            </el-button>
            <el-button size="small" type="danger" plain @click="onDelete(item)">删除</el-button>
          </div>
        </div>

        <div v-if="!loading && !list.length" class="empty-block">
          还没有发布过闲置，点右上角发一件试试
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
.narrow {
  max-width: 860px;
}

.status-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.chip {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 14px;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.chip.active {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.publish-btn {
  margin-left: auto;
}

.mine-list {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mine-card {
  padding: 14px;
  display: flex;
  gap: 14px;
  align-items: center;
}

.thumb {
  width: 76px;
  height: 76px;
  border-radius: 8px;
  object-fit: cover;
  background: #f0f2f5;
  flex-shrink: 0;
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.title {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title:hover {
  color: var(--brand);
}

.meta {
  font-size: 12.5px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.views {
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 22px;
}
</style>
