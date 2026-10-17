const messages: Record<string, string> = {
  AUTH_FAILED: '模型认证暂不可用。',
  CANCELLED: '已取消生成。',
  CAPABILITY_UNSUPPORTED: '模型不支持当前输出要求。',
  CONTENT_REJECTED: '本次请求未能生成内容。',
  CONVERSATION_FULL: '此对话已达长度上限，请新建对话；已有历史仍可查看。',
  CREDENTIAL_UNAVAILABLE: 'AI 配置暂不可用，请联系管理员。',
  DEADLINE_EXCEEDED: '生成已超时。',
  DEPENDENCY_UNAVAILABLE: 'AI 服务暂不可用。',
  FORBIDDEN: '没有此应用的调用权限。',
  INTERNAL_FAILURE: '生成未完成，请保留追踪 ID。',
  INVALID_INPUT: '输入内容不符合要求。',
  INVALID_RESPONSE: '生成结果未完成。',
  MISSING_VARIABLE: '缺少必填输入。',
  MODEL_UNAVAILABLE: '模型暂不可用。',
  NETWORK_ERROR: '连接中断，请查询原请求。',
  NOT_FOUND: '请求不存在或无权访问。',
  NO_USABLE_KEY: '模型暂不可用。',
  OUTPUT_LIMIT: '已达到本次生成预算。',
  RATE_LIMITED: '模型繁忙，请稍后重试。',
  REQUEST_TOO_LARGE: '输入内容过长。',
  RESOURCE_FORBIDDEN: '无权读取所需记录。',
  RESOURCE_TIMEOUT: '授权数据读取超时。',
  RESOURCE_UNAVAILABLE: '所需数据或历史片段不可用。',
  TEMPLATE_UNAVAILABLE: '提示词版本暂不可用。',
  UNAUTHENTICATED: '登录已失效，请重新登录。',
  UNSUPPORTED_CONTENT: '请求格式不支持。',
  VERSION_CONFLICT: '配置已变化，请重新读取。',
};

export function aiErrorMessage(code?: string) {
  return (
    (code && Object.hasOwn(messages, code) && messages[code]) ||
    '生成未完成，请保留追踪 ID。'
  );
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Only a bounded server trace and a known safe code are extracted; arbitrary error bodies stay hidden. */
export function aiFailureInfo(error: unknown): {
  code?: string;
  requestId?: string;
} {
  const response = object(object(error)?.response);
  const headers = object(response?.headers);
  let trace = headers?.['x-request-id'] ?? headers?.['X-Request-ID'];
  if (trace === undefined && typeof headers?.get === 'function') {
    try {
      trace = Reflect.apply(headers.get, headers, ['x-request-id']);
    } catch {
      /* No arbitrary header error text. */
    }
  }
  const decimal =
    typeof trace === 'string' &&
    /^[1-9]\d{0,18}$/.test(trace) &&
    (trace.length < 19 || trace <= '9223372036854775807');
  const uuid =
    typeof trace === 'string' &&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(trace);
  const message = object(response?.data)?.message;
  return {
    code:
      typeof message === 'string' && Object.hasOwn(messages, message)
        ? message
        : undefined,
    requestId:
      (decimal || uuid) && typeof trace === 'string' ? trace : undefined,
  };
}
