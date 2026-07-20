"use client";

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { CHECKLIST_ITEMS } from "@/lib/audit/checklist";
import { scoreTier } from "@/lib/audit/readiness";
import type { FindingStatus, AuditFinding } from "@/lib/audit/checklist";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontWeight: "bold", color: "#3D2A25", textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 10, color: "#8B7D78", textAlign: "center", marginBottom: 24 },
  scoreContainer: { alignItems: "center", marginBottom: 24 },
  scoreValue: { fontSize: 36, fontWeight: "bold" },
  scoreLabel: { fontSize: 10, color: "#8B7D78", marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: "bold", color: "#9C6B5D", marginBottom: 12, marginTop: 8 },
  itemRow: { flexDirection: "row", marginBottom: 6, borderBottomWidth: 0.5, borderBottomColor: "#D9B7A7", paddingBottom: 4 },
  itemLabel: { fontSize: 10, color: "#3D2A25", flex: 1 },
  itemStatus: { fontSize: 10, fontWeight: "bold", width: 80 },
  itemNotes: { fontSize: 8, color: "#8B7D78", marginTop: 2 },
  gapRow: { flexDirection: "row", marginBottom: 4, fontSize: 9 },
  attestation: { marginTop: 30, fontSize: 8, color: "#8B7D78", fontStyle: "italic", textAlign: "center" },
});

interface Props {
  clinicName: string;
  score: number | null;
  findings: AuditFinding[];
  completedAt: string;
}

const STATUS_COLORS: Record<FindingStatus, string> = {
  pass: "#4A8C5C",
  fail: "#B8443A",
  stale: "#C2853A",
  manual_attest: "#8B7D78",
};

const STATUS_LABELS: Record<FindingStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  stale: "Stale",
  manual_attest: "Confirmed",
};

export function ReadinessReportDocument({ clinicName, score, findings, completedAt }: Props) {
  const tier = score !== null ? scoreTier(score) : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Inspection-Readiness Report</Text>
        <Text style={styles.subtitle}>
          {clinicName}
          {" — "}
          {completedAt
            ? new Date(completedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : ""}
        </Text>

        <View style={styles.scoreContainer}>
          <Text style={[styles.scoreValue, { color: tier?.color ?? "#8B7D78" }]}>
            {score !== null ? `${score}%` : "—"}
          </Text>
          <Text style={styles.scoreLabel}>{tier?.label ?? "Not scored"}</Text>
        </View>

        <Text style={styles.sectionTitle}>7-Point Checklist</Text>
        {CHECKLIST_ITEMS.map((item) => {
          const f = findings.find((x) => x.checklistItem === item.id);
          if (!f) return null;
          return (
            <View key={item.id} style={styles.itemRow} wrap={false}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLabel}>
                  {item.label}
                  {f.autoFilled ? " (auto)" : ""}
                </Text>
                {f.notes ? <Text style={styles.itemNotes}>{f.notes}</Text> : null}
              </View>
              <Text style={[styles.itemStatus, { color: STATUS_COLORS[f.status] }]}>
                {STATUS_LABELS[f.status]}
              </Text>
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Gaps & Remediation</Text>
        {findings.filter((f) => f.status === "fail" || f.status === "stale").length === 0 ? (
          <Text style={{ fontSize: 10, color: "#8B7D78" }}>No gaps identified.</Text>
        ) : (
          findings
            .filter((f) => f.status === "fail" || f.status === "stale")
            .map((g) => {
              const label =
                CHECKLIST_ITEMS.find((i) => i.id === g.checklistItem)?.label ?? g.checklistItem;
              return (
                <View key={g.checklistItem} style={styles.gapRow} wrap={false}>
                  <Text style={{ flex: 1, fontSize: 9 }}>{label}</Text>
                  <Text style={{ width: 60, fontSize: 9, color: g.status === "fail" ? "#B8443A" : "#C2853A" }}>
                    {g.status === "fail" ? "Fail" : "Stale"}
                  </Text>
                  <Text style={{ width: 80, fontSize: 9, color: "#8B7D78" }}>
                    {g.remediationStatus ?? "Open"}
                  </Text>
                </View>
              );
            })
        )}

        <Text style={styles.attestation}>
          This inspection-readiness report was generated from the credential tracking system. Verify
          all information before a regulatory inspection.
        </Text>
      </Page>
    </Document>
  );
}
