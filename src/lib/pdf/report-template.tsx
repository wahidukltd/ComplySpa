import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface ReportData {
  clinic: { name: string; address: string | null; state: string | null };
  medicalDirector: string | null;
  generatedBy: string;
  staffMembers: Array<{
    id: string;
    name: string;
    role: string | null;
    hireDate: string | null;
    credentials: Array<{
      type: string;
      licenseNumber: string | null;
      state: string | null;
      issueDate: string | null;
      expirationDate: string | null;
      status: string;
      lastVerified: string | null;
    }>;
  }>;
  summary: {
    total: number;
    valid: number;
    expiring: number;
    expired: number;
    noExpiration: number;
    byCategory: { license: number; training: number; insurance: number; agreement: number };
  };
  upcoming: Array<{
    staffName: string;
    credentialType: string;
    expirationDate: string;
    daysLeft: number;
    status: string;
    alertsSent: string[];
  }>;
  reportId: string;
  generatedAt: string;
}

const C = {
  ink: "#000000",
  action: "#6E97A7",
  hairline: "rgba(0,0,0,0.10)",
  surfaceAlt: "#F0F4F5",
  canvas: "#FFFFFF",
  muted: "rgba(0,0,0,0.50)",
  valid: "#4A8C5C",
  expiring: "#C2853A",
  expired: "#B8443A",
  sectionTitle: "#6E97A7",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 52,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: C.ink,
  },
  coverPage: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    fontFamily: "Helvetica",
    color: C.ink,
  },
  coverInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 60,
  },
  coverAccent: {
    width: 60,
    height: 3,
    backgroundColor: C.action,
    marginBottom: 32,
  },
  coverTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: C.ink,
    textAlign: "center",
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 11,
    color: C.muted,
    textAlign: "center",
    marginBottom: 48,
  },
  coverMeta: {
    fontSize: 9,
    color: C.muted,
    textAlign: "center",
    marginBottom: 3,
  },
  coverMetaBold: {
    fontSize: 9,
    color: C.ink,
    textAlign: "center",
    marginBottom: 3,
  },
  coverDivider: {
    width: 40,
    height: 1,
    backgroundColor: C.hairline,
    marginVertical: 28,
  },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: C.muted,
  },
  header: {
    position: "absolute",
    top: 14,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.muted,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
    paddingBottom: 8,
  },
  headerBrand: {
    fontSize: 7,
    color: C.action,
    fontWeight: "bold",
  },
  section: {
    marginBottom: 20,
  },
  overviewBlock: {
    marginBottom: 4,
    flexDirection: "row",
  },
  overviewLabel: {
    fontSize: 9,
    color: C.muted,
    width: 120,
  },
  overviewValue: {
    fontSize: 9,
    color: C.ink,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: C.sectionTitle,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.action,
    paddingBottom: 5,
  },
  subsectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.ink,
    marginTop: 14,
    marginBottom: 6,
  },
  table: {
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: "bold",
    color: C.ink,
    paddingVertical: 5,
    paddingHorizontal: 5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  tableRowAlt: {
    flexDirection: "row",
    backgroundColor: "#F8FAFB",
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  tableCell: {
    fontSize: 8,
    color: C.ink,
    paddingVertical: 5,
    paddingHorizontal: 5,
  },
  emptyCell: {
    fontSize: 8,
    color: C.muted,
    fontStyle: "italic",
    paddingVertical: 5,
    paddingHorizontal: 5,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  metricLabel: {
    fontSize: 9,
    color: C.ink,
  },
  metricValue: {
    fontSize: 9,
    color: C.ink,
  },
  noExpirationNote: {
    fontSize: 8,
    color: C.muted,
    fontStyle: "italic",
    marginTop: 8,
  },
  attestationText: {
    fontSize: 8.5,
    fontStyle: "italic",
    lineHeight: 1.7,
    marginBottom: 10,
    color: C.ink,
  },
  reportIdText: {
    fontSize: 7.5,
    color: C.muted,
    marginTop: 6,
  },
  emptySection: {
    fontSize: 9,
    color: C.muted,
    fontStyle: "italic",
    marginTop: 6,
  },
  staffName: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.action,
    marginTop: 12,
    marginBottom: 3,
  },
  staffMeta: {
    fontSize: 8,
    color: C.muted,
    marginBottom: 6,
  },
  credColType: { width: "20%" },
  credColLicense: { width: "16%" },
  credColState: { width: "10%" },
  credColIssued: { width: "12%" },
  credColExpires: { width: "12%" },
  credColStatus: { width: "14%" },
  credColVerified: { width: "16%" },
  upcomingColStaff: { width: "20%" },
  upcomingColCred: { width: "20%" },
  upcomingColExpires: { width: "14%" },
  upcomingColDays: { width: "10%" },
  upcomingColStatus: { width: "16%" },
  upcomingColAlerts: { width: "20%" },
  statusPill: {
    fontSize: 7.5,
    paddingVertical: 2,
    paddingHorizontal: 5,
    marginLeft: 5,
  },
  metricCard: {
    backgroundColor: C.surfaceAlt,
    padding: 10,
    marginBottom: 8,
    borderRadius: 2,
  },
  metricCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metricCardLabel: {
    fontSize: 8,
    color: C.muted,
  },
  metricCardValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: C.ink,
  },
  metricCardSub: {
    fontSize: 7.5,
    color: C.muted,
  },
  complianceScore: {
    fontSize: 26,
    fontWeight: "bold",
    color: C.action,
    textAlign: "center",
    marginBottom: 2,
  },
  complianceLabel: {
    fontSize: 8,
    color: C.muted,
    textAlign: "center",
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
  },
  categoryItem: {
    width: "48%",
    marginBottom: 6,
    marginRight: "2%",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  categoryLabel: {
    fontSize: 8.5,
    color: C.muted,
  },
  categoryValue: {
    fontSize: 8.5,
    color: C.ink,
    fontWeight: "bold",
  },
  executiveSummary: {
    backgroundColor: C.surfaceAlt,
    padding: 14,
    marginBottom: 16,
    borderRadius: 2,
  },
  summaryTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.action,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 8.5,
    color: C.ink,
    lineHeight: 1.6,
    marginBottom: 4,
  },
  summaryScore: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.action,
  },
  summaryScoreLabel: {
    fontSize: 7.5,
    color: C.muted,
  },
});

function StatusBadge({ status }: { status: string }) {
  const color = status === "valid" ? C.valid : status === "expiring" ? C.expiring : status === "expired" ? C.expired : C.ink;
  const label = status === "valid" ? "Valid" : status === "expiring" ? "Expiring" : status === "expired" ? "Expired" : status;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginRight: 4 }} />
      <Text style={{ color, fontSize: 8 }}>{label}</Text>
    </View>
  );
}

function AlertsSummary({ sent }: { sent: string[] }) {
  if (sent.length === 0) {
    return <Text style={styles.tableCell}>—</Text>;
  }
  return <Text style={styles.tableCell}>{sent.join(", ")}d</Text>;
}

export function ComplianceReport({ data, tier }: { data: ReportData; tier?: "basic" | "audit" | "white_label" }) {
  const isWhiteLabel = tier === "white_label";
  const isBasic = tier === "basic";
  const pct = (n: number) => (data.summary.total > 0 ? Math.round((n / data.summary.total) * 100) : 0);
  const complianceScore = data.summary.total > 0 ? pct(data.summary.valid) : 0;
  const sectionTitleColor = isWhiteLabel ? C.ink : C.action;

  const coverPage = !isBasic ? (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverInner}>
        <View style={styles.coverAccent} />
        {!isWhiteLabel && <Text style={styles.coverTitle}>Compliance Audit Report</Text>}
        <Text style={[styles.coverTitle, { fontSize: 18 }]}>{data.clinic.name}</Text>
        <View style={styles.coverDivider} />
        <Text style={styles.coverMeta}>Medical Director</Text>
        <Text style={styles.coverMetaBold}>{data.medicalDirector || "Not designated"}</Text>
        <View style={{ height: 12 }} />
        <Text style={styles.coverMeta}>{isWhiteLabel ? "Generated by" : "Prepared by"}</Text>
        <Text style={styles.coverMetaBold}>{data.generatedBy}</Text>
        <View style={{ height: 12 }} />
        <Text style={styles.coverMeta}>Date Generated</Text>
        <Text style={styles.coverMetaBold}>{data.generatedAt}</Text>
        <View style={{ height: 24 }} />
        {!isWhiteLabel && <Text style={{ fontSize: 7, color: C.muted, textAlign: "center" }}>Prepared by ComplySpa</Text>}
      </View>
    </Page>
  ) : null;

  const brandedHeader = !isWhiteLabel && !isBasic ? (
    <Text style={styles.header} fixed>
      <Text style={styles.headerBrand}>Compliance Audit Report</Text>
      <Text> — {data.clinic.name}</Text>
    </Text>
  ) : null;

  const brandedFooter = !isWhiteLabel && !isBasic ? (
    <Text style={styles.footer} fixed
      render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `${data.clinic.name} | Page ${pageNumber} of ${totalPages} | Prepared by ComplySpa`
      }
    />
  ) : null;

  const executiveSummary = !isBasic ? (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: sectionTitleColor, borderBottomColor: sectionTitleColor }]}>Executive Summary</Text>
      <View style={styles.executiveSummary}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <View>
            <Text style={[styles.summaryScore, { color: sectionTitleColor }]}>{complianceScore}%</Text>
            <Text style={styles.summaryScoreLabel}>Compliance Score</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.summaryScore}>{data.staffMembers.length}</Text>
            <Text style={styles.summaryScoreLabel}>Active Staff</Text>
          </View>
        </View>
        <Text style={styles.summaryText}>
          This report summarizes the credential status for {data.staffMembers.length} active staff
          members and {data.summary.total} tracked credentials at {data.clinic.name}.
          Of {data.summary.total} credentials, {data.summary.valid} ({complianceScore}%) are valid,
          {data.summary.expiring} are approaching expiration, and {data.summary.expired} have expired.
        </Text>
      </View>
    </View>
  ) : null;

  const overviewContent = (
    <View style={styles.section}>
      {isBasic && <Text style={styles.sectionTitle}>Basic Compliance Report</Text>}
      {!isBasic && <Text style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Clinic Overview</Text>}
      <View style={{ marginTop: 4 }}>
        <View style={styles.overviewBlock}>
          <Text style={styles.overviewLabel}>Clinic</Text>
          <Text style={styles.overviewValue}>{data.clinic.name}</Text>
        </View>
        {data.clinic.address && (
          <View style={styles.overviewBlock}>
            <Text style={styles.overviewLabel}>Address</Text>
            <Text style={styles.overviewValue}>
              {data.clinic.address}{data.clinic.state ? `, ${data.clinic.state}` : ""}
            </Text>
          </View>
        )}
        <View style={styles.overviewBlock}>
          <Text style={styles.overviewLabel}>Medical Director</Text>
          <Text style={styles.overviewValue}>{data.medicalDirector || "Not designated"}</Text>
        </View>
        <View style={styles.overviewBlock}>
          <Text style={styles.overviewLabel}>Generated</Text>
          <Text style={styles.overviewValue}>{data.generatedAt}</Text>
        </View>
        <View style={styles.overviewBlock}>
          <Text style={styles.overviewLabel}>Generated By</Text>
          <Text style={styles.overviewValue}>{data.generatedBy}</Text>
        </View>
      </View>
    </View>
  );

  const registerContent = !isBasic ? (
    <View style={styles.section} break>
      <Text style={[styles.sectionTitle, { color: sectionTitleColor, borderBottomColor: sectionTitleColor }]}>Staff Credential Register</Text>
      {data.staffMembers.length === 0 ? (
        <Text style={styles.emptySection}>No staff members on record.</Text>
      ) : (
        data.staffMembers.map((staff) => (
          <View key={staff.id} wrap={false}>
            <Text style={styles.staffName}>{staff.name}</Text>
            <Text style={styles.staffMeta}>
              {[staff.role, staff.hireDate ? `Hired: ${staff.hireDate}` : ""].filter(Boolean).join(" | ")}
            </Text>
            {staff.credentials.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={styles.emptyCell}>No credentials tracked</Text>
              </View>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={{ ...styles.tableHeaderCell, ...styles.credColType }}>Type</Text>
                  <Text style={{ ...styles.tableHeaderCell, ...styles.credColLicense }}>License #</Text>
                  <Text style={{ ...styles.tableHeaderCell, ...styles.credColState }}>State</Text>
                  <Text style={{ ...styles.tableHeaderCell, ...styles.credColIssued }}>Issued</Text>
                  <Text style={{ ...styles.tableHeaderCell, ...styles.credColExpires }}>Expires</Text>
                  <Text style={{ ...styles.tableHeaderCell, ...styles.credColStatus }}>Status</Text>
                  <Text style={{ ...styles.tableHeaderCell, ...styles.credColVerified }}>Verified</Text>
                </View>
                {staff.credentials.map((cred, ci) => (
                  <View key={ci} style={ci % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                    <Text style={{ ...styles.tableCell, ...styles.credColType }}>{cred.type}</Text>
                    <Text style={{ ...styles.tableCell, ...styles.credColLicense }}>{cred.licenseNumber || "—"}</Text>
                    <Text style={{ ...styles.tableCell, ...styles.credColState }}>{cred.state || "—"}</Text>
                    <Text style={{ ...styles.tableCell, ...styles.credColIssued }}>{cred.issueDate || "—"}</Text>
                    <Text style={{ ...styles.tableCell, ...styles.credColExpires }}>{cred.expirationDate || "—"}</Text>
                    <View style={{ ...styles.credColStatus }}>
                      <StatusBadge status={cred.status} />
                    </View>
                    <Text style={{ ...styles.tableCell, ...styles.credColVerified }}>{cred.lastVerified || "Never"}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))
      )}
    </View>
  ) : null;

  const summaryContent = (
    <View style={styles.section} break>
      <Text style={[styles.sectionTitle, { color: sectionTitleColor, borderBottomColor: sectionTitleColor }]}>Credential Status Summary</Text>

      {!isBasic && (
        <View style={styles.metricCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={styles.metricCardValue}>{data.summary.total}</Text>
              <Text style={styles.metricCardSub}>Total</Text>
            </View>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={[styles.metricCardValue, { color: C.valid }]}>{data.summary.valid}</Text>
              <Text style={styles.metricCardSub}>Valid</Text>
            </View>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={[styles.metricCardValue, { color: C.expiring }]}>{data.summary.expiring}</Text>
              <Text style={styles.metricCardSub}>Expiring</Text>
            </View>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={[styles.metricCardValue, { color: C.expired }]}>{data.summary.expired}</Text>
              <Text style={styles.metricCardSub}>Expired</Text>
            </View>
          </View>
        </View>
      )}

      {isBasic && (
        <View style={{ marginBottom: 8 }}>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Total credentials tracked</Text>
            <Text style={styles.metricValue}>{data.summary.total}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Valid</Text>
            <Text style={[styles.metricValue, { color: C.valid }]}>{data.summary.valid} ({pct(data.summary.valid)}%)</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Expiring</Text>
            <Text style={[styles.metricValue, { color: C.expiring }]}>{data.summary.expiring} ({pct(data.summary.expiring)}%)</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Expired</Text>
            <Text style={[styles.metricValue, { color: C.expired }]}>{data.summary.expired} ({pct(data.summary.expired)}%)</Text>
          </View>
        </View>
      )}

      <Text style={styles.subsectionTitle}>By Category</Text>
      <View style={styles.categoryGrid}>
        <View style={styles.categoryItem}>
          <Text style={styles.categoryLabel}>License</Text>
          <Text style={styles.categoryValue}>{data.summary.byCategory.license}</Text>
        </View>
        <View style={styles.categoryItem}>
          <Text style={styles.categoryLabel}>Training</Text>
          <Text style={styles.categoryValue}>{data.summary.byCategory.training}</Text>
        </View>
        <View style={styles.categoryItem}>
          <Text style={styles.categoryLabel}>Insurance</Text>
          <Text style={styles.categoryValue}>{data.summary.byCategory.insurance}</Text>
        </View>
        <View style={styles.categoryItem}>
          <Text style={styles.categoryLabel}>Agreement</Text>
          <Text style={styles.categoryValue}>{data.summary.byCategory.agreement}</Text>
        </View>
      </View>

      {data.summary.noExpiration > 0 && (
        <Text style={styles.noExpirationNote}>
          Credentials with no expiration date: {data.summary.noExpiration} — manual review required
        </Text>
      )}
    </View>
  );

  const upcomingContent = (
    <View style={styles.section} break>
      <Text style={[styles.sectionTitle, { color: sectionTitleColor, borderBottomColor: sectionTitleColor }]}>Upcoming Renewals</Text>

      {!isBasic && <Text style={{ fontSize: 7.5, color: C.muted, marginBottom: 6 }}>Credentials expiring within 90 days</Text>}

      {data.upcoming.length === 0 ? (
        <Text style={styles.emptySection}>No credentials expiring within 90 days.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColStaff }}>Staff</Text>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColCred }}>Credential</Text>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColExpires }}>Expires</Text>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColDays }}>Days</Text>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColStatus }}>Status</Text>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColAlerts }}>Alerts</Text>
          </View>
          {data.upcoming.map((item, i) => (
            <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColStaff }}>{item.staffName}</Text>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColCred }}>{item.credentialType}</Text>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColExpires }}>{item.expirationDate}</Text>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColDays }}>{item.daysLeft}</Text>
              <View style={{ ...styles.upcomingColStatus }}>
                <StatusBadge status={item.status} />
              </View>
              <AlertsSummary sent={item.alertsSent} />
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const attestationContent = !isBasic ? (
    <View style={styles.section} break>
      <Text style={[styles.sectionTitle, { color: sectionTitleColor, borderBottomColor: sectionTitleColor }]}>Attestation</Text>
      <View style={{ marginTop: 20 }}>
        <Text style={styles.attestationText}>
          This compliance audit report was generated on {data.generatedAt} by {data.generatedBy}. The
          information herein reflects the credential records maintained in the clinic&apos;s compliance
          tracking system as of the generation date. Verification of accuracy and completeness is the
          responsibility of the clinic owner or medical director.
        </Text>
        <Text style={styles.attestationText}>
          This document is intended for internal compliance review and regulatory inspection preparation.
          It is not a substitute for independent verification of individual credential status with the
          issuing authority.
        </Text>
        <Text style={styles.reportIdText}>Report ID: {data.reportId}</Text>
        <Text style={styles.reportIdText}>Generated: {data.generatedAt}</Text>
      </View>
    </View>
  ) : null;

  const reportPages = (
    <Page size="A4" style={styles.page} wrap>
      {brandedHeader}
      {brandedFooter}
      {isBasic ? (
        <>
          {overviewContent}
          {summaryContent}
          {upcomingContent}
        </>
      ) : (
        <>
          {executiveSummary}
          {overviewContent}
          {registerContent}
          {summaryContent}
          {upcomingContent}
          {attestationContent}
        </>
      )}
    </Page>
  );

  return (
    <Document>
      {coverPage}
      {reportPages}
    </Document>
  );
}
