<script setup>
import { onMounted } from 'vue';
import { RouterView,useRoute } from 'vue-router';
const route=useRoute();
import AppHeader from './components/AppHeader.vue';
import AppFooter from './components/AppFooter.vue';
import { useUserStore } from './stores/user';

const userStore = useUserStore();

// 带着旧 token 重新打开页面时，校验一下是否还有效
onMounted(() => {
  userStore.refresh();
});
</script>

<template>
  <div class="app-shell">
    <AppHeader v-if="!route.meta.adminLayout" />
    <main>
      <RouterView />
    </main>
    <AppFooter v-if="!route.meta.adminLayout" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

main {
  flex: 1;
}
</style>
