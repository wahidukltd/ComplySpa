"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search } from "lucide-react";
import type { WizardCredentialType } from "@/lib/staff/wizard";

interface WizardAddCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only types NOT already in the list — duplicates are impossible. */
  types: WizardCredentialType[];
  onAdd: (typeId: string) => void;
}

export function WizardAddCredentialDialog({
  open,
  onOpenChange,
  types,
  onAdd,
}: WizardAddCredentialDialogProps) {
  const [search, setSearch] = useState("");

  // A fresh picker on every open — the parent renders this dialog with
  // key={String(addDialogOpen)}, so it remounts on every open/close and the
  // search always starts empty (plan amendments 2026-08-09/4: no effect, no
  // close-reset wrapper needed — the remount IS the reset, and it covers the
  // Cancel and add-close paths that a wrapper cannot reach).
  const query = search.trim().toLowerCase();
  const filtered = query
    ? types.filter((t) => t.name.toLowerCase().includes(query))
    : types;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a credential</DialogTitle>
          <DialogDescription>
            Choose a credential type to include in this staff member&apos;s record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search credential types..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onAdd(t.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="text-sm font-medium">{t.name}</span>
                <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                  {t.category}
                </Badge>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-1 py-4 text-center text-sm text-muted-foreground">
                {types.length === 0
                  ? "All credential types are already in this list."
                  : `No credential types match "${search}".`}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Need a second credential of the same type (e.g. another state)? Add it from the
            staff member&apos;s profile after saving.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
