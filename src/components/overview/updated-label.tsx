"use client";

export function UpdatedLabel({ renderedAt }: { renderedAt: string }) {
  const label = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(renderedAt));
  return <span>Updated {label}</span>;
}
