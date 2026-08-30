import { useState } from "react";

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function getInitials(name: string | null | undefined, max = 3): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .map((p) => p[0])
    .join("")
    .slice(0, max)
    .toUpperCase();
}

type SmartImageProps = {
  src?: string | null;
  name?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallbackTextClassName?: string;
  loading?: "lazy" | "eager";
  variant?: "team" | "player";
};

/**
 * Renders a real image (team logo / player photo) with a clean initials fallback.
 * - Team logos: object-contain (keeps the crest intact).
 * - Player photos: object-cover (fills the frame).
 * Handles missing/null/invalid URLs and broken images without showing broken-image
 * icons. Works in RTL because it never relies on physical left/right offsets.
 */
function SmartImage({ src, name, alt, className = "", imgClassName = "", fallbackTextClassName = "text-[10px]", loading = "lazy", variant = "team" }: SmartImageProps) {
  const [failed, setFailed] = useState(false);
  const url = src && isValidHttpUrl(src) && !failed ? src : null;
  const label = alt || name || "image";
  const fallbackText = getInitials(name, variant === "player" ? 2 : 3);

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center overflow-hidden bg-[hsl(var(--muted))] ${className}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {url ? (
        <img
          src={url}
          alt={label}
          loading={loading}
          decoding="async"
          onError={() => setFailed(true)}
          className={`h-full w-full ${variant === "team" ? "object-contain p-0.5" : "object-cover"} ${imgClassName}`}
        />
      ) : (
        <span className={`px-1 text-center font-mono-sport font-bold uppercase leading-none text-[hsl(var(--muted-foreground))] ${fallbackTextClassName}`}>{fallbackText}</span>
      )}
    </span>
  );
}

export function TeamLogo(props: SmartImageProps) {
  return <SmartImage variant="team" {...props} />;
}

export function PlayerPhoto(props: SmartImageProps) {
  return <SmartImage variant="player" {...props} />;
}

export function EntityImage(props: SmartImageProps) {
  return <SmartImage {...props} />;
}

export default EntityImage;