// Identical tokenizer for index creation and browser queries; no remote segmentation service.
export function tokenizeChinese(text) {
  const normalized = text.normalize('NFKC').toLowerCase();
  const words = normalized.match(/[a-z0-9_]+|\p{Script=Han}+/gu) ?? [];
  const terms = [];
  for (const word of words) {
    terms.push(word);
    if (/\p{Script=Han}/u.test(word)) {
      const chars = [...word];
      terms.push(...chars);
      for (let i = 0; i + 1 < chars.length; i++)
        terms.push(chars[i] + chars[i + 1]);
    }
  }
  return [...new Set(terms)];
}
