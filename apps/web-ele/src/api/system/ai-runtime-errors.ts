const messages: Record<string, string> = {
  AGENT_UNAVAILABLE: 'AI工作台暂不可用，请稍后重试。',
  AGENT_EXECUTION_FAILED: '任务执行失败，可查看已有结果后继续。',
  AGENT_PROMPT_UNAVAILABLE: 'Agent提示词不可用，请检查提示词配置。',
  RUN_BUSY: '当前会话仍有任务正在执行。',
  RUN_STOPPED: '任务已停止。',
  QUEUE_FULL: '任务队列已满，请稍后重试。',
  ITERATION_LIMIT: '本轮执行次数已用完，可查看进度后继续任务。',
  EXECUTION_INTERRUPTED: '任务已中断，可查看已有进度后继续。',
  MODEL_INPUT_LIMIT: '本轮上下文过长，请新建会话。',
  INVALID_IMAGE: '图片无法读取，请重新选择 PNG 或 JPG 图片。',
  IMAGE_UNAVAILABLE: '图片暂时无法读取，请重试。',
  IMAGE_CONTEXT_LIMIT: '历史图片过多，请新建会话继续。',
  STATE_LIMIT: '会话数据过大，请新建会话。',
  IDEMPOTENCY_CONFLICT: '请求标识冲突，请刷新查看已有任务。',
  INVALID_MESSAGE: '请选择Agent提示词并输入任务内容。',
  INVALID_TITLE: '会话名称需为1至160个字符。',
  INVALID_REQUEST_ID: '请求标识无效，请刷新后重试。',
  INVALID_ID: '会话或任务标识无效。',
  INVALID_CURSOR: '历史游标无效，请刷新会话。',
  INVALID_VERSION: '会话版本无效，请刷新后重试。',
  AI_QUERY_INVALID_SQL: '查询语句未通过校验。',
  AI_QUERY_UNSUPPORTED_SYNTAX: '当前查询语法暂不支持。',
  AI_QUERY_DATASET_FORBIDDEN: '没有此数据来源的查询权限。',
  AI_QUERY_FIELD_FORBIDDEN: '查询包含不可读字段。',
  AI_QUERY_PARAMETER_INVALID: '请检查查询参数。',
  AI_QUERY_CONTEXT_REQUIRED: '需要实际业务记录；可先静态保存引用。',
  AI_QUERY_SCHEMA_CHANGED: '数据定义已变化，请重新读取范围。',
  AI_QUERY_READ_ONLY_UNAVAILABLE: '只读查询暂不可用。',
  AI_QUERY_QUERY_TIMEOUT: '只读查询已超时，请缩小范围。',
  AI_QUERY_RESULT_LIMIT: '查询范围或结果达到上限，请缩小范围。',
  ROUTING_MANAGEMENT_REQUIRED: '请到 AI 配置调整调用顺序。',
  SCENE_UNCONFIGURED: '请先选择初始模型并保存场景。',
  INVALID_CONTENT: '请求格式不符合要求。',
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
  NETWORK_ERROR: '暂时无法连接模型服务，请稍后重试。',
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
