export function youtubeVideoId(value: string | null | undefined): string {
  const input = value?.trim() ?? "";
  if (!input) {
    return "";
  }
  try {
    const url = new URL(input.startsWith("http://") || input.startsWith("https://") ? input : `https://${input}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let candidate = "";
    if (host === "youtu.be") {
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      candidate = url.searchParams.get("v") ?? "";
      if (!candidate) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "live", "shorts"].includes(parts[0] ?? "")) {
          candidate = parts[1] ?? "";
        }
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : "";
  } catch {
    return "";
  }
}

export function normalizeYouTubeUrl(value: string): string {
  const input = value.trim();
  if (!input) {
    return "";
  }
  const videoId = youtubeVideoId(input);
  if (!videoId) {
    throw new Error("Bitte einen gültigen YouTube-Video- oder Livestream-Link eingeben.");
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeEmbedUrl(value: string | null | undefined): string {
  const videoId = youtubeVideoId(value);
  return videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1`
    : "";
}
