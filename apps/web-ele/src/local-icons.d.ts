declare module 'virtual:xinghui-local-icons' {
  const collections: Parameters<
    (typeof import('@vben/icons'))['addCollection']
  >[0][];
  export default collections;
}
