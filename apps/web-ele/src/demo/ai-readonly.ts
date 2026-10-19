import type {
  ApplicationView,
  AvailableModel,
  PublishedTemplateOption,
} from '../api/system/ai-application';
import type {
  AiConfiguration,
  ConfigurationVersion,
} from '../api/system/ai-configuration';
import type { ConversationSummary } from '../api/system/ai-conversation';
import type { HubModel } from '../api/system/ai-model-hub';
import type {
  RequestLogDetail,
  RequestLogRow,
  RequestLogStatistics,
} from '../api/system/ai-request-log';
import type { SceneDetail, SceneMonitor } from '../api/system/ai-scene';
import type { AiSettingsView } from '../api/system/ai-settings';
import type {
  ResourceDefinition,
  TemplateDefinition,
  Version,
  View,
} from '../api/system/ai-template';

import { fictionalCall } from './ai-call-logs';

// Entirely fictional local data. No key material, provider attempts, test success or executable publication.
export const AI_DEMO_IDS = {
  config: '9100000000000000101',
  model: '9100000000000000102',
  app: '9100000000000000201',
  template: '9100000000000000301',
  resource: '9100000000000000401',
  request: '9100000000000000501',
};
const time = '2026-10-16 09:00:00';
const hubModel: HubModel = {
  modelId: 'fictional-business-model',
  revision: 1,
  name: '[虚构只读] 演示业务模型',
  slug: 'fictional-demo-chat',
  capabilities: '虚构布局示例',
  contextWindow: '未连接',
  enabled: false,
  strategy: 'PRIORITY',
  fallback: true,
  routes: [],
  health: {
    ready: false,
    readyRoutes: 0,
    distinctProviders: 0,
    multiProviderProtected: false,
    reasons: [],
  },
  updatedAt: '2026-10-16T01:00:00Z',
};
const conversation: ConversationSummary = {
  conversationId: 'fictional-conversation',
  title: '[虚构只读] 订单分析对话',
  sceneKey: 'scene.fictionalreadonly',
  sceneName: '[虚构只读] 分析场景',
  kind: 'BUSINESS',
  businessRef: null,
  sourceLabel: '虚构演示资料',
  revision: 2,
  status: 'SUCCEEDED',
  lastMessage: '[虚构示例] 可按地区汇总订单。',
  updatedAt: '2026-10-16T01:00:00Z',
  history: 'COMPLETE',
  canContinue: false,
};
const settings: AiSettingsView = {
  configId: AI_DEMO_IDS.config,
  revision: 0,
  name: '[虚构只读] 未连接的 AI 配置',
  provider: 'openrouter',
  endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
  keyConfigured: false,
  maskedKey: '',
  models: [{ code: 'fictional/local-only', name: '虚构目录模型（未连接）' }],
  keys: [
    {
      keyId: 'fictional-primary',
      name: '主账号示例',
      keyConfigured: false,
      maskedKey: '',
      modelCodes: ['fictional/local-only'],
      status: 'NOT_TESTED',
      message: '未配置凭据',
      models: [],
    },
    {
      keyId: 'fictional-backup',
      name: '备用账号示例',
      keyConfigured: false,
      maskedKey: '',
      modelCodes: ['fictional/local-only'],
      status: 'NOT_TESTED',
      message: '未配置凭据',
      models: [],
    },
  ],
  active: false,
  pendingChanges: false,
  connection: {
    status: 'NOT_TESTED',
    message: '虚构演示未连接模型服务',
    active: false,
    testId: null,
    checkedAt: null,
  },
};
const scene: SceneDetail = {
  legacy: null,
  scene: {
    sceneKey: 'scene.fictionalreadonly',
    name: '[虚构只读] 记录摘要场景',
    purpose: '静态布局示例，不保存或执行',
    kind: 'GENERAL',
    formId: null,
    source: 'NATIVE',
    enabled: false,
    revision: 0,
    currentVersionId: null,
    availability: { state: 'UNCONFIGURED', reasons: [] },
    updatedAt: '2026-10-16T01:00:00Z',
  },
  definition: {
    name: '[虚构只读] 记录摘要场景',
    purpose: '静态布局示例，不保存或执行',
    promptText:
      '这是虚构提示词。结合 {{demo_order_summary:订单汇总示例}} 回答 {{user_request:用户要求}}。静态演示不会保存、读取业务数据或调用模型。',
    sqlBindings: [
      {
        variable: 'demo_order_summary',
        label: '订单汇总示例',
        description: '虚构只读示例：按地区汇总订单金额，不连接数据库。',
        datasetKeys: [],
        query: {
          sql: 'SELECT region_name, SUM(order_amount) AS total_amount FROM demo_orders GROUP BY region_name',
          parameters: {},
          maxRows: 20,
        },
      },
    ],
    outputRequirement: '',
    dataObjects: [],
    modelPolicy: {
      mode: 'FIXED',
      models: [],
      fallback: false,
      outputFormat: 'TEXT',
      timeoutSeconds: 30,
      maxAttempts: 2,
      maxConcurrent: 2,
      maxTokens: 1024,
    },
  },
};
const configuration: AiConfiguration = {
  id: AI_DEMO_IDS.config,
  name: '[虚构只读] 未连接的 AI 配置',
  environment: 'static-demo',
  providerCode: 'openrouter',
  status: 'DRAFT',
  revision: 0,
  activeVersion: null,
  activePairs: [],
  latestTestId: null,
  updatedAt: time,
  legacyModelId: null,
  draft: {
    configVersion: '1',
    providerCode: 'openrouter',
    protocol: 'OPENAI_CHAT',
    endpointUrl: 'https://provider.example.invalid/not-connected',
    timeoutSeconds: 30,
    models: [
      {
        modelRef: AI_DEMO_IDS.model,
        modelCode: 'fictional/local-only',
        jsonObject: false,
      },
    ],
    keys: [],
  },
};
const resource: ResourceDefinition = {
  name: '[虚构只读] 记录主题资源',
  domain: '仅展示引用声明，不读取业务数据',
  owner: '虚构演示负责人',
  source: 'lowcode.record',
  formId: '2001',
  fields: ['subject'],
  subjects: ['demo'],
  applications: [AI_DEMO_IDS.app],
  timeoutMillis: 2000,
};
const template: TemplateDefinition = {
  name: '[虚构只读] 记录摘要模板',
  purpose: '仅展示模板和资源引用，不预览取数或生成',
  owner: '虚构演示负责人',
  maxChars: 12_000,
  messages: [
    {
      section: 'INSTRUCTION',
      text: '这是非执行的虚构模板示例。静态演示不会调用模型。',
    },
    { section: 'INPUT', text: '{{user_request}}' },
    { section: 'DATA', text: '{{record_subject}}' },
  ],
  variables: [
    {
      name: 'user_request',
      type: 'STRING',
      required: true,
      hasDefault: false,
      defaultValue: null,
      maxChars: 1000,
      sensitive: false,
      truncate: false,
    },
    {
      name: 'record_subject',
      type: 'STRING',
      required: true,
      hasDefault: false,
      defaultValue: null,
      maxChars: 1000,
      sensitive: false,
      truncate: false,
    },
  ],
  resources: [
    {
      name: '虚构记录主题',
      resourceId: AI_DEMO_IDS.resource,
      resourceVersionId: '1',
      required: true,
      omitOnMissing: false,
      parameters: { businessRef: { source: 'BUSINESS_REF', key: 'id' } },
      outputs: { subject: 'record_subject' },
    },
  ],
};
const application: ApplicationView = {
  appId: AI_DEMO_IDS.app,
  entryKey: 'fictional-readonly',
  name: '[虚构只读] 摘要应用声明',
  purpose: '未测试、未发布、未启用；不执行任何模型调用',
  ownerId: 'demo',
  enabled: false,
  publishedVersionId: null,
  revision: 0,
  draftRevision: 0,
  draft: {
    scope: 'FRONTEND',
    formId: '2001',
    allowedSubjects: ['demo'],
    allowedAuthorities: [],
    template: { templateId: AI_DEMO_IDS.template, templateVersionId: '1' },
    inputNames: ['user_request'],
    requirements: { outputFormat: 'TEXT', streaming: true, tools: false },
    models: [
      {
        model: { modelRef: AI_DEMO_IDS.model, configVersion: '1' },
        keyMode: 'AUTO',
        allowedKeys: [],
        fixedKey: null,
        fallbackKeys: [],
      },
    ],
    modelMode: 'FIXED',
    modelFallback: false,
    maxAttempts: 1,
    maxConcurrent: 1,
    maxTokens: 256,
    timeoutSeconds: 30,
  },
};
const log: RequestLogRow = {
  appName: '[虚构只读] 静态拒绝记录（未调用模型）',
  elapsedMs: 0,
  subjectRef: 'demo',
  tenantRef: 'static-demo',
  request: {
    requestId: AI_DEMO_IDS.request,
    appId: AI_DEMO_IDS.app,
    appVersionId: null,
    draftRevision: 0,
    kind: 'TEST',
    businessType: 'demo.not-executed',
    businessId: 'fictional-record',
    status: 'FAILED',
    stage: 'ADMISSION',
    errorCode: 'CAPABILITY_UNSUPPORTED',
    outputStarted: false,
    attemptCount: 0,
    usageKnown: false,
    inputTokens: null,
    outputTokens: null,
    createdAt: '2026-10-16T09:00:00+08:00',
    deadline: '2026-10-16T09:00:30+08:00',
    finishedAt: '2026-10-16T09:00:00+08:00',
  },
};
type Params = Record<string, unknown>;
type Reply = { data: unknown; handled: true } | { handled: false };
export class AiDemoFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function paged<T>(rows: T[], params: Params) {
  const pageNum = Math.max(1, Number(params.pageNum) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  return {
    records: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
    total: String(rows.length),
    pageNum,
    pageSize,
  };
}
function filteredLogs(params: Params) {
  if (params.scope === 'AUDIT')
    throw new AiDemoFailure(403, '静态演示仅支持查看，未发送请求');
  return [log].filter((row) => {
    if (params.requestKind && params.requestKind !== row.request.kind)
      return false;
    if (params.sceneKey) return false; // The historical denial example has no scene identity.
    const values = {
      appId: row.request.appId,
      requestId: row.request.requestId,
      businessId: row.request.businessId,
      status: row.request.status,
      subjectRef: row.subjectRef,
      tenantRef: row.tenantRef,
    };
    for (const [key, value] of Object.entries(values))
      if (params[key] && String(params[key]) !== value) return false;
    if (params.modelRef) return false; // No model was attempted.
    const date = Date.parse(row.request.createdAt);
    return (
      (!params.from || date >= Date.parse(String(params.from))) &&
      (!params.to || date <= Date.parse(String(params.to)))
    );
  });
}
function definition(resourceKind: boolean): View {
  return {
    id: resourceKind ? AI_DEMO_IDS.resource : AI_DEMO_IDS.template,
    name: resourceKind ? resource.name : template.name,
    revision: 0,
    enabled: false,
    state: 'DRAFT',
    update_time: time,
    definition: resourceKind ? resource : template,
    versions: [version(resourceKind)],
  };
}
function version(resourceKind: boolean): Version {
  return {
    id: '1',
    version_no: 1,
    config_hash: 'fictional-local-declaration-not-approved',
    create_time: time,
    definition: resourceKind ? resource : template,
  };
}
export function readOnlyAiDemo(
  path: string,
  method: string,
  params: Params,
): Reply {
  if (!/^\/(?:system\/ai|ai\/)/.test(path)) return { handled: false };
  if (method !== 'GET')
    throw new AiDemoFailure(501, '静态演示仅支持查看，未发送请求');
  const send = (data: unknown): Reply => ({ handled: true, data });
  if (path.startsWith('/system/ai/call-logs')) {
    if (params.scope && params.scope !== 'OWN')
      throw new AiDemoFailure(403, '静态演示仅支持本人虚构数据');
    const records = [fictionalCall].filter((row) =>
      Object.entries(params).every(([key, value]) => {
        if (!value || ['pageNum', 'pageSize', 'scope'].includes(key))
          return true;
        if (key === 'from') return row.startedAt >= String(value);
        if (key === 'to') return row.startedAt <= String(value);
        return String(row[key as keyof typeof row] ?? '') === String(value);
      }),
    );
    if (path === '/system/ai/call-logs') return send(paged(records, params));
    if (path === '/system/ai/call-logs/statistics')
      return send({
        calls: String(records.length),
        succeeded: '0',
        failed: String(records.length),
        knownInputTokens: null,
        knownOutputTokens: null,
        unknownInputCalls: String(records.length),
        unknownOutputCalls: String(records.length),
      });
    if (path === '/system/ai/call-logs/export') return send(records);
    if (path === '/system/ai/call-logs/fictional-call' && records.length > 0)
      return send({ call: fictionalCall, response: null });
    throw new AiDemoFailure(404, '筛选范围内没有该虚构记录');
  }
  if (path === '/ai/scenes') return send([]);
  if (path === '/ai/conversations') {
    if (params.scope && params.scope !== 'OWN')
      throw new AiDemoFailure(403, '静态演示仅支持本人虚构数据');
    return send(
      paged(
        !params.search || conversation.title.includes(String(params.search))
          ? [conversation]
          : [],
        params,
      ),
    );
  }
  if (path === `/ai/conversations/${conversation.conversationId}`)
    return send({
      conversation,
      notice: '所有消息为虚构布局示例，未调用模型。',
      messages: [
        '[虚构问题] 请分析订单情况。',
        '[虚构示例] 可按地区汇总订单。',
      ].map((content, index) => ({
        messageId: `fictional-message-${index}`,
        sequence: index + 1,
        role: index === 0 ? 'USER' : 'ASSISTANT',
        content,
        status: 'SUCCEEDED',
        requestId: AI_DEMO_IDS.request,
        sceneVersionId: 'fictional-version',
        errorCode: null,
        partial: false,
        createdAt: conversation.updatedAt,
        finishedAt: conversation.updatedAt,
      })),
    });
  if (path === '/system/ai/settings/providers')
    return send([
      {
        code: 'openrouter',
        name: 'OpenRouter',
        defaultEndpoint: settings.endpointUrl,
        suggestedModels: [],
      },
      {
        code: 'deepseek',
        name: 'DeepSeek 官方',
        defaultEndpoint: 'https://api.deepseek.com/chat/completions',
        suggestedModels: [],
      },
    ]);
  if (path === '/system/ai/settings')
    return send(
      paged(
        [settings].filter(
          (value) =>
            !params.search || value.name.includes(String(params.search)),
        ),
        params,
      ),
    );
  if (path === '/system/ai/settings/model-hub/models')
    return send(
      paged(
        [hubModel].filter(
          (model) =>
            !params.search ||
            `${model.name} ${model.slug}`.includes(String(params.search)),
        ),
        params,
      ),
    );
  if (path === '/system/ai/settings/model-hub/models/summary')
    return send({
      totalModels: 1,
      enabledModels: 0,
      readyModels: 0,
      unconfiguredModels: 0,
      disabledModels: 1,
      multiProviderModels: 0,
      assuranceNeededModels: 0,
      modelLimit: 512,
      observedAt: '2026-10-16T01:00:00Z',
    });
  if (path === `/system/ai/settings/model-hub/models/${hubModel.modelId}`)
    return send(hubModel);
  if (path === `/system/ai/model-catalog/channels/${settings.configId}`)
    return send({
      configId: settings.configId,
      revision: settings.revision,
      provider: settings.provider,
      endpointUrl: settings.endpointUrl,
      state: 'NOT_FETCHED',
      sources: [],
      catalog: {
        configId: settings.configId,
        keyId: null,
        revision: settings.revision,
        provider: settings.provider,
        records: [],
        total: 0,
        pageNum: Number(params.pageNum ?? 1),
        pageSize: Number(params.pageSize ?? 20),
        generationVerified: false,
        refreshedAt: '',
        source: 'PUBLIC',
      },
    });
  if (path === `/system/ai/settings/scene-routes/${scene.scene.sceneKey}`)
    return send({
      sceneKey: scene.scene.sceneKey,
      revision: scene.scene.revision,
      currentVersionId: null,
      modelPolicy: null,
    });
  if (path === `/system/ai/settings/${settings.configId}`)
    return send(settings);
  if (path === '/ai/scenes/record-summary') return send(null);
  if (path === '/system/ai/scenes/workspace') {
    const records =
      !params.search ||
      `${scene.scene.name} ${scene.scene.purpose}`.includes(
        String(params.search),
      )
        ? [scene.scene]
        : [];
    return send({
      scenes: paged(records, params),
      selected: params.selectedSceneKey === scene.scene.sceneKey ? scene : null,
    });
  }
  if (path === `/system/ai/scenes/${scene.scene.sceneKey}`) return send(scene);
  if (
    path === '/system/ai/scenes/options/models' ||
    path === '/system/ai/scenes/options/keys'
  )
    return send([]);
  if (path === '/system/ai/scene-data/catalog')
    return send({
      objects: [],
      inputVariables: [
        {
          name: 'user_request',
          label: '用户要求',
          type: 'STRING',
          required: false,
          maxChars: 8000,
        },
      ],
    });
  if (
    path === '/system/ai/scene-data/forms' ||
    path === '/system/ai/scene-data/samples'
  )
    return send(paged([], params));
  if (path === '/system/ai/monitor/summary') {
    const count = filteredLogs(params).length;
    if (params.scope && params.scope !== 'OWN')
      throw new AiDemoFailure(403, '静态演示仅支持本人虚构数据');
    const monitor: SceneMonitor = {
      observedAt: '2026-10-16T01:00:00Z',
      window: {
        from: String(params.from ?? '2026-10-15T01:00:00Z'),
        to: String(params.to ?? '2026-10-16T01:00:00Z'),
      },
      scope: 'OWN',
      requestKind: String(params.requestKind ?? 'BUSINESS'),
      keyCards: {
        enabledKeyVersions: null,
        knownAdmittedPairs: null,
        recentlyFailedKeyVersions: null,
        unattributedAttempts: null,
        unavailableReason: 'STATIC_DEMO',
      },
      calls: {
        requests: count,
        businessRequests: 0,
        testRequests: count,
        succeededRequests: 0,
        failedRequests: count,
        modelAttempts: 0,
        failedAttempts: 0,
        knownInputTokens: null,
        knownOutputTokens: null,
        unknownInputAttempts: 0,
        unknownOutputAttempts: 0,
      },
    };
    return send(monitor);
  }
  if (path === '/ai/applications/record-summary') return send(null);
  if (path === '/system/ai/configurations') {
    const rows = [configuration].filter(
      (c) =>
        (!params.name || c.name.includes(String(params.name))) &&
        (!params.environment || c.environment === params.environment) &&
        (!params.providerCode || c.providerCode === params.providerCode) &&
        (!params.status || c.status === params.status),
    );
    return send({
      ...paged(
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          environment: c.environment,
          providerCode: c.providerCode,
          status: c.status,
          revision: c.revision,
          modelCount: c.draft.models.length,
          usableKeyCount: 0,
          latestTestTime: null,
        })),
        params,
      ),
      legacyModels: [],
      jsonObjectModels: [],
    });
  }
  if (path === `/system/ai/configurations/${AI_DEMO_IDS.config}`)
    return send(configuration);
  if (path === `/system/ai/configurations/${AI_DEMO_IDS.config}/versions`) {
    const versions: ConfigurationVersion[] = [
      {
        configVersion: '1',
        snapshot: configuration.draft,
        admittedPairs: [],
        createdAt: time,
        activated: false,
      },
    ];
    return send(versions);
  }
  if (path === `/system/ai/configurations/${AI_DEMO_IDS.config}/impact`)
    return send([]);
  if (path === '/system/ai/applications')
    return send(
      paged(
        [application].filter(
          (a) =>
            !params.search ||
            `${a.name} ${a.entryKey}`.includes(String(params.search)),
        ),
        params,
      ),
    );
  if (path === '/system/ai/applications/options/models') {
    const models: AvailableModel[] = [];
    return send(models);
  }
  if (path === '/system/ai/applications/options/keys') return send([]);
  if (path === `/system/ai/applications/${AI_DEMO_IDS.app}`)
    return send(application);
  if (path === `/system/ai/applications/${AI_DEMO_IDS.app}/health`)
    return send({
      appId: application.appId,
      appVersionId: null,
      checkedAt: time,
      revision: 0,
      state: 'DISABLED',
      reason: null,
    });
  if (
    path === `/system/ai/applications/${AI_DEMO_IDS.app}/test-evidence` ||
    path === `/system/ai/applications/${AI_DEMO_IDS.app}/versions`
  )
    return send([]);
  if (path === '/system/ai/templates/options') {
    const options: PublishedTemplateOption[] = [
      {
        available: false,
        inputVariables: [
          {
            name: 'user_request',
            type: 'STRING',
            required: true,
            hasDefault: false,
          },
        ],
        name: template.name,
        resources: [
          { resourceId: AI_DEMO_IDS.resource, resourceVersionId: '1' },
        ],
        templateId: AI_DEMO_IDS.template,
        templateVersionId: '1',
        versionNumber: 1,
        unavailableReasons: ['TEMPLATE_DISABLED', 'RESOURCE_DISABLED'],
      },
    ];
    return send(paged(options, params));
  }
  if (path === '/system/ai/templates/legacy-scenes')
    return send(paged([], params));
  const match =
    /^\/system\/ai\/(templates|data-resources)(?:\/(\d+))?(?:\/versions\/(\d+)(\/references)?|\/(checks))?$/.exec(
      path,
    );
  if (match) {
    const isResource = match[1] === 'data-resources';
    const expected = isResource ? AI_DEMO_IDS.resource : AI_DEMO_IDS.template;
    if (!match[2])
      return send(
        paged(
          [definition(isResource)].map(
            ({ definition: _definition, versions: _versions, ...row }) => row,
          ),
          params,
        ),
      );
    if (match[2] !== expected || (match[3] && match[3] !== '1'))
      throw new AiDemoFailure(404, '虚构 AI 示例不存在');
    if (match[4] || match[5]) return send([]);
    return send(match[3] ? version(isResource) : definition(isResource));
  }
  if (path === '/system/ai/requests')
    return send(paged(filteredLogs(params), params));
  if (path === '/system/ai/requests/statistics') {
    const count = filteredLogs(params).length;
    const stats: RequestLogStatistics = {
      requests: count,
      businessRequests: 0,
      testRequests: count,
      modelAttempts: 0,
      knownInputTokens: null,
      knownOutputTokens: null,
      unknownInputAttempts: 0,
      unknownOutputAttempts: 0,
    };
    return send(stats);
  }
  if (path === '/system/ai/requests/export')
    throw new AiDemoFailure(501, '静态演示仅支持查看，未发送请求');
  if (path === `/system/ai/requests/${AI_DEMO_IDS.request}`) {
    if (filteredLogs(params).length === 0)
      throw new AiDemoFailure(404, '筛选范围内没有该虚构记录');
    const detail: RequestLogDetail = {
      request: log,
      attempts: [],
      stages: [
        {
          stageId: '1',
          stage: 'ADMISSION',
          outcome: 'REJECTED',
          errorCode: 'CAPABILITY_UNSUPPORTED',
          referenceId: application.appId,
          referenceKind: 'APPLICATION',
          referenceVersion: null,
          createdAt: log.request.createdAt,
        },
      ],
    };
    return send(detail);
  }
  // Retain the old read-only metadata endpoints for existing local demonstrations and tests.
  if (/^\/system\/ai\/(?:models|prompts)(?:\/|$)/.test(path))
    return { handled: false };
  throw new AiDemoFailure(404, '该 AI 读取未提供本地示例，不会连接网络');
}
