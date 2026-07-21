import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CATEGORIES = [
  {
    category: "Credential Tracking",
    rows: [
      { feature: "Staff members", solo: "5", practice: "15", multi: "50" },
      { feature: "Credentials", solo: "50", practice: "300", multi: "1,000" },
      { feature: "Custom credential types", solo: "✓", practice: "✓", multi: "✓" },
      { feature: "Document uploads", solo: "✓", practice: "✓", multi: "✓" },
      { feature: "Verify Now (license URL)", solo: "✓", practice: "✓", multi: "✓" },
    ],
  },
  {
    category: "Alerts",
    rows: [
      { feature: "Email expiration alerts (90/60/30/7 days)", solo: "✓", practice: "✓", multi: "✓" },
      { feature: "Escalation alerts (expired 7+ days)", solo: "✓", practice: "✓", multi: "✓" },
      { feature: "Alert recipients", solo: "—", practice: "✓", multi: "✓" },
      { feature: "Quarterly audit reminder", solo: "—", practice: "✓", multi: "✓" },
    ],
  },
  {
    category: "Reports",
    rows: [
      { feature: "Basic compliance report (PDF)", solo: "✓", practice: "✓", multi: "✓" },
      { feature: "Audit-ready report with attachments", solo: "—", practice: "✓", multi: "✓" },
      { feature: "Readiness report (PDF)", solo: "—", practice: "✓", multi: "✓" },
      { feature: "White-label reports", solo: "—", practice: "—", multi: "✓" },
    ],
  },
  {
    category: "Inspection Readiness",
    rows: [
      { feature: "7-point readiness checklist", solo: "—", practice: "✓", multi: "✓" },
      { feature: "Auto-fill from credential data", solo: "—", practice: "✓", multi: "✓" },
      { feature: "Readiness score (0-100)", solo: "—", practice: "✓", multi: "✓" },
      { feature: "Gap remediation tracker", solo: "—", practice: "✓", multi: "✓" },
    ],
  },
  {
    category: "Account",
    rows: [
      { feature: "Users", solo: "1", practice: "3", multi: "10" },
      { feature: "Locations", solo: "1", practice: "1", multi: "5" },
      { feature: "User roles (owner/manager/viewer)", solo: "—", practice: "✓", multi: "✓" },
      { feature: "API access", solo: "—", practice: "—", multi: "✓" },
    ],
  },
];

export function ComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary">
            <TableHead className="w-[40%]">Feature</TableHead>
            <TableHead className="text-center">Solo</TableHead>
            <TableHead className="text-center">Practice</TableHead>
            <TableHead className="text-center">Multi-Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {CATEGORIES.map((cat) => (
            <React.Fragment key={cat.category}>
              <TableRow key={cat.category} className="bg-muted/50">
                <TableCell colSpan={4} className="font-semibold text-sm text-foreground">
                  {cat.category}
                </TableCell>
              </TableRow>
              {cat.rows.map((row) => (
                <TableRow key={row.feature}>
                  <TableCell className="text-sm text-foreground">{row.feature}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{row.solo}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{row.practice}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{row.multi}</TableCell>
                </TableRow>
              ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
