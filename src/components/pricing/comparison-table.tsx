import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CATEGORIES = [
  {
    category: "Credential Tracking",
    rows: [
      { feature: "Staff members", solo: "5", practice: "15" },
      { feature: "Credentials", solo: "50", practice: "300" },
      { feature: "Custom credential types", solo: "✓", practice: "✓" },
      { feature: "Document uploads", solo: "✓", practice: "✓" },
      { feature: "Verify Now (license URL)", solo: "✓", practice: "✓" },
    ],
  },
  {
    category: "Alerts",
    rows: [
      { feature: "Email expiration alerts (90/60/30/7 days)", solo: "✓", practice: "✓" },
      { feature: "Escalation alerts (expired 7+ days)", solo: "✓", practice: "✓" },
      { feature: "Alert recipients", solo: "—", practice: "✓" },
      { feature: "Quarterly audit reminder", solo: "—", practice: "✓" },
    ],
  },
  {
    category: "Reports",
    rows: [
      { feature: "Basic compliance report (PDF)", solo: "✓", practice: "✓" },
      { feature: "Audit-ready report with attachments", solo: "—", practice: "✓" },
      { feature: "Readiness report (PDF)", solo: "—", practice: "✓" },
    ],
  },
  {
    category: "Inspection Readiness",
    rows: [
      { feature: "7-point readiness checklist", solo: "—", practice: "✓" },
      { feature: "Auto-fill from credential data", solo: "—", practice: "✓" },
      { feature: "Readiness score (0-100)", solo: "—", practice: "✓" },
      { feature: "Gap remediation tracker", solo: "—", practice: "✓" },
    ],
  },
  {
    category: "Account",
    rows: [
      { feature: "Users", solo: "1", practice: "3" },
      { feature: "User roles (owner/manager/viewer)", solo: "—", practice: "✓" },
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {CATEGORIES.map((cat) => (
            <React.Fragment key={cat.category}>
              <TableRow key={cat.category} className="bg-muted/50">
                <TableCell colSpan={3} className="font-semibold text-sm text-foreground">
                  {cat.category}
                </TableCell>
              </TableRow>
              {cat.rows.map((row) => (
                <TableRow key={row.feature}>
                  <TableCell className="text-sm text-foreground">{row.feature}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{row.solo}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{row.practice}</TableCell>
                </TableRow>
              ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
