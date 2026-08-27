export function MasterHowTo({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="rounded-xl border border-gold/25 bg-gold/[0.06] px-3 py-3 space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-gold font-medium">Для мастера в салоне</p>
      <p className="text-sm text-charcoal/80 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}

export function HomeHowTo({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="rounded-xl border border-charcoal/10 bg-charcoal/[0.03] px-3 py-3 space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-charcoal/50 font-medium">Как делать дома</p>
      <p className="text-sm text-charcoal/80 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}
