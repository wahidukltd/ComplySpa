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
  ink: "#3D2A25",
  action: "#9C6B5D",
  hairline: "#D9B7A7",
  surfaceAlt: "#F6E3D6",
  canvas: "#FFF8F2",
  muted: "#8B7D78",
  valid: "#4A8C5C",
  expiring: "#C2853A",
  expired: "#B8443A",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 52,
    paddingLeft: 36,
    paddingRight: 36,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 8,
    color: C.muted,
  },
  section: {
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    color: C.ink,
    marginBottom: 4,
  },
  clinicName: {
    fontSize: 14,
    textAlign: "center",
    color: C.ink,
    marginBottom: 2,
  },
  clinicAddress: {
    fontSize: 10,
    textAlign: "center",
    color: C.muted,
    marginBottom: 2,
  },
  metaRow: {
    fontSize: 10,
    color: C.ink,
    marginTop: 14,
    marginBottom: 2,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "bold",
    color: C.action,
    marginBottom: 12,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
    paddingBottom: 4,
  },
  table: {
    marginTop: 6,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.ink,
    padding: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  tableRowAlt: {
    flexDirection: "row",
    backgroundColor: C.canvas,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  tableCell: {
    fontSize: 9,
    color: C.ink,
    padding: 6,
  },
  staffName: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.action,
    marginTop: 14,
    marginBottom: 4,
  },
  staffMeta: {
    fontSize: 9,
    color: C.muted,
    marginBottom: 8,
  },
  emptyCell: {
    fontSize: 9,
    color: C.muted,
    fontStyle: "italic",
    padding: 6,
  },
  summarySection: {
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  summaryLabel: {
    fontSize: 10,
    color: C.ink,
  },
  summaryValue: {
    fontSize: 10,
    color: C.ink,
  },
  noExpirationNote: {
    fontSize: 9,
    color: C.muted,
    fontStyle: "italic",
    marginTop: 10,
  },
  attestationPage: {
    paddingTop: 80,
    paddingBottom: 52,
    paddingLeft: 36,
    paddingRight: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.ink,
  },
  attestationText: {
    fontSize: 9,
    fontStyle: "italic",
    lineHeight: 1.6,
    marginBottom: 12,
  },
  reportIdText: {
    fontSize: 8,
    color: C.muted,
    marginTop: 8,
  },
  emptySection: {
    fontSize: 10,
    color: C.muted,
    fontStyle: "italic",
    marginTop: 8,
  },
  byCategoryHeader: {
    fontSize: 12,
    fontWeight: "bold",
    color: C.action,
    marginTop: 20,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
    paddingBottom: 4,
  },
  credColType: { width: "22%" },
  credColLicense: { width: "16%" },
  credColState: { width: "10%" },
  credColIssued: { width: "13%" },
  credColExpires: { width: "13%" },
  credColStatus: { width: "13%" },
  credColVerified: { width: "13%" },
  upcomingColStaff: { width: "22%" },
  upcomingColCred: { width: "22%" },
  upcomingColExpires: { width: "14%" },
  upcomingColDays: { width: "10%" },
  upcomingColStatus: { width: "14%" },
  upcomingColAlerts: { width: "18%" },
});

function StatusPill({ status }: { status: string }) {
  const color = status === "valid" ? C.valid : status === "expiring" ? C.expiring : status === "expired" ? C.expired : C.ink;
  const label = status === "valid" ? "Valid" : status === "expiring" ? "Expiring" : status === "expired" ? "Expired" : status;
  return <Text style={{ color, fontSize: 9, padding: 6 }}>{label}</Text>;
}

function AlertsSummary({ sent }: { sent: string[] }) {
  if (sent.length === 0) {
    return <Text style={styles.tableCell}>None</Text>;
  }
  return <Text style={styles.tableCell}>Yes ({sent.join(", ")} days)</Text>;
}

export function ComplianceReport({ data }: { data: ReportData }) {
  const overviewContent = (
    <View style={styles.section}>
      <Text style={styles.title}>Compliance Audit Report</Text>
      <Text style={styles.clinicName}>{data.clinic.name}</Text>
      {data.clinic.address && (
        <Text style={styles.clinicAddress}>
          {data.clinic.address}{data.clinic.state ? `, ${data.clinic.state}` : ""}
        </Text>
      )}
      <Text style={styles.metaRow}>Medical Director: {data.medicalDirector || "Not designated"}</Text>
      <Text style={{ ...styles.metaRow, marginTop: 4 }}>Report generated: {data.generatedAt}</Text>
      <Text style={{ ...styles.metaRow, marginTop: 4 }}>Generated by: {data.generatedBy}</Text>
      <Text style={{ ...styles.metaRow, marginTop: 4 }}>Total active staff: {data.staffMembers.length}</Text>
    </View>
  );

  const registerContent = (
    <View style={styles.section} break>
      <Text style={styles.sectionHeader}>Staff Credential Register</Text>
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
                      <StatusPill status={cred.status} />
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
  );

  const pct = (n: number) => (data.summary.total > 0 ? Math.round((n / data.summary.total) * 100) : 0);

  const summaryContent = (
    <View style={styles.section} break>
      <Text style={styles.sectionHeader}>Credential Status Summary</Text>

      <View style={styles.summarySection}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total credentials tracked</Text>
          <Text style={styles.summaryValue}>{data.summary.total}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Valid</Text>
          <Text style={styles.summaryValue}>{data.summary.valid} ({pct(data.summary.valid)}%)</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Expiring</Text>
          <Text style={{ ...styles.summaryValue, color: C.expiring }}>{data.summary.expiring} ({pct(data.summary.expiring)}%)</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Expired</Text>
          <Text style={{ ...styles.summaryValue, color: C.expired }}>{data.summary.expired} ({pct(data.summary.expired)}%)</Text>
        </View>
      </View>

      <Text style={styles.byCategoryHeader}>By Category</Text>
      <View style={styles.summarySection}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>License</Text>
          <Text style={styles.summaryValue}>{data.summary.byCategory.license}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Training</Text>
          <Text style={styles.summaryValue}>{data.summary.byCategory.training}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Insurance</Text>
          <Text style={styles.summaryValue}>{data.summary.byCategory.insurance}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Agreement</Text>
          <Text style={styles.summaryValue}>{data.summary.byCategory.agreement}</Text>
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
      <Text style={styles.sectionHeader}>Upcoming Renewals &amp; Alert History</Text>

      {data.upcoming.length === 0 ? (
        <Text style={styles.emptySection}>No credentials expiring within 90 days.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColStaff }}>Staff</Text>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColCred }}>Credential</Text>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColExpires }}>Expires</Text>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColDays }}>Days Left</Text>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColStatus }}>Status</Text>
            <Text style={{ ...styles.tableHeaderCell, ...styles.upcomingColAlerts }}>Alerts Sent</Text>
          </View>
          {data.upcoming.map((item, i) => (
            <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColStaff }}>{item.staffName}</Text>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColCred }}>{item.credentialType}</Text>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColExpires }}>{item.expirationDate}</Text>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColDays }}>{item.daysLeft}</Text>
              <View style={{ ...styles.upcomingColStatus }}>
                <StatusPill status={item.status} />
              </View>
              <AlertsSummary sent={item.alertsSent} />
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const attestationContent = (
    <View style={styles.section} break>
      <Text style={styles.attestationText}>
        This compliance audit report was generated on {data.generatedAt} by {data.generatedBy}. The
        information above reflects the credential records maintained in the clinic&apos;s compliance tracking
        system as of the generation date. Verification of accuracy is the responsibility of the clinic owner
        or medical director.
      </Text>
      <Text style={styles.reportIdText}>Report ID: {data.reportId}</Text>
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
        {overviewContent}
        {registerContent}
        {summaryContent}
        {upcomingContent}
        {attestationContent}
      </Page>
    </Document>
  );
}
