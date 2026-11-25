<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '../stores/user';

const router = useRouter();
const userStore = useUserStore();

const formRef = ref();
const loading = ref(false);

const form = reactive({
  username: '',
  nickname: '',
  password: '',
  confirm: '',
});

function validateConfirm(rule, value, callback) {
  if (!value) return callback(new Error('请再次输入密码'));
  if (value !== form.password) return callback(new Error('两次输入的密码不一致'));
  return callback();
}

const rules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_]{4,20}$/, message: '账号需为 4-20 位字母、数字或下划线', trigger: 'blur' },
  ],
  nickname: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { max: 30, message: '昵称不能超过 30 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码需为 6-20 位', trigger: 'blur' },
  ],
  confirm: [{ validator: validateConfirm, trigger: 'blur' }],
};

async function onSubmit() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    await userStore.register({
      username: form.username,
      password: form.password,
      nickname: form.nickname,
    });
    ElMessage.success('注册成功，已自动登录');
    router.replace({ name: 'home' });
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card card">
      <h2>注册账号</h2>
      <p class="sub">填写基本信息即可开始发布闲置</p>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="4-20 位字母、数字或下划线" size="large" clearable />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="同学们看到的名字" size="large" clearable />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="6-20 位" size="large" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirm">
          <el-input
            v-model="form.confirm"
            type="password"
            placeholder="再输入一次"
            size="large"
            show-password
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button type="primary" size="large" class="submit" :loading="loading" @click="onSubmit">
          注册并登录
        </el-button>
      </el-form>

      <p class="foot">
        已有账号？
        <RouterLink :to="{ name: 'login' }" class="link">去登录</RouterLink>
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
