<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { fetchCategories, createItem, uploadImage } from '../api';

const router = useRouter();
const route = useRoute();

const formRef = ref();
const categories = ref([]);
const loading = ref(false);
const previews = ref([]);
const uploading = ref(false);
/** 已上传成功的图片 url，与 previews 一一对应 */
const uploadedUrls = ref([]);
const book=reactive({author:'',publisher:'',edition:'',isbn:'',course:'',genre:'textbook',annotation:'unknown'});
const isBook=computed(()=>['book','books'].includes(categories.value.find(c=>c.id===form.categoryId)?.slug));
function chooseBook(){form.categoryId=categories.value.find(c=>['book','books'].includes(c.slug))?.id||null;}

const form = reactive({
  title: '',
  description: '',
  price: null,
  originalPrice: null,
  categoryId: null,
  condition: 'good',
  tradePlace: '',
  images: [],
});

const conditions = [
  { value: 'new', label: '全新未拆' },
  { value: 'like_new', label: '几乎全新' },
  { value: 'good', label: '成色良好' },
  { value: 'fair', label: '有使用痕迹' },
];

const rules = {
  title: [
    { required: true, message: '请输入商品标题', trigger: 'blur' },
    { max: 60, message: '标题不能超过 60 个字符', trigger: 'blur' },
  ],
  description: [
    { required: true, message: '请描述一下商品情况', trigger: 'blur' },
    { min: 10, message: '描述至少写 10 个字', trigger: 'blur' },
  ],
  price: [{ required: true, message: '请输入价格', trigger: 'blur' }],
  categoryId: [{ required: true, message: '请选择分类', trigger: 'change' }],
};

async function loadCategories() {
  categories.value = await fetchCategories();
  if(route.query.kind==='book')chooseBook();
}

/**
 * 选图后立刻上传，拿到后端返回的 url。
 * 先上传再提交表单，比把 base64 塞进 JSON 更靠谱：
 * 图片体积大，base64 会撑爆请求体，也没法利用浏览器缓存。
 */
async function onFileChange(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (previews.value.length + files.length > 6) {
    ElMessage.warning('最多上传 6 张图片');
    return;
  }
  if (!files.length) return;

  uploading.value = true;
  try {
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        ElMessage.warning(`${file.name} 超过 5MB，已跳过`);
        // eslint-disable-next-line no-continue
        continue;
      }
      const data = await uploadImage(file);
      uploadedUrls.value.push(data.url);
      previews.value.push(URL.createObjectURL(file));
    }
  } catch {
    // 拦截器已提示
  } finally {
    uploading.value = false;
  }
}

function removePreview(index) {
  URL.revokeObjectURL(previews.value[index]);
  previews.value.splice(index, 1);
  uploadedUrls.value.splice(index, 1);
}

async function onSubmit() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  if (form.originalPrice && Number(form.originalPrice) < Number(form.price)) {
    ElMessage.warning('原价不能低于售出价');
    return;
  }

  loading.value = true;
  try {
    const data = await createItem({
      title: form.title,
      description: form.description,
      price: form.price,
      originalPrice: form.originalPrice,
      categoryId: form.categoryId,
      condition: form.condition,
      tradePlace: form.tradePlace,
      images: uploadedUrls.value,
      ...(isBook.value?{book:{...book}}:{}),
    });
    ElMessage.success('发布成功');
    router.push({ name: 'itemDetail', params: { id: data.id } });
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false;
  }
}

onBeforeUnmount(() => previews.value.forEach(url => URL.revokeObjectURL(url)));
loadCategories().catch(() => {});
</script>

<template>
  <div class="page">
    <div class="container narrow">
      <div class="title-bar">
        <h2>{{isBook?'出售二手书':'发布闲置'}}</h2>
        <span class="hint">写得越清楚，卖得越快</span>
      </div>

      <div class="card form-card">
        <div class="publish-kind-tabs"><button :class="{active:!isBook}" @click="form.categoryId=null">普通闲置</button><button :class="{active:isBook}" @click="chooseBook">出售旧书</button></div>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
          <el-form-item label="商品标题" prop="title">
            <el-input v-model="form.title" maxlength="60" show-word-limit placeholder="例如：计算机网络 第 8 版 教材" />
          </el-form-item>

          <el-form-item label="商品描述" prop="description">
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="4"
              maxlength="800"
              show-word-limit
              placeholder="使用时长、有无笔记划线、附件是否齐全、为什么出…"
            />
          </el-form-item>

          <el-form-item label="分类" prop="categoryId">
            <el-select v-model="form.categoryId" placeholder="请选择" style="width: 100%">
              <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>

          <section v-if="isBook" class="book-publish-fields">
            <h3>把这本书介绍清楚</h3><p>版本和笔记情况越清楚，同学越容易找到需要的书。</p>
            <div class="book-field-grid">
              <el-form-item label="书籍类型"><el-select v-model="book.genre"><el-option label="课程教材" value="textbook"/><el-option label="考试资料" value="exam"/><el-option label="课外阅读" value="reading"/><el-option label="其他书籍" value="other"/></el-select></el-form-item>
              <el-form-item label="适用课程 / 考试"><el-input v-model="book.course" maxlength="80" placeholder="如：高等数学、四六级"/></el-form-item>
              <el-form-item label="作者（选填）"><el-input v-model="book.author" maxlength="100" placeholder="作者或主编"/></el-form-item>
              <el-form-item label="出版社（选填）"><el-input v-model="book.publisher" maxlength="100" placeholder="版权页上的出版社"/></el-form-item>
              <el-form-item label="版本 / 版次"><el-input v-model="book.edition" maxlength="60" placeholder="如：第七版、2026版"/></el-form-item>
              <el-form-item label="ISBN（选填）"><el-input v-model="book.isbn" maxlength="30" placeholder="封底的 10 位或 13 位 ISBN"/></el-form-item>
              <el-form-item label="笔记划线情况"><el-select v-model="book.annotation"><el-option label="无笔记划线" value="none"/><el-option label="少量笔记" value="light"/><el-option label="较多笔记" value="heavy"/><el-option label="暂未确认" value="unknown"/></el-select></el-form-item>
            </div>
            <p class="book-photo-tip">建议上传封面、版权页和有笔记的内页实拍，让买家提前确认版本与成色。</p>
          </section>

          <el-form-item label="出售价格" prop="price">
            <el-input-number v-model="form.price" :min="0" :max="999999" :precision="2" :step="5" />
            <span class="unit">元</span>
          </el-form-item>

          <el-form-item label="原价">
            <el-input-number v-model="form.originalPrice" :min="0" :max="999999" :precision="2" :step="10" />
            <span class="unit">元（选填，用于显示折扣）</span>
          </el-form-item>

          <el-form-item label="成色">
            <el-radio-group v-model="form.condition">
              <el-radio v-for="c in conditions" :key="c.value" :value="c.value">{{ c.label }}</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="面交地点">
            <el-input v-model="form.tradePlace" placeholder="例如：东校区图书馆一楼（选填）" />
          </el-form-item>

          <el-form-item label="商品图片">
            <div class="uploader">
              <label v-for="(img, idx) in previews" :key="idx" class="preview">
                <img :src="img" />
                <span class="remove" @click.prevent="removePreview(idx)">×</span>
              </label>
              <label v-if="previews.length < 6" class="upload-btn" :class="{ busy: uploading }">
                <input type="file" accept="image/*" multiple hidden :disabled="uploading" @change="onFileChange" />
                <span>{{ uploading ? '…' : '+' }}</span>
                <small>{{ uploading ? '上传中' : '最多 6 张' }}</small>
              </label>
            </div>
          </el-form-item>

          <el-form-item>
            <el-button type="primary" size="large" :loading="loading" :disabled="uploading" @click="onSubmit">
              立即发布
            </el-button>
            <el-button size="large" @click="router.back()">取消</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 820px;
}

.form-card {
  padding: 28px 30px 12px;
}

.unit {
  margin-left: 8px;
  color: var(--text-sub);
  font-size: 12px;
}

.uploader {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.preview {
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.remove {
  position: absolute;
  top: 2px;
  right: 4px;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
  cursor: pointer;
  line-height: 1;
}

.upload-btn {
  width: 84px;
  height: 84px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-sub);
  gap: 2px;
}

.upload-btn:hover {
  border-color: var(--brand);
  color: var(--brand);
}

.upload-btn span {
  font-size: 20px;
  line-height: 1;
}

.upload-btn small {
  font-size: 11px;
}
@media (max-width: 700px) {
  .form-card { padding: 22px 20px 10px; }
  .unit { font-size: 12px; }
  :deep(.el-radio-group) { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); width:100%; }
  :deep(.el-radio) { margin-right: 0; }
}
</style>
