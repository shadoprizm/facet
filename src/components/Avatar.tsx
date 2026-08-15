export type AvatarSize = 14 | 16 | 20 | 24 | 28 | 36 | 40 | 48 | 56;

const SIZE_CLASSES: Record<AvatarSize, string> = {
  14: "size-[14px]",
  16: "size-4",
  20: "size-5",
  24: "size-6",
  28: "size-7",
  36: "size-9",
  40: "size-10",
  48: "size-12",
  56: "size-14",
};

const ROOM_GLYPH_SIZE_CLASSES: Record<AvatarSize, string> = {
  14: "text-[7px]",
  16: "text-[8px]",
  20: "text-[10px]",
  24: "text-xs",
  28: "text-sm",
  36: "text-lg",
  40: "text-xl",
  48: "text-2xl",
  56: "text-[28px]",
};

const AVATAR_COLOR_CLASSES: Record<string, string> = {
  "#6366f1": "bg-[#6366f1]",
  "#ef4444": "bg-[#ef4444]",
  "#f59e0b": "bg-[#f59e0b]",
  "#10b981": "bg-[#10b981]",
  "#06b6d4": "bg-[#06b6d4]",
  "#8b5cf6": "bg-[#8b5cf6]",
  "#ec4899": "bg-[#ec4899]",
  "#84cc16": "bg-[#84cc16]",
  "#f97316": "bg-[#f97316]",
  "#14b8a6": "bg-[#14b8a6]",
  "#a855f7": "bg-[#a855f7]",
  "#0ea5e9": "bg-[#0ea5e9]",
  "#e11d48": "bg-[#e11d48]",
  "#65a30d": "bg-[#65a30d]",
};

/** Renders an uploaded image if present, else a solid-colour fallback dot/tile. */
export function PersonaAvatar({
  avatarUrl,
  avatarColor,
  size,
  className = "",
}: {
  avatarUrl: string | null;
  avatarColor: string;
  size: AvatarSize;
  className?: string;
}) {
  const sizeClass = SIZE_CLASSES[size];
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className={`inline-block shrink-0 rounded-full object-cover ${sizeClass} ${className}`}
      />
    );
  }
  const colorClass = AVATAR_COLOR_CLASSES[avatarColor.toLowerCase()] ?? AVATAR_COLOR_CLASSES["#6366f1"];
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ${sizeClass} ${colorClass} ${className}`}
    />
  );
}

export function RoomAvatar({
  avatarUrl,
  size,
  className = "",
}: {
  avatarUrl: string | null;
  size: AvatarSize;
  className?: string;
}) {
  const sizeClass = SIZE_CLASSES[size];
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className={`inline-block shrink-0 rounded-lg object-cover ${sizeClass} ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-[var(--panel-2)] ${sizeClass} ${ROOM_GLYPH_SIZE_CLASSES[size]} ${className}`}
    >
      ◆
    </span>
  );
}
