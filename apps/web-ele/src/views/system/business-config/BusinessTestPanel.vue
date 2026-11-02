<script setup lang="ts">
import type { UploadRequestOptions } from 'element-plus';

import type {
  BusinessConfig,
  BusinessProbeReceipt,
  BusinessSection,
} from '#/api/system/business-config';
import type { OssFile } from '#/api/system/file';
import type { WechatFlowStatus } from '#/api/system/wechat';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import { useQRCode } from '@vueuse/integrations/useQRCode';
import {
  ElAlert,
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElTag,
  ElUpload,
} from 'element-plus';

import { testBusinessConfig } from '#/api/system/business-config';
import { downloadFile, uploadFile } from '#/api/system/file';
import {
  cancelWechatFlow,
  getWechatFlow,
  isWechatLoginUrl,
  startWechatLogin,
} from '#/api/system/wechat';

const props = defineProps<{
  config?: BusinessConfig;
  dirty: boolean;
  editable: boolean;
  section: BusinessSection;
}>();
const access = useAccessStore();
const route = useRoute();
const recipient = ref('');
const subject = ref('业务系统邮件测试');
const content = ref('这是一封测试邮件，用于确认当前邮件服务可以正常发送。');
const variables = ref('{"code":"123456"}');
const busy = ref(false);
const error = ref('');
const receipt = ref<BusinessProbeReceipt>();
const uploaded = ref<OssFile>();
const url = ref('');
const flow = ref('');
const state = ref<WechatFlowStatus['status']>();
const qr = useQRCode(url, { width: 220, margin: 2 });
const ready = computed(
  () => props.editable && props.config?.enabled && !props.dirty,
);
const wechat = computed(
  () => props.section === 'wechat' || props.section === 'wechatMp',
);
const title = computed(
  () =>
    ({
      wechat: '电脑扫码登录',
      wechatMp: '微信内 H5 授权',
      sms: '短信测试',
      mail: '邮件测试',
      oss: '存储测试',
    })[props.section],
);
const flowLabel = computed(() =>
  state.value
    ? {
        WAITING: '等待微信确认',
        READY_BIND: '身份确认成功，当前微信尚未绑定产品账号',
        READY_LOGIN: '身份确认成功，可完成登录',
        COMPLETED: '登录已完成',
        EXPIRED: '授权已过期',
        CANCELLED: '已取消',
        FAILED: '授权失败',
      }[state.value]
    : '',
);
let timer: ReturnType<typeof setTimeout> | undefined;
async function stopAuthorization() {
  clearTimeout(timer);
  const current = flow.value;
  flow.value = '';
  url.value = '';
  state.value = undefined;
  if (current) await cancelWechatFlow(current).catch(() => {});
}
watch(
  () => props.config?.revision,
  () => {
    receipt.value = undefined;
    uploaded.value = undefined;
    void stopAuthorization();
  },
);
onBeforeUnmount(() => {
  void stopAuthorization();
});
function failure(fallback: string, value: unknown) {
  const message = (value as { response?: { data?: { message?: string } } })
    ?.response?.data?.message;
  error.value =
    typeof message === 'string' && message.length < 200 ? message : fallback;
}
async function checkFlow(current: string) {
  if (flow.value !== current) return;
  try {
    const result = await getWechatFlow(current);
    if (flow.value !== current) return;
    state.value = result.status;
    if (result.status === 'WAITING')
      timer = setTimeout(() => {
        void checkFlow(current);
      }, 2000);
    else url.value = '';
  } catch {
    if (flow.value === current)
      error.value = '授权状态读取失败，请重新发起测试。';
  }
}
async function authorize() {
  if (!ready.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await stopAuthorization();
    const channel = props.section === 'wechatMp' ? 'mp' : 'website';
    const result = await startWechatLogin(
      channel,
      `${route.path}?section=${props.section}`,
    );
    if (!isWechatLoginUrl(result.authorizationUrl, channel))
      throw new Error('Invalid authorization URL');
    flow.value = result.flow;
    url.value = result.authorizationUrl;
    state.value = 'WAITING';
    void checkFlow(result.flow);
  } catch (error_) {
    failure('授权未发起，请检查 AppID、回调域名与密钥配置。', error_);
  } finally {
    busy.value = false;
  }
}
async function send() {
  if (
    !ready.value ||
    busy.value ||
    !props.config ||
    !['mail', 'sms'].includes(props.section)
  )
    return;
  busy.value = true;
  error.value = '';
  receipt.value = undefined;
  try {
    let params: Record<string, string> | undefined;
    if (props.section === 'sms') {
      const value: unknown = JSON.parse(variables.value);
      if (
        !value ||
        Array.isArray(value) ||
        typeof value !== 'object' ||
        Object.values(value).some((item) => typeof item !== 'string')
      )
        throw new Error('Invalid template parameters');
      params = value as Record<string, string>;
    }
    receipt.value = await testBusinessConfig(props.section as 'mail' | 'sms', {
      revision: props.config.revision,
      recipient: recipient.value.trim(),
      subject: subject.value,
      content: content.value,
      variables: params,
    });
  } catch (error_) {
    failure(
      props.section === 'sms'
        ? '测试未完成，请核对手机号、模板参数和服务商配置。'
        : '测试未完成，请核对收件邮箱与邮件配置。',
      error_,
    );
  } finally {
    busy.value = false;
  }
}
async function upload(options: UploadRequestOptions) {
  if (!ready.value || busy.value) throw new Error('请先保存并启用存储配置');
  busy.value = true;
  error.value = '';
  uploaded.value = undefined;
  try {
    uploaded.value = await uploadFile(options.file);
    return uploaded.value;
  } catch (error_) {
    failure('文件未上传成功，请检查存储配置和当前上传权限。', error_);
    throw error_;
  } finally {
    busy.value = false;
  }
}
async function verifyDownload() {
  if (!uploaded.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const blob = await downloadFile(uploaded.value.ossId);
    if (blob.size !== Number(uploaded.value.size))
      throw new Error('File size mismatch');
    receipt.value = {
      status: 'ACCEPTED',
      message: '上传与下载验证通过，文件大小一致',
      requestId: uploaded.value.ossId,
      provider: 'minio',
      revision: props.config?.revision || 0,
      elapsedMs: 0,
    };
  } catch (error_) {
    failure('下载验证失败，请检查文件访问权限。', error_);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <aside class="business-test-panel" :aria-label="title">
    <h3 class="mb-5 text-base font-semibold">{{ title }}</h3>
    <ElAlert
      v-if="dirty"
      title="有未保存的修改，请先保存后测试"
      type="info"
      :closable="false"
      class="mb-5"
    />
    <ElAlert
      v-else-if="!config?.enabled"
      title="请先启用并保存配置"
      type="info"
      :closable="false"
      class="mb-5"
    />
    <template v-if="wechat">
      <div class="authorization-preview">
        <iframe
          v-if="url && section === 'wechat'"
          :src="url"
          title="微信授权二维码"
          class="h-[380px] w-[280px] border-0"
          referrerpolicy="no-referrer"
        ></iframe>
        <img
          v-else-if="url && qr"
          :src="qr"
          alt="微信内 H5 授权二维码"
          width="220"
          height="220"
        />
        <ElEmpty
          v-else
          :image-size="72"
          :description="
            flowLabel ||
            (section === 'wechatMp'
              ? '生成授权入口后，在微信中扫码打开'
              : '生成二维码后，使用手机微信确认')
          "
        />
      </div>
      <p v-if="flowLabel" role="status" class="my-4 text-sm">{{ flowLabel }}</p>
      <ElButton
        :disabled="!ready"
        :loading="busy"
        class="mt-5"
        type="primary"
        @click="authorize"
      >
        {{ flow ? '重新生成授权入口' : '测试微信授权' }}
      </ElButton>
      <ElButton v-if="flow" class="mt-5" @click="stopAuthorization">
        取消测试
      </ElButton>
    </template>
    <ElForm
      v-else-if="section === 'sms' || section === 'mail'"
      label-position="top"
      @submit.prevent="send"
    >
      <ElFormItem :label="section === 'sms' ? '测试手机号' : '收件邮箱'">
        <ElInput
          v-model="recipient"
          :disabled="!editable || busy"
          :placeholder="
            section === 'sms'
              ? '请输入接收测试短信的手机号'
              : '请输入接收测试邮件的邮箱'
          "
          :maxlength="254"
        />
      </ElFormItem>
      <template v-if="section === 'sms'">
        <ElDescriptions :column="1" border size="small" class="mb-5">
          <ElDescriptionsItem label="短信签名">
            {{ config?.parameters.signature || '未配置' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="模板编号">
            {{ config?.parameters.templateId || '未配置' }}
          </ElDescriptionsItem>
        </ElDescriptions>
        <ElFormItem label="模板参数（JSON）">
          <ElInput
            v-model="variables"
            :disabled="!editable || busy"
            type="textarea"
            :rows="4"
            :maxlength="5000"
          />
        </ElFormItem>
        <p class="mb-5 text-xs text-muted-foreground">
          按当前服务商已审核模板发送，参数名称和顺序须与模板一致。
        </p>
      </template>
      <template v-else>
        <ElFormItem label="主题">
          <ElInput
            v-model="subject"
            :disabled="!editable || busy"
            :maxlength="120"
          />
        </ElFormItem>
        <ElFormItem label="邮件内容">
          <ElInput
            v-model="content"
            :disabled="!editable || busy"
            type="textarea"
            :rows="6"
            :maxlength="5000"
          />
        </ElFormItem>
      </template>
      <ElButton
        type="primary"
        native-type="submit"
        :disabled="!ready || !recipient.trim()"
        :loading="busy"
      >
        {{ section === 'sms' ? '发送测试短信' : '发送测试邮件' }}
      </ElButton>
    </ElForm>
    <template v-else>
      <ElDescriptions :column="1" border class="mb-5">
        <ElDescriptionsItem label="存储桶">
          {{ config?.parameters.bucket || '未配置' }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="目录前缀">
          {{ config?.parameters.basePath || '/' }}
        </ElDescriptionsItem>
      </ElDescriptions>
      <ElUpload
        drag
        :show-file-list="false"
        :disabled="
          !ready || busy || !access.accessCodes.includes('system:oss:upload')
        "
        :http-request="upload"
      >
        <p class="py-5">选择一个测试文件，验证当前存储的实际上传能力</p>
      </ElUpload>
      <ElDescriptions v-if="uploaded" :column="1" class="mt-5">
        <ElDescriptionsItem label="文件">
          {{ uploaded.originalName }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="大小">
          {{ uploaded.size }} 字节
        </ElDescriptionsItem>
        <ElDescriptionsItem label="结果">
          <ElTag type="success">已上传</ElTag>
        </ElDescriptionsItem>
      </ElDescriptions>
      <ElButton
        v-if="uploaded && access.accessCodes.includes('system:oss:download')"
        :loading="busy"
        @click="verifyDownload"
      >
        验证下载
      </ElButton>
    </template>
    <ElAlert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="mt-5"
    />
    <ElAlert
      v-if="receipt"
      :title="receipt.message"
      type="success"
      show-icon
      :closable="false"
      class="mt-5"
    />
    <p
      v-if="receipt && section !== 'oss'"
      class="mt-3 text-xs text-muted-foreground"
    >
      配置版本 {{ receipt.revision }} · 耗时 {{ receipt.elapsedMs }} ms
    </p>
  </aside>
</template>

<style scoped>
.business-test-panel {
  min-width: 0;
  padding-left: 28px;
  border-left: 1px solid hsl(var(--border));
}

.authorization-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 270px;
  background: hsl(var(--muted) / 35%);
  border-radius: 8px;
}

@media (max-width: 1100px) {
  .business-test-panel {
    padding: 24px 0 0;
    border-top: 1px solid hsl(var(--border));
    border-left: 0;
  }
}
</style>
