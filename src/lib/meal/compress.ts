import imageCompression from "browser-image-compression";

/**
 * Resize before the image goes anywhere — this is a cost decision, not a nicety.
 *
 * A raw 4000x3000 phone photo is ~16,000 image tokens; at 1024px it is ~1,600.
 * Ten times cheaper and faster, with no measurable accuracy loss on a plate of
 * food. It also keeps queued blobs small enough that the IndexedDB outbox
 * doesn't blow its quota after a few meals.
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
