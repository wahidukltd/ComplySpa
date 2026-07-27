"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { getDocumentUrl } from "@/lib/utils/upload";

export function CredentialDocument({ filePath }: { filePath: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocumentUrl(filePath).then((url) => {
      setSignedUrl(url);
      setLoading(false);
    });
  }, [filePath]);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <FileText className="size-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Document</p>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : signedUrl ? (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                View document
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">Failed to load document</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
