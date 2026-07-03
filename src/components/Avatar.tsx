/** Renders an uploaded image if present, else a solid-colour fallback dot/tile. */
export function PersonaAvatar({
  avatarUrl,
  avatarColor,
  size,
  className = "",
}: {
  avatarUrl: string | null;
  avatarColor: string;
  size: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt=""
        style={style}
        className={`inline-block shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      style={{ ...style, background: avatarColor }}
      className={`inline-block shrink-0 rounded-full ${className}`}
    />
  );
}

export function RoomAvatar({
  avatarUrl,
  size,
  className = "",
}: {
  avatarUrl: string | null;
  size: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt=""
        style={style}
        className={`inline-block shrink-0 rounded-lg object-cover ${className}`}
      />
    );
  }
  return (
    <span
      style={{ ...style, background: "var(--panel-2)", fontSize: size * 0.5 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${className}`}
    >
      ◆
    </span>
  );
}
