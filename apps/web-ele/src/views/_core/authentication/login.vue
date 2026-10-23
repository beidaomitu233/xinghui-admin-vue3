<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import type { CaptchaState } from './captcha-state';

import type { AuthApi } from '#/api/core/auth';

import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationLogin, z } from '@vben/common-ui';

import { getCaptchaApi } from '#/api/core/auth';
import {
  getWechatFlow,
  safeWechatReturn,
  WECHAT_FLOW_KEY,
} from '#/api/system/wechat';
import { useAuthStore } from '#/store';

import {
  createCaptchaController,
  getLoginCaptchaFields,
} from './captcha-state';
import WechatEntry from './wechat-entry.vue';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();
const router = useRouter();
const DemoLogin =
  import.meta.env.VITE_APP_DEMO === 'true'
    ? defineAsyncComponent(() => import('../../../demo/login-entry.vue'))
    : undefined;
const captchaState = ref<CaptchaState>({ status: 'loading' });
const captchaEnabled = computed(
  () => captchaState.value.status === 'ready' && captchaState.value.enabled,
);
const captchaImage = computed(() =>
  captchaState.value.status === 'ready' ? captchaState.value.img : '',
);
const captchaController = createCaptchaController(getCaptchaApi, (state) => {
  captchaState.value = state;
});

async function refreshCaptcha() {
  await captchaController.refresh();
}

async function submit(values: Record<string, unknown>) {
  const captcha = captchaState.value;
  const captchaFields = getLoginCaptchaFields(
    captcha,
    String(values.code ?? ''),
  );
  if (captchaFields === null) return;
  try {
    await authStore.authLogin(
      {
        phone: String(values.phone ?? ''),
        password: String(values.password ?? ''),
        ...captchaFields,
      } satisfies AuthApi.LoginParams,
      sessionStorage.getItem(WECHAT_FLOW_KEY)
        ? async () => {
            const flow = sessionStorage.getItem(WECHAT_FLOW_KEY) ?? '';
            try {
              const result = await getWechatFlow(flow);
              if (result.status === 'READY_BIND') {
                await router.replace('/auth/wechat-result');
                return;
              }
              sessionStorage.removeItem(WECHAT_FLOW_KEY);
              await router.replace(safeWechatReturn(result.returnPath));
            } catch {
              sessionStorage.removeItem(WECHAT_FLOW_KEY);
              await router.replace('/');
            }
          }
        : undefined,
    );
  } catch {
    if (captcha.status === 'ready' && captcha.enabled) await refreshCaptcha();
  }
}

const formSchema = computed((): VbenFormSchema[] => [
  {
    component: 'VbenInput',
    componentProps: { placeholder: '请输入11位手机号' },
    fieldName: 'phone',
    label: '手机号',
    rules: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的手机号'),
  },
  {
    component: 'VbenInputPassword',
    componentProps: { placeholder: '请输入密码' },
    fieldName: 'password',
    label: '密码',
    rules: z.string().min(1, '请输入密码'),
  },
  ...(captchaEnabled.value
    ? [
        {
          component: 'VbenInput' as const,
          componentProps: { placeholder: '请输入图片验证码' },
          fieldName: 'code',
          label: '验证码',
          rules: z.string().min(1, '请输入验证码'),
        },
      ]
    : []),
]);

onMounted(() => {
  refreshCaptcha();
});
</script>

<template>
  <component :is="DemoLogin" v-if="DemoLogin" />
  <AuthenticationLogin
    v-else
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    :submit-disabled="captchaState.status !== 'ready'"
    :show-code-login="false"
    :show-qrcode-login="false"
    :show-register="false"
    :show-remember-me="true"
    :show-forget-password="false"
    :show-third-party-login="false"
    @submit="submit"
  >
    <template #third-party-login>
      <WechatEntry />
      <p v-if="captchaState.status === 'loading'" class="mt-3" role="status">
        正在获取验证码配置…
      </p>
      <div
        v-else-if="captchaState.status === 'error'"
        class="mt-3"
        role="alert"
      >
        <span>验证码加载失败，请重试。</span>
        <button class="ml-2 underline" type="button" @click="refreshCaptcha">
          重试
        </button>
      </div>
      <button
        v-else-if="captchaEnabled"
        class="mt-3 flex items-center gap-2"
        type="button"
        @click="refreshCaptcha"
      >
        <img
          :src="`data:image/png;base64,${captchaImage}`"
          alt="验证码，点击刷新"
        />
        <span>换一张</span>
      </button>
    </template>
  </AuthenticationLogin>
</template>
