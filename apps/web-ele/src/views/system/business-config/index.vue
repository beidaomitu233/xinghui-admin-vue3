<script setup lang="ts">
import type {
  BusinessConfig,
  BusinessSection,
} from '#/api/system/business-config';

import { computed, nextTick, onMounted, reactive } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage } from 'element-plus';

import {
  getBusinessConfig,
  saveBusinessConfig,
} from '#/api/system/business-config';

const access = useAccessStore();
const route = useRoute();
const canRead = computed(() =>
  access.accessCodes.includes('system:businessConfig:query'),
);
const canEdit = computed(() =>
  access.accessCodes.includes('system:businessConfig:edit'),
);
type Field = {
  help?: string;
  key: string;
  label: string;
  options?: { label: string; value: string }[];
};
type SectionForm = {
  clear: Record<string, boolean>;
  enabled: boolean;
  failed: boolean;
  fields: Field[];
  key: BusinessSection;
  loading: boolean;
  parameters: Record<string, string>;
  saving: boolean;
  secretFields: Field[];
  secrets: Record<string, string>;
  title: string;
  value?: BusinessConfig;
};
const sections = reactive<SectionForm[]>([
  {
    key: 'wechat',
    title: '微信网站授权',
    fields: [
      { key: 'clientId', label: '网站应用 AppID' },
      {
        key: 'callbackUri',
        label: '授权回调',
        help: '固定网站 HTTPS 地址，以 /auth/wechat/callback 结尾。',
      },
      {
        key: 'credentialMode',
        label: '密钥来源',
        options: [
          { label: '加密数据库', value: 'DB' },
          { label: '部署环境变量', value: 'ENV' },
        ],
      },
      {
        key: 'secretEnvName',
        label: '环境变量名称',
        help: '仅选择环境变量来源时填写。',
      },
    ],
    secretFields: [{ key: 'appSecret', label: 'AppSecret' }],
    loading: false,
    saving: false,
    failed: false,
    enabled: false,
    parameters: {},
    secrets: {},
    clear: {},
  },
  {
    key: 'sms',
    title: '短信服务',
    fields: [
      {
        key: 'provider',
        label: '供应商',
        options: [
          { label: '阿里云', value: 'alibaba' },
          { label: '腾讯云', value: 'tencent' },
        ],
      },
      { key: 'signature', label: '短信签名' },
      { key: 'templateId', label: '模板编号' },
      { key: 'region', label: '阿里云区域', help: '例如 cn-hangzhou。' },
      { key: 'sdkAppId', label: '腾讯云 SDK AppID' },
    ],
    secretFields: [
      { key: 'accessKeyId', label: 'AccessKey ID' },
      { key: 'accessKeySecret', label: 'AccessKey Secret' },
    ],
    loading: false,
    saving: false,
    failed: false,
    enabled: false,
    parameters: {},
    secrets: {},
    clear: {},
  },
  {
    key: 'oss',
    title: '对象存储',
    fields: [
      {
        key: 'provider',
        label: '存储服务',
        options: [{ label: 'MinIO', value: 'minio' }],
      },
      {
        key: 'endpoint',
        label: 'MinIO 端点',
        help: '例如 https://storage.example.com。',
      },
      { key: 'bucket', label: '存储桶' },
      {
        key: 'basePath',
        label: '对象前缀',
        help: '例如 files/；不影响旧文件的存储平台。',
      },
    ],
    secretFields: [
      { key: 'accessKey', label: 'Access Key' },
      { key: 'secretKey', label: 'Secret Key' },
    ],
    loading: false,
    saving: false,
    failed: false,
    enabled: false,
    parameters: {},
    secrets: {},
    clear: {},
  },
]);
function apply(section: SectionForm, value: BusinessConfig) {
  section.value = value;
  section.enabled = value.enabled;
  section.parameters = { ...value.parameters };
  section.secrets = {};
  section.clear = {};
  section.failed = false;
}
async function reload(section: SectionForm) {
  if (!canRead.value || section.loading || section.saving) return;
  section.loading = true;
  try {
    apply(section, await getBusinessConfig(section.key));
  } catch {
    section.failed = true;
    ElMessage.error(`读取${section.title}失败`);
  } finally {
    section.loading = false;
  }
}
async function save(section: SectionForm) {
  if (!canEdit.value || !section.value || section.saving || section.loading)
    return;
  section.saving = true;
  try {
    const value = await saveBusinessConfig(section.key, {
      enabled: section.enabled,
      parameters: { ...section.parameters },
      secrets: { ...section.secrets },
      clearSecrets: Object.keys(section.clear).filter(
        (key) => section.clear[key],
      ),
      revision: section.value.revision,
    });
    apply(section, value);
    ElMessage.success(`${section.title}已保存`);
  } catch {
    ElMessage.error(`保存${section.title}失败，输入已保留`);
  } finally {
    section.saving = false;
  }
}
function status(section: SectionForm) {
  const state = section.value?.effectiveState;
  if (state === 'DEPLOYMENT_ACTIVE') return '当前使用部署配置，保存后即时切换';
  if (state === 'ADAPTED_SEND_UNVERIFIED')
    return '配置已生效，真实发送尚未验证';
  if (state === 'AUTHORIZATION_READY_IDENTITY_UNVERIFIED')
    return '授权配置已生效，微信身份扫码验证暂缓';
  if (state === 'ACTIVE') return '已生效';
  if (state === 'SECRET_UNAVAILABLE') return '密钥不可用';
  return '已停用';
}
onMounted(async () => {
  await Promise.all(sections.map((section) => reload(section)));
  await nextTick();
  const target = String(route.query.section ?? '');
  if (sections.some((section) => section.key === target))
    document
      .querySelector(`#business-${target}`)
      ?.scrollIntoView({ block: 'start' });
});
</script>
<template>
  <Page title="系统业务配置" description="分别保存微信、短信和对象存储设置。">
    <el-alert
      class="mb-4"
      title="密钥留空表示保持原值，清除需单独勾选。"
      type="info"
      show-icon
      closable
    />
    <el-empty v-if="!canRead" description="没有业务配置查询权限" />
    <div v-else class="flex flex-col gap-6">
      <section
        v-for="section in sections"
        :id="`business-${section.key}`"
        :key="section.key"
        class="rounded-lg border p-6"
      >
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">{{ section.title }}</h2>
          <span class="text-sm text-muted-foreground">
            {{ status(section) }}
          </span>
        </div>
        <el-alert
          v-if="section.failed"
          class="mb-4"
          :title="`读取${section.title}失败，请重试。`"
          type="error"
          closable
        />
        <el-form
          v-loading="section.loading"
          label-width="150px"
          :disabled="!canEdit || section.saving || !section.value"
          @submit.prevent="save(section)"
        >
          <el-form-item label="启用">
            <el-switch v-model="section.enabled" />
          </el-form-item>
          <el-form-item
            v-for="field in section.fields"
            :key="field.key"
            :label="field.label"
          >
            <div class="w-full max-w-2xl">
              <el-select
                v-if="field.options"
                v-model="section.parameters[field.key]"
                class="w-full"
              >
                <el-option
                  v-for="option in field.options"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <el-input
                v-else
                v-model="section.parameters[field.key]"
                :maxlength="2048"
              />
              <p v-if="field.help" class="mt-1 text-xs text-muted-foreground">
                {{ field.help }}
              </p>
            </div>
          </el-form-item>
          <template
            v-if="
              section.key !== 'wechat' ||
              section.parameters.credentialMode === 'DB'
            "
          >
            <el-form-item
              v-for="field in section.secretFields"
              :key="field.key"
              :label="field.label"
            >
              <div class="w-full max-w-2xl">
                <el-input
                  v-model="section.secrets[field.key]"
                  type="password"
                  show-password
                  autocomplete="new-password"
                  placeholder="留空保持原密钥"
                  :maxlength="8192"
                />
                <div class="mt-1 flex items-center gap-4">
                  <span class="text-xs text-muted-foreground">
                    {{
                      section.value?.secretsConfigured[field.key]
                        ? '已配置'
                        : '未配置'
                    }}
                  </span>
                  <el-checkbox v-model="section.clear[field.key]">
                    清除此密钥
                  </el-checkbox>
                </div>
              </div>
            </el-form-item>
          </template>
          <el-form-item>
            <el-button
              v-if="canEdit"
              type="primary"
              :loading="section.saving"
              native-type="submit"
            >
              保存{{ section.title }}
            </el-button>
            <span
              v-if="section.value"
              class="ml-4 text-xs text-muted-foreground"
            >
              版本 {{ section.value.revision }}
            </span>
          </el-form-item>
        </el-form>
        <el-button
          :disabled="section.loading || section.saving"
          @click="reload(section)"
        >
          重新读取
        </el-button>
      </section>
    </div>
  </Page>
</template>
