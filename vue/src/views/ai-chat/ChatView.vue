<template>
  <div class="chat-page">
    <el-card class="chat-container">
      <template #header>
        <div class="chat-header">
          <el-icon size="20" color="#409eff"><ChatDotSquare /></el-icon>
          <span>警情智能问答助手</span>
          <el-button size="small" text icon="Delete" @click="clearMessages" style="margin-left:auto">清空对话</el-button>
        </div>
      </template>
      <div class="chat-messages" ref="messagesRef" @scroll.passive="onScroll">
        <div v-if="!messages.length" class="chat-empty">
          <el-icon size="48" color="#c0c4cc"><ChatLineSquare /></el-icon>
          <p>您好！我是智慧烟感智能助手</p>
          <p class="hint">您可以问我关于火灾预防、设备使用等方面的问题</p>
        </div>
        <div v-for="(msg, i) in messages" :key="i" :class="['msg-row', msg.role]">
          <div class="msg-avatar">
            <el-avatar :size="36" :icon="msg.role === 'user' ? 'UserFilled' : ''" :style="msg.role === 'assistant' ? 'background:#409eff' : ''">
              <span v-if="msg.role === 'assistant'">AI</span>
            </el-avatar>
          </div>
          <div class="msg-bubble">{{ msg.content }}</div>
        </div>
        <div v-if="sending" class="msg-row assistant">
          <div class="msg-avatar"><el-avatar :size="36" style="background:#409eff"><span>AI</span></el-avatar></div>
          <div class="msg-bubble typing"><span class="dot-pulse">...</span></div>
        </div>
      </div>
      <div class="chat-input">
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="2"
          placeholder="输入您的问题，例如：发生火灾如何逃生？"
          :disabled="sending"
          @keyup.enter="handleSend"
        />
        <el-button type="primary" :loading="sending" :disabled="!inputText.trim()" @click="handleSend" class="send-btn">
          <el-icon><Promotion /></el-icon>
          发送
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { ChatDotSquare, ChatLineSquare, Promotion, Delete } from '@element-plus/icons-vue'
import { sendMessage } from '../../api/conversation.js'

const messages = ref([])
const inputText = ref('')
const sending = ref(false)
const messagesRef = ref(null)

function scrollToBottom() {
  nextTick(() => {
    const el = messagesRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || sending.value) return
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  scrollToBottom()
  sending.value = true
  try {
    let sessionId = localStorage.getItem('chat_session_id')
    if (!sessionId) { sessionId = 'sess-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9); localStorage.setItem('chat_session_id', sessionId) }
    const res = await sendMessage({ question: text, sessionId })
    if (res.code === 200 && res.data) {
      messages.value.push({ role: 'assistant', content: res.data.answer })
      localStorage.setItem('chat_session_id', res.data.sessionId)
    } else {
      messages.value.push({ role: 'assistant', content: '抱歉，AI服务暂时不可用，请稍后重试。' })
    }
  } catch (e) {
    messages.value.push({ role: 'assistant', content: '网络异常，请检查网络连接后重试。' })
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

function clearMessages() {
  messages.value = []
  localStorage.removeItem('chat_session_id')
}

function onScroll() {}
</script>

<style scoped>
.chat-page { display: flex; flex-direction: column; height: calc(100vh - 120px); }
.chat-container { display: flex; flex-direction: column; height: 100%; }
.chat-container :deep(.el-card__body) { display: flex; flex-direction: column; height: calc(100% - 56px); padding: 0; }
.chat-header { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; }
.chat-messages {
  flex: 1; overflow-y: auto; padding: 20px;
  display: flex; flex-direction: column; gap: 16px;
}
.chat-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; color: #909399;
}
.chat-empty p { margin: 8px 0 0; font-size: 15px; }
.chat-empty .hint { font-size: 13px; color: #c0c4cc; margin-top: 4px; }
.msg-row { display: flex; gap: 10px; max-width: 80%; }
.msg-row.user { align-self: flex-end; flex-direction: row-reverse; }
.msg-row.assistant { align-self: flex-start; }
.msg-avatar { flex-shrink: 0; }
.msg-bubble {
  padding: 10px 14px; border-radius: 10px; font-size: 14px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
}
.msg-row.user .msg-bubble {
  background: #409eff; color: #fff;
  border-bottom-right-radius: 4px;
}
.msg-row.assistant .msg-bubble {
  background: #f0f2f5; color: #303133;
  border-bottom-left-radius: 4px;
}
.msg-bubble.typing { min-width: 50px; }
.dot-pulse { font-size: 20px; letter-spacing: 2px; animation: pulse 1.2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.chat-input {
  display: flex; gap: 12px; padding: 16px 20px;
  border-top: 1px solid #e8e8e8; background: #fafafa;
}
.chat-input .el-textarea { flex: 1; }
.send-btn { align-self: flex-end; height: 36px; }
</style>