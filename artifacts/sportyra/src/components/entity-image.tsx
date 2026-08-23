import { useState } from "react";
import { resolveImageUrl, type ImageSource } from "@workspace/db";

type EntityImageProps = {
  src: string | null | undefined;
  alt: string;
  entityType?: "team" | "player" | "competition" | "match" | "news";
  entityId?: number;
  className?: string;
  fallbackClassName?: string;
  width?: number;
  height?: number;
  loading?: "lazy" | "eager";
  onLoad?: () => void;
  onError?: () => void;
};

const PLACEHOLDER_EMOJI: Record<string, string> = {
  team: "⚽",
  player: "👤",
  competition: "🏆",
  match: "⚽",
  news: "📰",
};

export function EntityImage({
  src,
  alt,
  entityType = "news",
  entityId,
  className = "",
  fallbackClassName = "",
  width,
  height,
  loading = "lazy",
  onLoad,
  onError,
}: EntityImageProps) {
  const [error, setError] = useState(false);
  const resolved: ImageSource = resolveImageUrl(src, entityType, entityId);
  const displayUrl = error ? null : resolved.url;

  const handleError = () => {
    setError(true);
    onError?.();
  };

  if (!displayUrl || error) {
    return (
      <div
        className={`flex items-center justify-center bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] ${fallbackClassName} ${className}`}
        style={{ width: width || "100%", height: height || "100%", minHeight: 60 }}
        aria-label={alt}
      >
        <div className="text-center">
          <span className="text-2xl">{PLACEHOLDER_EMOJI[entityType] || "📷"}</span>
          <p className="mt-1 text-[10px] font-mono-sport uppercase">{alt.slice(0, 20)}</p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={displayUrl}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      onError={handleError}
      onLoad={onLoad}
    />
  );
}

export default EntityImage;
