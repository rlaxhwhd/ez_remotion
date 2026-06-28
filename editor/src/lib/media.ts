// Read metadata from uploaded files using the browser's native decoders.

export type VideoMeta = { src: string; width: number; height: number; durationSeconds: number };
export type ImageMeta = { src: string; width: number; height: number };
export type AudioMeta = { src: string; durationSeconds: number };

const VIDEO_EXTS = ["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogv", "flv", "wmv", "ts"];
const AUDIO_EXTS = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "weba"];
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp"];

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export const guessKind = (file: File): "video" | "image" | "audio" | null => {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  const e = ext(file.name);
  if (VIDEO_EXTS.includes(e)) return "video";
  if (IMAGE_EXTS.includes(e)) return "image";
  if (AUDIO_EXTS.includes(e)) return "audio";
  return null;
};

export const loadVideoMeta = (file: File): Promise<VideoMeta> =>
  new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    let settled = false;

    const done = (meta: VideoMeta) => {
      if (settled) return;
      settled = true;
      resolve(meta);
    };

    // Chrome sometimes doesn't fire loadedmetadata for certain codecs — fall back after 5s
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // If duration is available use it, otherwise assume 5s
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 5;
      resolve({ src, width: v.videoWidth || 1280, height: v.videoHeight || 720, durationSeconds: dur });
    }, 5000);

    v.onloadedmetadata = () => {
      clearTimeout(timer);
      done({
        src,
        width: v.videoWidth || 1280,
        height: v.videoHeight || 720,
        durationSeconds: isFinite(v.duration) && v.duration > 0 ? v.duration : 5,
      });
    };
    v.onerror = () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new Error(`"${file.name}" 파일을 읽을 수 없습니다. (지원하지 않는 코덱이거나 손상된 파일)`));
    };
    v.src = src;
    v.load();
  });

export const loadImageMeta = (file: File): Promise<ImageMeta> =>
  new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ src, width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
    img.onerror = () => reject(new Error(`"${file.name}" 이미지를 읽을 수 없습니다.`));
    img.src = src;
  });

export const loadAudioMeta = (file: File): Promise<AudioMeta> =>
  new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve({ src, durationSeconds: isFinite(a.duration) && a.duration > 0 ? a.duration : 5 });
    a.onerror = () => reject(new Error(`"${file.name}" 오디오를 읽을 수 없습니다.`));
    a.src = src;
    a.load();
  });
