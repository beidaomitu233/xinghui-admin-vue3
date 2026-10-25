/** Keep ordinary photos useful for vision without copying large originals into model history. */
export async function prepareImage(file: File): Promise<File> {
  if (
    !['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  )
    throw new Error('请选择 PNG、JPG、WebP 或 GIF 图片。');
  if (file.size > 20 * 1024 * 1024) throw new Error('请选择不超过20MB的图片。');
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (
      ratio === 1 &&
      file.size <= 1024 * 1024 &&
      ['image/jpeg', 'image/png'].includes(file.type)
    )
      return file;
    const canvas = document.createElement('canvas');
    for (let pass = 0; pass < 4; pass++) {
      const scale = ratio * 0.8 ** pass;
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法读取图片，请重新选择。');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error('无法读取图片。')),
          'image/jpeg',
          0.85,
        ),
      );
      if (blob.size <= 1024 * 1024)
        return new File([blob], `${file.name.replace(/\.[^.]+$/u, '')}.jpg`, {
          type: 'image/jpeg',
        });
    }
    throw new Error('图片内容过大，请缩小图片后重试。');
  } finally {
    bitmap.close();
  }
}
