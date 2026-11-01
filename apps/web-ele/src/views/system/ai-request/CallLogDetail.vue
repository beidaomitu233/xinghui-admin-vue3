<script setup lang="ts">
import type { CallLogDetail } from '#/api/system/ai-call-log';

import { computed, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElDescriptions,
  ElDescriptionsItem,
  ElInput,
  ElMessage,
  ElRate,
} from 'element-plus';

import { getAiFeedback, rateAiOutput } from '#/api/system/ai-statistics';

import {
  costValue,
  entryLabels,
  exact,
  localDateTime,
  outputTime,
  responseText,
  statusLabels,
  tokenValue,
} from './call-log-format';

const props = defineProps<{ detail: CallLogDetail }>();
const call = computed(() => props.detail.call);
const access = useAccessStore();
const rating = ref(0);
const comment = ref('');
const savingRating = ref(false);
const ratingFilters = () => ({
  scope: access.accessCodes.includes('ai:request:audit')
    ? ('AUDIT' as const)
    : ('OWN' as const),
  from: new Date(new Date(call.value.startedAt).getTime() - 1000).toISOString(),
  to: new Date(
    new Date(call.value.startedAt).getTime() + 86_400_000,
  ).toISOString(),
});
watch(
  () => props.detail.call.callId,
  async (id) => {
    rating.value = 0;
    comment.value = '';
    if (!props.detail.response) return;
    try {
      const value = await getAiFeedback(id, ratingFilters());
      if (call.value.callId === id) {
        rating.value = Number(value.score ?? 0);
        comment.value = value.comment ?? '';
      }
    } catch {
      /* Detailed output remains available when feedback is unavailable. */
    }
  },
  { immediate: true },
);
async function saveRating() {
  savingRating.value = true;
  try {
    await rateAiOutput(
      call.value.callId,
      { score: rating.value, comment: comment.value },
      ratingFilters(),
    );
    ElMessage.success('评价已保存');
  } finally {
    savingRating.value = false;
  }
}
const transmission = computed(() => {
  if (call.value.streaming === null) return '未采集';
  return call.value.streaming ? '流式' : '非流式';
});
const response = computed(() =>
  call.value.responseAvailable ? props.detail.response : null,
);
const timingFields = [
  ['elapsedMs', '总耗时'],
  ['responseHeadersMs', '响应头'],
  ['firstByteMs', '首字节'],
  ['firstOutputMs', '首输出'],
  ['firstTextMs', '首文本'],
  ['lastOutputMs', '末次输出'],
] as const;
const tokenFields = [
  ['inputTokens', '输入'],
  ['outputTokens', '输出'],
  ['totalTokens', '总计'],
  ['cacheReadTokens', '缓存读取'],
  ['cacheWriteTokens', '缓存写入'],
  ['reasoningTokens', '推理'],
] as const;
const overview = computed(() => [
  ['类型', entryLabels[call.value.entryType]],
  ['状态', statusLabels[call.value.status] ?? call.value.status],
  ['业务模型', call.value.modelCode ?? call.value.modelRef],
  ['渠道', call.value.configName ?? call.value.providerCode],
  ['上游返回模型', call.value.returnedModel],
  ['传输', transmission.value],
  ['开始（本地）', localDateTime(call.value.startedAt)],
  ['结束（本地）', localDateTime(call.value.finishedAt)],
  ['实报费用', costValue(call.value)],
]);
const diagnostics = computed(() => [
  ['开始 ISO', call.value.startedAt],
  ['结束 ISO', call.value.finishedAt],
  ['供应商', call.value.providerCode],
  ['请求类别', call.value.requestKind],
  ['原始状态', call.value.status],
  ['原始类型', call.value.entryType],
  ['模型 ID', call.value.modelRef],
  ['Key 标记', call.value.maskedKeyLabel],
  ['请求 ID', call.value.requestId],
  ['交互 ID', call.value.callId],
  ['工作台会话', call.value.agentSessionId],
  ['工作台任务', call.value.agentRunId],
  ['模型轮次', call.value.agentModelCallId],
  ['尝试 ID', call.value.attemptId],
  ['尝试序号', call.value.attemptNumber],
  ['切换原因', call.value.switchReason],
  ['连接测试 ID', call.value.configurationTestId],
  ['关联 ID', call.value.configurationPairId],
  ['应用', call.value.appName ?? call.value.appId],
  ['应用 ID', call.value.appId],
  ['场景', call.value.sceneKey],
  ['租户', call.value.tenantRef],
  ['发起人', call.value.subjectRef],
  ['HTTP 状态', call.value.httpStatus],
  ['错误码', call.value.errorCode],
  ['上游请求 ID', call.value.providerRequestId],
  ['结束原因', call.value.finishReason],
  ['首输出类型', call.value.firstOutputKind],
]);
</script>

<template>
  <article class="call-detail">
    <h3>概览</h3>
    <ElDescriptions :column="1" border>
      <ElDescriptionsItem
        v-for="[label, value] in overview"
        :key="String(label)"
        :label="String(label)"
      >
        {{ exact(value, '未提供') }}
      </ElDescriptionsItem>
    </ElDescriptions>
    <h3>用量与时间</h3>
    <ElDescriptions :column="1" border>
      <ElDescriptionsItem
        v-for="[field, label] in tokenFields"
        :key="field"
        :label="`${label} Token`"
      >
        {{ tokenValue(call, call[field]) }}
      </ElDescriptionsItem>
      <ElDescriptionsItem
        v-for="[field, label] in timingFields"
        :key="field"
        :label="label"
      >
        {{
          field === 'firstOutputMs' || field === 'firstTextMs'
            ? outputTime(call, call[field])
            : exact(call[field]) + (call[field] === null ? '' : ' ms')
        }}
      </ElDescriptionsItem>
    </ElDescriptions>
    <p>
      首输出指首个非空模型内容，响应头、首字节与首文本分别计时。缓存、推理为用量子集，不重复相加。
    </p>
    <h3>响应数据</h3>
    <p>
      采集：{{
        {
          COMPLETE: '完整',
          PARTIAL: '部分',
          NOT_CAPTURED: '未采集',
          FAILED: '采集失败',
        }[call.captureStatus]
      }}
      <span v-if="call.captureReason">· {{ call.captureReason }}</span>
    </p>
    <p v-if="call.redacted || call.truncated">
      {{ call.redacted ? '已脱敏' : '' }} {{ call.truncated ? '已截断' : '' }}
    </p>
    <template v-if="response">
      <p>
        {{ response.format }} · 接收 {{ exact(response.receivedBytes) }} 字节 ·
        归档 {{ exact(response.archivedBytes) }} 字节
      </p>
      <template v-if="response.body !== null">
        <pre aria-label="上游响应正文" tabindex="0">{{
          responseText(response.body, response.format)
        }}</pre>
      </template>
      <p v-else>正文未归档</p>
      <h4>安全响应头</h4>
      <pre aria-label="安全响应头" tabindex="0">{{
        response.headers === null
          ? '未采集'
          : JSON.stringify(response.headers, null, 2)
      }}</pre>
      <h4>原始用量与扩展</h4>
      <pre aria-label="用量扩展" tabindex="0">{{
        response.usage === null
          ? '未采集'
          : JSON.stringify(response.usage, null, 2)
      }}</pre>
    </template>
    <p v-else>响应正文不可用或无权查看。</p>
    <ElCollapse>
      <ElCollapseItem title="诊断信息" name="diagnostics">
        <ElDescriptions :column="1" border>
          <ElDescriptionsItem
            v-for="[label, value] in diagnostics"
            :key="String(label)"
            :label="String(label)"
          >
            {{ exact(value, '未提供') }}
          </ElDescriptionsItem>
        </ElDescriptions>
      </ElCollapseItem>
    </ElCollapse>
    <section v-if="response" class="mt-5 border-t pt-4" aria-label="输出评价">
      <h3>输出评价</h3>
      <ElRate
        v-model="rating"
        show-text
        :texts="['不可用', '较差', '一般', '良好', '很好']"
      />
      <ElInput
        v-model="comment"
        type="textarea"
        :rows="2"
        :maxlength="1000"
        placeholder="准确性、完整性或需要改进的地方（可选）"
        class="my-3"
      />
      <ElButton
        type="primary"
        :disabled="rating === 0"
        :loading="savingRating"
        @click="saveRating"
      >
        保存评价
      </ElButton>
    </section>
  </article>
</template>

<style scoped>
.call-detail {
  min-width: 0;
}

.call-detail h3 {
  margin: 20px 0 12px;
  font-size: 16px;
  font-weight: 600;
}

.call-detail h4 {
  margin-top: 16px;
}

.call-detail p {
  margin: 10px 0;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.call-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 20px;
}

.call-facts div {
  min-width: 0;
  padding: 4px 0;
}

.call-facts dt {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.call-facts dd {
  margin-top: 6px;
  overflow-wrap: anywhere;
}

pre {
  max-width: 100%;
  max-height: 360px;
  padding: 14px;
  overflow: auto;
  font-size: 12px;
  white-space: pre;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.call-diagnostics {
  margin-top: 20px;
}

summary {
  padding: 8px 0;
  font-weight: 600;
  cursor: pointer;
}
</style>
