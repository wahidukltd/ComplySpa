export function PagePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
      <p className="text-sm text-muted-foreground">This section is not yet implemented.</p>
    </div>
  );
}
