import imageCompression from "browser-image-compression";

/**
 * Resize before the image goes anywhere — this is a cost decision, not a nicety.
 *
 * A raw 4000x3000 phone photo is several MB; the 1024px copy is roughly 200 KB.
 * That is faster to upload and uses fewer billable image tokens, with no
 * measurable accuracy loss on a plate of food. It also keeps queued blobs small
 * enough that the IndexedDB outbox doesn't blow its quota after a few meals.
 */
export async function compressForEstimate(file: File): Promise<File> {
  return imageCompression(file, {
    maxWidthOrHeight: 1024,
    maxSizeMB: 0.3,
    initialQuality: 0.8,
    useWebWorker: true,
    fileType: "image/jpeg",
  });
}
