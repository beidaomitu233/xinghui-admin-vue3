<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import type { CaptchaState } from './captcha-state';

import { computed, h, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AuthenticationLogin, z } from '@vben/common-ui';

import { ElButton, ElMessage } from 'element-plus';

import {
  getCaptchaApi,
  getSmsLoginCapability,
  sendSmsLoginCode,
} from '#/api/core/auth';
import { WECHAT_FLOW_KEY } from '#/api/system/wechat';
import { useAuthStore } from '#/store';

import {
  createCaptchaController,
  getLoginCaptchaFields,
} from './captcha-state';
import WechatEntry from './wechat-entry.vue';

defineOptions({ name: 'CodeLogin' });
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const form = ref<InstanceType<typeof AuthenticationLogin>>();
const available = ref(false);
const checking = ref(true);
const sending = ref(false);
const remaining = ref(0);
const requestId = ref('');
const challengePhone = ref('');
const captcha = ref<CaptchaState>({ status: 'loading' });
const controller = createCaptchaController(getCaptchaApi, (state) => {
  captcha.value = state;
});
let countdown: ReturnType<typeof setInterval> | undefined;
let alive = true;

async function sendCode() {
  if (!available.value || sending.value || remaining.value) return;
  const values = await form.value?.getFormApi().getValues();
  const phone = String(values?.phone ?? '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    ElMessage.warning('请先填写正确的手机号');
    return;
  }
  const fields = getLoginCaptchaFields(
    captcha.value,
    String(values?.imageCode ?? ''),
  );
  if (
    !fields ||
    (captcha.value.status === 'ready' && captcha.value.enabled && !fields.code)
  ) {
    ElMessage.warning('请先完成图片验证码');
    return;
  }
  sending.value = true;
  try {
    const result = await sendSmsLoginCode({ phone, ...fields });
    if (!alive) return;
    requestId.value = result.requestId;
    challengePhone.value = phone;
    remaining.value = result.retryAfterSeconds;
    clearInterval(countdown);
    countdown = setInterval(() => {
      remaining.value = Math.max(0, remaining.value - 1);
      if (!remaining.value) clearInterval(countdown);
    }, 1000);
    ElMessage.success('如账号可用，将收到登录验证码');
  } catch {
    // The request client reports the failure; never pretend a send succeeded.
  } finally {
    sending.value = false;
    if (captcha.value.status === 'ready' && captcha.value.enabled && alive)
      await controller.refresh();
  }
}
const schema = computed((): VbenFormSchema[] => [
  {
    component: 'VbenInput',
    fieldName: 'phone',
    label: '手机号',
    componentProps: { placeholder: '请输入手机号', autocomplete: 'tel' },
    rules: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的手机号'),
  },
  ...(captcha.value.status === 'ready' && captcha.value.enabled
    ? [
        {
          component: 'VbenInput' as const,
          fieldName: 'imageCode',
          label: '图片验证码',
          componentProps: { placeholder: '请输入图片验证码' },
          rules: z.string().min(1, '请输入图片验证码'),
        },
      ]
    : []),
  {
    component: 'Input',
    fieldName: 'smsCode',
    label: '短信验证码',
    componentProps: {
      placeholder: '请输入6位短信验证码',
      maxlength: 6,
      autocomplete: 'one-time-code',
    },
    rules: z.string().regex(/^\d{6}$/, '请输入6位短信验证码'),
    renderComponentContent: () => ({
      append: () =>
        h(
          ElButton,
          {
            loading: sending.value,
            disabled: !available.value || !!remaining.value || sending.value,
            onClick: sendCode,
          },
          () => (remaining.value ? `${remaining.value}秒后重发` : '获取验证码'),
        ),
    }),
  },
]);
async function submit(values: Record<string, unknown>) {
  if (!requestId.value || String(values.phone) !== challengePhone.value) {
    ElMessage.warning('请先为当前手机号获取验证码');
    return;
  }
  try {
    await auth.authLogin(
      {
        phone: challengePhone.value,
        password: '',
        smsRequestId: requestId.value,
        smsCode: String(values.smsCode ?? ''),
      },
      sessionStorage.getItem(WECHAT_FLOW_KEY)
        ? () => router.replace('/auth/wechat-result').then(() => {})
        : undefined,
    );
  } catch {
    /* The request client reports errors; preserve the entered code. */
  }
}
onMounted(async () => {
  await Promise.all([
    controller.refresh(),
    getSmsLoginCapability()
      .then((result) => {
        available.value = result.available;
      })
      .catch(() => {
        available.value = false;
      }),
  ]);
  checking.value = false;
});
onUnmounted(() => {
  alive = false;
  clearInterval(countdown);
});
</script>
<template>
  <div
    class="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_300px] md:gap-12 md:px-5"
  >
    <AuthenticationLogin
      ref="form"
      title="短信验证码登录"
      sub-title="使用已开通账号的手机号登录"
      :form-schema="schema"
      :loading="auth.loginLoading"
      :submit-disabled="checking || !available || !requestId"
      :show-code-login="false"
      :show-qrcode-login="false"
      :show-remember-me="false"
      :show-forget-password="false"
      :show-register="false"
      :show-third-party-login="false"
      @submit="submit"
    >
      <template #third-party-login>
        <p
          v-if="!checking && !available"
          class="mt-3 text-sm text-muted-foreground"
          role="status"
        >
          短信登录暂未配置，请使用密码登录。
        </p>
        <button
          v-if="captcha.status === 'ready' && captcha.enabled"
          type="button"
          class="mt-3"
          @click="controller.refresh()"
        >
          <img
            :src="`data:image/png;base64,${captcha.img}`"
            alt="图片验证码，点击刷新"
          />
        </button>
        <ElButton
          v-else-if="captcha.status === 'error'"
          class="mt-3"
          link
          type="primary"
          @click="controller.refresh()"
        >
          重新获取图片验证码
        </ElButton>
        <div class="mt-5 text-center">
          <RouterLink
            class="text-sm text-primary"
            :to="{ path: '/auth/login', query: route.query }"
          >
            返回账号密码登录
          </RouterLink>
        </div>
      </template>
    </AuthenticationLogin>
    <WechatEntry class="md:border-l md:pl-8" />
  </div>
</template>
