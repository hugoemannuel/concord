/** Selo do som do soundboard que está tocando no tile. */
export default function SoundBadge({
  userId,
  sound
}: {
  userId: string
  sound: { emoji?: string | null; soundName: string }
}): React.JSX.Element {
  return (
    <div
      data-testid={`soundboard-badge-${userId}`}
      className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full border border-success/50 bg-black/75 px-2.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-sm on-media"
    >
      <span>{sound.emoji || '🔊'}</span>
      <span className="truncate">{sound.soundName}</span>
      <span className="h-1.5 w-1.5 shrink-0 animate-ping rounded-full bg-success" />
    </div>
  )
}
