<template>
  <div class="dashboard-fullpage">
    <iframe :src="dashboardUrl" class="dashboard-iframe" frameborder="0" />
  </div>
</template>

<script setup>
import { ref } from 'vue'

const dashboardUrl = ref('/fe2/dashboard-enhanced.html')
</script>

<style scoped>
.dashboard-fullpage {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  z-index: 9999;
}
.dashboard-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
