export type StreamProvider = "youtube" | "twitch";

export type StreamEmbed = {
  provider: StreamProvider;
  url: string;
};

export function youtubeVideoId(value: string | null | undefined): string {
  const url = parseUrl(value);
  if (!url) {
    return "";
  }
  const host = normalizedHost(url);
  let candidate = "";
  if (host === "youtu.be") {
    candidate = pathParts(url)[0] ?? "";
  } else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
    candidate = url.searchParams.get("v") ?? "";
    const parts = pathParts(url);
    if (!candidate && ["embed", "live", "shorts"].includes(parts[0] ?? "")) {
      candidate = parts[1] ?? "";
    }
  }
  return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : "";
}

type TwitchTarget = { type: "channel" | "video"; value: string };

function twitchTarget(value: string | null | undefined): TwitchTarget | null {
  const url = parseUrl(value);
  if (!url || normalizedHost(url) !== "twitch.tv") {
    return null;
  }
  const parts = pathParts(url);
  if (parts[0] === "videos" && /^\d+$/.test(parts[1] ?? "")) {
    return { type: "video", value: parts[1] };
  }
  const channel = parts[0] ?? "";
  if (/^[A-Za-z0-9_]{1,25}$/.test(channel) && !["directory", "downloads", "jobs", "p", "settings", "subscriptions", "videos"].includes(channel.toLowerCase())) {
    return { type: "channel", value: channel.toLowerCase() };
  }
  return null;
}

export function normalizeStreamUrl(value: string): string {
  const input = value.trim();
  if (!input) {
    return "";
  }
  const videoId = youtubeVideoId(input);
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  const twitch = twitchTarget(input);
  if (twitch?.type === "channel") {
    return `https://www.twitch.tv/${twitch.value}`;
  }
  if (twitch?.type === "video") {
    return `https://www.twitch.tv/videos/${twitch.value}`;
  }
  throw new Error("Bitte einen gültigen YouTube- oder Twitch-Livestream-Link eingeben.");
}

export function streamEmbed(value: string | null | undefined, parentHost?: string): StreamEmbed | null {
  const videoId = youtubeVideoId(value);
  if (videoId) {
    return {
      provider: "youtube",
      url: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1`,
    };
  }
  const twitch = twitchTarget(value);
  const parent = parentHost ?? (typeof window !== "undefined" ? window.location.hostname : "");
  if (!twitch || !parent) {
    return null;
  }
  const target = twitch.type === "channel"
    ? `channel=${encodeURIComponent(twitch.value)}`
    : `video=${encodeURIComponent(`v${twitch.value}`)}`;
  return {
    provider: "twitch",
    url: `https://player.twitch.tv/?${target}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=true`,
  };
}

function parseUrl(value: string | null | undefined): URL | null {
  const input = value?.trim() ?? "";
  if (!input) {
    return null;
  }
  try {
    return new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
}

function normalizedHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function pathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}
