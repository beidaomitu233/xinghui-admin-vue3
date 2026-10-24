import { defineComponent, h, reactive } from 'vue';

/** Unit-test boundary for the native Vben form inside popups. Real form behavior is verified in Chrome. */
export function createVbenFormPortMock() {
  // zod 桩：任意方法可链式调用；真实校验在 Chrome 验证。
  const chain: unknown = new Proxy(
    {},
    {
      get:
        () =>
        (..._args: unknown[]) =>
          chain,
    },
  );
  const z: unknown = new Proxy(
    {},
    {
      get:
        () =>
        (..._args: unknown[]) =>
          chain,
    },
  );

  const useVbenForm = (options: {
    [key: string]: unknown;
    handleReset?: () => unknown;
    handleSubmit?: (values: Record<string, unknown>) => unknown;
    schema?: Array<Record<string, any>>;
    showDefaultActions?: boolean;
  }) => {
    // 每个表单实例独立状态，避免多个 useVbenForm 调用互相覆盖 schema。
    const state = reactive({
      schemas: [...(options.schema ?? [])] as Array<Record<string, any>>,
      values: {} as Record<string, any>,
    });

    const Form = defineComponent({
      name: 'VbenFormUnitPort',
      setup() {
        const renderField = (schema: Record<string, any>) => {
          const props =
            typeof schema.componentProps === 'function'
              ? schema.componentProps()
              : (schema.componentProps ?? {});
          // componentProps 的 aria-label 优先，与原生表单透传行为一致。
          const label = String(
            props['aria-label'] ?? schema.label ?? schema.fieldName ?? '',
          );
          const value = state.values[schema.fieldName];
          if (schema.component === 'Select') {
            const selectOptions = (props.options ?? []) as Array<{
              label: string;
              value: unknown;
            }>;
            return h(
              'select',
              {
                'aria-label': label,
                onChange: (event: Event) => {
                  const selected = selectOptions.find(
                    (option) =>
                      String(option.value) ===
                      (event.target as HTMLSelectElement).value,
                  );
                  state.values[schema.fieldName] = selected?.value;
                  props.onChange?.(selected?.value);
                },
              },
              selectOptions.map((option) =>
                h('option', { value: String(option.value) }, option.label),
              ),
            );
          }
          if (schema.component === 'RadioGroup') {
            const radioOptions = (props.options ?? []) as Array<{
              label: string;
              value: unknown;
            }>;
            return h(
              'div',
              { 'aria-label': label, role: 'radiogroup' },
              radioOptions.map((option) =>
                h('label', null, [
                  h('input', {
                    checked: value === option.value,
                    type: 'radio',
                    value: String(option.value),
                    onChange: () => {
                      state.values[schema.fieldName] = option.value;
                      props.onChange?.(option.value);
                    },
                  }),
                  option.label,
                ]),
              ),
            );
          }
          const isTextarea = schema.component === 'Textarea';
          return h(isTextarea ? 'textarea' : 'input', {
            'aria-label': label,
            placeholder: String(props.placeholder ?? ''),
            type: isTextarea ? undefined : String(props.type ?? 'text'),
            value: value ?? '',
            onInput: (event: Event) => {
              state.values[schema.fieldName] = (
                event.target as HTMLInputElement
              ).value;
            },
          });
        };

        return () =>
          h(
            'form',
            {
              class: 'vben-form-port',
              onSubmit: (event: Event) => {
                event.preventDefault();
                void options.handleSubmit?.({ ...state.values });
              },
            },
            [
              ...state.schemas.map((schema) => renderField(schema)),
              // 与原生表单一致：提供提交/重置入口，走调用方的 handleSubmit/handleReset。
              options.handleSubmit
                ? h(
                    'button',
                    {
                      type: 'submit',
                      onClick: () => {
                        void options.handleSubmit?.({ ...state.values });
                      },
                    },
                    '搜索',
                  )
                : null,
              options.handleReset
                ? h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        void options.handleReset?.();
                      },
                    },
                    '重置',
                  )
                : null,
            ],
          );
      },
    });

    const formApi = {
      form: { setFieldError: () => {} },
      async getValues() {
        return { ...state.values };
      },
      getState() {
        return {};
      },
      getLatestSubmissionValues() {
        return { ...state.values };
      },
      async resetForm() {
        state.values = {};
      },
      setLatestSubmissionValues(values: Record<string, unknown>) {
        state.values = { ...values };
      },
      async setValues(values: Record<string, unknown>) {
        Object.assign(state.values, values);
      },
      setState(partial: unknown) {
        // 网格搜索表单经 setState 合并选项（含函数式 setter）；应用 schema，其余状态忽略。
        const value =
          typeof partial === 'function'
            ? (partial as (prev: unknown) => Record<string, any>)({})
            : (partial as Record<string, any>);
        if (value && Array.isArray(value.schema)) {
          state.schemas = [...value.schema];
        }
      },
      async updateSchema(schemas: Array<Record<string, any>>) {
        state.schemas = [...schemas];
      },
      async validate() {
        return { valid: true };
      },
    };

    return [Form, formApi] as const;
  };

  return { useVbenForm, z } as const;
}
