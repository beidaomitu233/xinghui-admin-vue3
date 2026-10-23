<script setup lang="ts">
import type {
  BusinessConfig,
  BusinessSection,
} from '#/api/system/business-config';

import { computed, nextTick, onMounted, reactive } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { useMediaQuery } from '@vueuse/core';
import { ElMessage } from 'element-plus';

import {
  getBusinessConfig,
  saveBusinessConfig,
} from '#/api/system/business-config';
import AdminPageHeader from '#/components/admin-page-header.vue';

const access = useAccessStore();
const narrow = useMediaQuery('(max-width: 767px)');
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
    title: '微信 · 电脑网站登录',
    fields: [
      { key: 'clientId', label: '网站应用 AppID' },
      {
        key: 'callbackUri',
        label: '授权回调',
        help: '填写本站 HTTPS 地址，以 /api/auth/wechat/callback 结尾。旧回调将在读取时规范为此 API 路径。',
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
    key: 'wechatMp',
    title: '微信 · 微信内 H5 登录',
    fields: [
      {
        key: 'clientId',
        label: '已认证服务号 AppID',
        help: '使用具有网页授权权限的服务号，与开放平台网站应用分别配置。',
      },
      {
        key: 'callbackUri',
        label: 'H5 授权回调',
        help: '填写本站 HTTPS 地址，以 /api/auth/wechat/mp-callback 结尾；在公众平台配置对应网页授权域名。',
      },
      {
        key: 'scope',
        label: '授权范围',
        options: [
          { label: '基础身份（snsapi_base）', value: 'snsapi_base' },
          { label: '用户授权（snsapi_userinfo）', value: 'snsapi_userinfo' },
        ],
        help: '只用于确认微信身份；不会自动创建产品账号。',
      },
    ],
    secretFields: [{ key: 'appSecret', label: '服务号 AppSecret' }],
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
    key: 'mail',
    title: '邮件服务',
    fields: [
      {
        key: 'provider',
        label: '邮件服务商',
        options: [
          { label: 'QQ 邮箱', value: 'qq' },
          { label: '163 邮箱', value: '163' },
          { label: '企业邮箱', value: 'enterprise' },
          { label: '通用 SMTP', value: 'smtp' },
        ],
      },
      {
        key: 'host',
        label: 'SMTP 主机',
        help: 'QQ / 163 使用固定预设；企业邮箱请核对服务商提供的 SMTP 地址。',
      },
      { key: 'port', label: 'SMTP 端口' },
      {
        key: 'security',
        label: '连接安全',
        options: [
          { label: 'SSL', value: 'SSL' },
          { label: 'STARTTLS', value: 'STARTTLS' },
        ],
      },
      { key: 'user', label: '完整邮箱账号' },
      { key: 'from', label: '发件邮箱' },
    ],
    secretFields: [
      {
        key: 'password',
        label: '授权码 / SMTP 密码',
        help: 'QQ、163 通常需要专用授权码，不是网页登录密码。',
      },
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
function providerChanged(section: SectionForm) {
  const original = section.value?.parameters;
  return (
    original?.provider !== section.parameters.provider ||
    (section.key === 'mail' &&
      ['host', 'user'].some(
        (key) => original?.[key] !== section.parameters[key],
      )) ||
    (['wechat', 'wechatMp'].includes(section.key) &&
      original?.clientId !== section.parameters.clientId) ||
    (section.key === 'wechat' &&
      original?.credentialMode !== section.parameters.credentialMode)
  );
}
function fieldVisible(section: SectionForm, field: Field) {
  if (field.key === 'secretEnvName')
    return section.parameters.credentialMode === 'ENV';
  if (section.key !== 'sms') return true;
  return field.key === 'region'
    ? section.parameters.provider === 'alibaba'
    : field.key !== 'sdkAppId' || section.parameters.provider === 'tencent';
}
function label(section: SectionForm, field: Field) {
  if (section.key === 'sms' && section.parameters.provider === 'tencent') {
    if (field.key === 'accessKeyId') return '腾讯云 SecretId';
    if (field.key === 'accessKeySecret') return '腾讯云 SecretKey';
  }
  return field.label;
}
function selectChanged(section: SectionForm, key: string) {
  if (key === 'credentialMode') {
    section.secrets = {};
    section.clear = {};
    return;
  }
  if (key !== 'provider') return;
  section.secrets = {};
  section.clear = {};
  if (section.key === 'mail') {
    const provider = section.parameters.provider;
    const hosts: Record<string, string> = {
      qq: 'smtp.qq.com',
      '163': 'smtp.163.com',
      enterprise: 'smtp.exmail.qq.com',
    };
    section.parameters.host = hosts[provider ?? ''] ?? '';
    section.parameters.port = '465';
    section.parameters.security = 'SSL';
    section.parameters.user = '';
    section.parameters.from = '';
  }
}
function presetLocked(section: SectionForm, field: Field) {
  return (
    section.key === 'mail' &&
    ['163', 'qq'].includes(section.parameters.provider ?? '') &&
    ['host', 'port', 'security'].includes(field.key)
  );
}
function credentialIdentityChanged(section: SectionForm, key: string) {
  if (
    (section.key === 'mail' && ['host', 'user'].includes(key)) ||
    (['wechat', 'wechatMp'].includes(section.key) && key === 'clientId')
  ) {
    section.secrets = {};
    section.clear = {};
  }
}
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
  <Page content-class="admin-page">
    <AdminPageHeader
      title="系统业务配置"
      description="分别保存微信、短信、邮件和对象存储设置。"
    />
    <el-alert
      class="mb-4"
      title="同一服务商密钥留空保持原值；切换服务商、邮件主机/账号或微信 AppID 需重新填写密钥。清除需单独勾选。"
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
        class="scroll-mt-28 rounded-lg border p-6"
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
          :label-position="narrow ? 'top' : 'right'"
          :disabled="!canEdit || section.saving || !section.value"
          @submit.prevent="save(section)"
        >
          <el-form-item label="启用">
            <el-switch v-model="section.enabled" />
          </el-form-item>
          <el-alert
            v-if="
              ['sms', 'mail'].includes(section.key) && providerChanged(section)
            "
            class="mb-4"
            title="服务商、邮件主机或账号已变更，不会沿用旧密钥，请填写新凭据后再启用。"
            type="info"
            :closable="false"
          />
          <el-form-item
            v-for="field in section.fields.filter((item) =>
              fieldVisible(section, item),
            )"
            :key="field.key"
            :label="field.label"
          >
            <div class="w-full max-w-2xl">
              <el-select
                v-if="field.options"
                v-model="section.parameters[field.key]"
                class="w-full"
                :disabled="presetLocked(section, field)"
                @change="selectChanged(section, field.key)"
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
                :disabled="presetLocked(section, field)"
                @input="credentialIdentityChanged(section, field.key)"
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
              :label="label(section, field)"
            >
              <div class="w-full max-w-2xl">
                <el-input
                  v-model="section.secrets[field.key]"
                  type="password"
                  show-password
                  autocomplete="new-password"
                  :placeholder="
                    providerChanged(section)
                      ? '请填写新服务商密钥'
                      : '留空保持原密钥'
                  "
                  :maxlength="8192"
                />
                <div class="mt-1 flex items-center gap-4">
                  <span class="text-xs text-muted-foreground">
                    {{
                      !providerChanged(section) &&
                      section.value?.secretsConfigured[field.key]
                        ? '已配置'
                        : '未配置'
                    }}
                  </span>
                  <el-checkbox v-model="section.clear[field.key]">
                    清除此密钥
                  </el-checkbox>
                </div>
                <p v-if="field.help" class="mt-1 text-xs text-muted-foreground">
                  {{ field.help }}
                </p>
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
