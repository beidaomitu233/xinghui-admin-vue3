export interface PromptVariable {
  label: string;
  name: string;
}

/** The prefix remains the saved identity; the suffix is a readable label only. */
export function variableToken(variable: PromptVariable) {
  if (!/^[A-Z_]\w{0,63}$/i.test(variable.name)) return `{{${variable.name}}}`;
  const label = variable.label.replaceAll(/[{}:\r\n]/gu, ' ').trim();
  return label ? `{{${variable.name}:${label}}}` : `{{${variable.name}}}`;
}

export function promptSegments(value: string, variables: PromptVariable[]) {
  const known = new Set(variables.map((variable) => variable.name));
  const result: { known: boolean; text: string; variable: boolean }[] = [];
  let offset = 0;
  for (const match of value.matchAll(/\{\{([^{}\r\n]{1,200})\}\}/gu)) {
    const index = match.index;
    if (index > offset)
      result.push({
        text: value.slice(offset, index),
        variable: false,
        known: false,
      });
    const identity = (match[1] ?? '').split(':', 1)[0] ?? '';
    result.push({ text: match[0], variable: true, known: known.has(identity) });
    offset = index + match[0].length;
  }
  result.push({ text: value.slice(offset), variable: false, known: false });
  return result;
}
