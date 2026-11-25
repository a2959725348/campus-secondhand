<script setup>
import { ref, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '../stores/user';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const formRef = ref();
const loading = ref(false);

const form = reactive({
  username: '',
  password: '',
});

const rules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { min: 4, max: 20, message: '账号需为 4-20 位', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码需为 6-20 位', trigger: 'blur' },
  ],
};

async function onSubmit() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    await userStore.login(form);
    ElMessage.success('登录成功');
    const target=typeof route.query.redirect==='string'&&route.query.redirect.startsWith('/')&&!route.query.redirect.startsWith('//')?route.query.redirect:{name:'home'};
    router.replace(userStore.user?.role==='admin'?{name:'admin'}:target);
  } catch {
    // 错误提示已由 axios 拦截器统一弹出，这里不用重复处理
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card card">
      <h2>登录拾光集市</h2>
      <p class="sub">用校园账号登录，和同校同学交易</p>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="请输入账号" size="large" clearable />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            show-password
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button type="primary" size="large" class="submit" :loading="loading" @click="onSubmit">
          登录
        </el-button>
      </el-form>

      <p class="foot">
        还没有账号？
        <RouterLink :to="{ name: 'register' }" class="link">立即注册</RouterLink>
      </p>

    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: calc(100vh - 64px);
  display: grid;
  place-items: center;
  padding: 40px 20px;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 32px 32px 26px;
}

h2 {
  margin: 0 0 6px;
  font-size: 22px;
}

.sub {
  margin: 0 0 22px;
  color: var(--text-sub);
  font-size: 13px;
}

.submit {
  width: 100%;
  margin-top: 6px;
}

.foot {
  margin: 18px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-sub);
}

.link {
  color: var(--brand);
  font-weight: 500;
}

</style>
