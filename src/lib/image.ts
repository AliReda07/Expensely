const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.8;

/** Scale (w, h) down so the longer side is at most `max`, keeping aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, max = MAX_SIDE) {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Downscale a photo to a JPEG data URL small enough to send to the assistant. Phone cameras
 * produce 5-10 MB images; a receipt stays legible at 1280px and costs a fraction of the
 * upload and the vision tokens.
 */
export async function photoToDataUrl(file: File): Promise<string> {
  // createImageBitmap applies the EXIF orientation, so portrait phone photos aren't sideways.
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that photo.');
    // JPEG has no alpha; a transparent PNG would otherwise turn black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}
