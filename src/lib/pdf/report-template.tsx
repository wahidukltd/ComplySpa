import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import {
  buildAttentionItems,
  formatAlertWindows,
  formatReportDate,
  formatReportDateTime,
  splitUpcoming,
  summarizeStaffCredentials,
  type ReportData,
} from "./report-content";
import { REPORT_DOC_TITLE } from "@/lib/report/copy";

export type { ReportData } from "./report-content";

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
    fontSize: 18,
    fontWeight: "bold",
    color: C.ink,
    textAlign: "center",
    marginBottom: 8,
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
  coverScope: {
    fontSize: 7.5,
    color: C.muted,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 1.5,
  },
  coverPrepared: {
    fontSize: 7,
    color: C.muted,
    textAlign: "center",
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
  letterhead: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
    paddingBottom: 10,
  },
  letterheadClinic: {
    fontSize: 14,
    fontWeight: "bold",
    color: C.ink,
    marginBottom: 2,
  },
  letterheadTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.action,
    marginBottom: 2,
  },
  letterheadMeta: {
    fontSize: 8,
    color: C.muted,
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
    fontSize: 11,
    fontWeight: "bold",
    color: C.action,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.action,
    paddingBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  sectionSub: {
    fontSize: 7.5,
    color: C.muted,
    marginBottom: 6,
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
  rollupRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  rollupText: {
    fontSize: 8,
  },
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  adminDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  adminRowText: {
    fontSize: 8.5,
    color: C.ink,
  },
  credColType: { width: "20%" },
  credColLicense: { width: "16%" },
  credColState: { width: "10%" },
  credColIssued: { width: "12%" },
  credColExpires: { width: "12%" },
  credColStatus: { width: "14%" },
  credColVerified: { width: "16%" },
  attColStaff: { width: "30%" },
  attColCred: { width: "32%" },
  attColExpires: { width: "20%" },
  attColStatus: { width: "18%" },
  upcomingColStaff: { width: "20%" },
  upcomingColCred: { width: "20%" },
  upcomingColExpires: { width: "14%" },
  upcomingColDays: { width: "10%" },
  upcomingColStatus: { width: "16%" },
  upcomingColAlerts: { width: "20%" },
  metricCard: {
    backgroundColor: C.surfaceAlt,
    padding: 10,
    marginBottom: 8,
    borderRadius: 2,
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
  const label = formatAlertWindows(sent);
  if (label === "") {
    return <Text style={styles.tableCell}>—</Text>;
  }
  return <Text style={styles.tableCell}>{label}</Text>;
}

export function ComplianceReport({ data, tier }: { data: ReportData; tier?: "basic" | "audit" }) {
  const isBasic = tier === "basic";
  const pct = (n: number) => (data.summary.total > 0 ? Math.round((n / data.summary.total) * 100) : 0);
  const complianceScore = pct(data.summary.valid);

  const reportDate = formatReportDate(data.generatedAt);
  const reportDateTime = formatReportDateTime(data.generatedAt);
  const staffWithoutCredentials = data.staffMembers.filter((s) => s.credentials.length === 0).length;

  const coverPage = !isBasic ? (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverInner}>
        <View style={[styles.coverAccent, { backgroundColor: C.action }]} />
        <Text style={styles.coverTitle}>{REPORT_DOC_TITLE}</Text>
        <Text style={styles.coverSubtitle}>{data.clinic.name}</Text>
        <View style={styles.coverDivider} />
        <Text style={styles.coverMeta}>Medical Director</Text>
        <Text style={styles.coverMetaBold}>{data.medicalDirector || "Not designated"}</Text>
        <View style={{ height: 12 }} />
        <Text style={styles.coverMeta}>Prepared by</Text>
        <Text style={styles.coverMetaBold}>{data.generatedBy}</Text>
        <View style={{ height: 12 }} />
        <Text style={styles.coverMeta}>Date Generated</Text>
        <Text style={styles.coverMetaBold}>{reportDateTime}</Text>
        <View style={{ height: 12 }} />
        <Text style={styles.coverMeta}>Report ID</Text>
        <Text style={styles.coverMetaBold}>{data.reportId}</Text>
        <View style={{ height: 24 }} />
        <Text style={styles.coverScope}>
          This report reflects the records in the clinic&apos;s compliance tracking system as of {reportDate}.
        </Text>
        <View style={{ height: 12 }} />
        <Text style={styles.coverPrepared}>Prepared by ComplySpa</Text>
      </View>
    </Page>
  ) : null;

  const brandedHeader = !isBasic ? (
    <Text style={styles.header} fixed>
      <Text style={styles.headerBrand}>{REPORT_DOC_TITLE}</Text>
      <Text> — {data.clinic.name}</Text>
    </Text>
  ) : null;

  const brandedFooter = !isBasic ? (
    <Text style={styles.footer} fixed
      render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `${data.clinic.name} | Page ${pageNumber} of ${totalPages} | Prepared by ComplySpa`
      }
    />
  ) : null;

  const basicFooter = isBasic ? (
    <Text style={styles.footer} fixed
      render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `Page ${pageNumber} of ${totalPages} | Prepared by ComplySpa`
      }
    />
  ) : null;

  const letterhead = isBasic ? (
    <View style={styles.letterhead}>
      <Text style={styles.letterheadClinic}>{data.clinic.name}</Text>
      <Text style={styles.letterheadTitle}>{REPORT_DOC_TITLE}</Text>
      <Text style={styles.letterheadMeta}>Generated {reportDateTime} by {data.generatedBy}</Text>
    </View>
  ) : null;

  const executiveSummary = !isBasic ? (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: C.action, borderBottomColor: C.action }]}>Executive Summary</Text>
      <View style={styles.executiveSummary}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <View>
            <Text style={[styles.summaryScore, { color: C.action }]}>{complianceScore}%</Text>
            <Text style={styles.summaryScoreLabel}>Credential Validity</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.summaryScore, { color: C.action }]}>{data.staffMembers.length}</Text>
            <Text style={styles.summaryScoreLabel}>Active Staff</Text>
          </View>
        </View>
        <Text style={styles.summaryText}>
          As of {reportDate}, {data.clinic.name} holds {data.summary.total} tracked credentials across{" "}
          {data.staffMembers.length} active staff members. {data.summary.valid} credentials ({complianceScore}%) are
          valid, {data.summary.expired} are expired, and {data.summary.expiring} expire within the next 90 days.
          {data.summary.noExpiration > 0
            ? ` ${data.summary.noExpiration} credentials carry no expiration date and require manual review.`
            : ""}
        </Text>
        <Text style={styles.summaryText}>
          {data.medicalDirector
            ? `The clinic's medical director is ${data.medicalDirector}.`
            : "A medical director is not currently designated."}
          {staffWithoutCredentials > 0
            ? ` ${staffWithoutCredentials} staff ${staffWithoutCredentials === 1 ? "member has" : "members have"} no tracked credentials.`
            : ""}
        </Text>
        <Text style={styles.summaryText}>
          This report is a point-in-time record prepared from the clinic&apos;s compliance tracking system and is intended
          for internal review and regulatory inspection preparation.
        </Text>
      </View>
    </View>
  ) : null;

  const overviewContent = (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: C.action, borderBottomColor: C.action }]}>Clinic Overview</Text>
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
          <Text style={styles.overviewValue}>{reportDateTime}</Text>
        </View>
        <View style={styles.overviewBlock}>
          <Text style={styles.overviewLabel}>Generated By</Text>
          <Text style={styles.overviewValue}>{data.generatedBy}</Text>
        </View>
      </View>
    </View>
  );

  const summaryContent = (
    <View style={styles.section} break>
      <Text style={[styles.sectionTitle, { color: C.action, borderBottomColor: C.action }]}>Credential Status Summary</Text>

      {!isBasic && (
        <View style={styles.metricCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={styles.metricCardValue}>{data.summary.total}</Text>
              <Text style={styles.metricCardSub}>Tracked</Text>
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
            <Text style={styles.metricLabel}>Credentials tracked</Text>
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
          Credentials without an expiration date on record: {data.summary.noExpiration} — requires manual review
        </Text>
      )}
    </View>
  );

  const attentionItems = buildAttentionItems(data);

  const attentionContent = (
    <View style={styles.section} break>
      <Text style={[styles.sectionTitle, { color: C.action, borderBottomColor: C.action }]}>Items Requiring Attention</Text>
      <Text style={styles.sectionSub}>Credentials and administrative items requiring action as of {reportDate}</Text>

      {attentionItems.credentialItems.length === 0 && attentionItems.adminItems.length === 0 ? (
        <Text style={[styles.emptySection, { color: C.valid }]}>
          No items require attention as of {reportDate}.
        </Text>
      ) : (
        <>
          {attentionItems.credentialItems.length > 0 && (
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ ...styles.tableHeaderCell, ...styles.attColStaff }}>Staff</Text>
                <Text style={{ ...styles.tableHeaderCell, ...styles.attColCred }}>Credential</Text>
                <Text style={{ ...styles.tableHeaderCell, ...styles.attColExpires }}>Expires</Text>
                <Text style={{ ...styles.tableHeaderCell, ...styles.attColStatus }}>Status</Text>
              </View>
              {attentionItems.credentialItems.map((item, i) => (
                <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={{ ...styles.tableCell, ...styles.attColStaff }}>{item.staffName}</Text>
                  <Text style={{ ...styles.tableCell, ...styles.attColCred }}>{item.type}</Text>
                  <Text style={{ ...styles.tableCell, ...styles.attColExpires }}>{formatReportDate(item.expirationDate)}</Text>
                  <View style={{ ...styles.attColStatus }}>
                    <StatusBadge status={item.status} />
                  </View>
                </View>
              ))}
            </View>
          )}

          {attentionItems.adminItems.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {attentionItems.adminItems.map((item, i) => (
                <View key={i} style={styles.adminRow}>
                  <View style={[styles.adminDot, { backgroundColor: C.expiring }]} />
                  <Text style={styles.adminRowText}>{item.message}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );

  const upcomingTable = splitUpcoming(data.upcoming).upcoming;

  const upcomingContent = (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: C.action, borderBottomColor: C.action }]}>Upcoming Renewals</Text>
      <Text style={styles.sectionSub}>Credentials expiring within 31–90 days</Text>

      {upcomingTable.length === 0 ? (
        <Text style={styles.emptySection}>No credentials expiring within 31–90 days.</Text>
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
          {upcomingTable.map((item, i) => (
            <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColStaff }}>{item.staffName}</Text>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColCred }}>{item.credentialType}</Text>
              <Text style={{ ...styles.tableCell, ...styles.upcomingColExpires }}>{formatReportDate(item.expirationDate)}</Text>
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

  const registerContent = !isBasic ? (
    <View style={styles.section} break>
      <Text style={[styles.sectionTitle, { color: C.action, borderBottomColor: C.action }]}>Staff Credential Register</Text>
      {data.staffMembers.length === 0 ? (
        <Text style={styles.emptySection}>No staff members on record.</Text>
      ) : (
        data.staffMembers.map((staff) => {
          const rollup = summarizeStaffCredentials(staff.credentials);
          const rollupSegments = [
            rollup.valid > 0 && { text: `${rollup.valid} valid`, color: C.valid },
            rollup.expiring > 0 && { text: `${rollup.expiring} expiring`, color: C.expiring },
            rollup.expired > 0 && { text: `${rollup.expired} expired`, color: C.expired },
          ].filter(Boolean) as Array<{ text: string; color: string }>;
          return (
            <View key={staff.id} wrap={false}>
              <Text style={[styles.staffName, { color: C.action }]}>{staff.name}</Text>
              <Text style={styles.staffMeta}>
                {[staff.role, staff.hireDate ? `Hired: ${formatReportDate(staff.hireDate)}` : ""].filter(Boolean).join(" | ")}
              </Text>
              {rollupSegments.length > 0 && (
                <View style={styles.rollupRow}>
                  {rollupSegments.map((seg, i) => (
                    <View key={seg.text} style={{ flexDirection: "row" }}>
                      {i > 0 && <Text style={[styles.rollupText, { color: C.muted }]}> · </Text>}
                      <Text style={[styles.rollupText, { color: seg.color }]}>{seg.text}</Text>
                    </View>
                  ))}
                </View>
              )}
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
                      <Text style={{ ...styles.tableCell, ...styles.credColIssued }}>{formatReportDate(cred.issueDate) || "—"}</Text>
                      <Text style={{ ...styles.tableCell, ...styles.credColExpires }}>{formatReportDate(cred.expirationDate) || "—"}</Text>
                      <View style={{ ...styles.credColStatus }}>
                        <StatusBadge status={cred.status} />
                      </View>
                      <Text style={{ ...styles.tableCell, ...styles.credColVerified }}>{cred.lastVerified ? formatReportDate(cred.lastVerified) : "Never"}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  ) : null;

  const attestationContent = !isBasic ? (
    <View style={styles.section} break>
      <Text style={[styles.sectionTitle, { color: C.action, borderBottomColor: C.action }]}>Attestation</Text>
      <View style={{ marginTop: 20 }}>
        <Text style={styles.attestationText}>
          This report was generated on {reportDateTime} by {data.generatedBy} and reflects the credential records
          maintained in {data.clinic.name}&apos;s compliance tracking system as of the time of generation. The clinic
          is responsible for the accuracy and completeness of the records it maintains.
        </Text>
        <Text style={styles.attestationText}>
          Credential status is derived from the issue and expiration dates recorded in the system. This report is not a
          substitute for independent verification with the issuing authority.
        </Text>
        <Text style={styles.reportIdText}>Report ID: {data.reportId}</Text>
        <Text style={styles.reportIdText}>Generated: {reportDateTime}</Text>
      </View>
    </View>
  ) : null;

  const reportPages = (
    <Page size="A4" style={styles.page} wrap>
      {brandedHeader}
      {brandedFooter}
      {basicFooter}
      {isBasic ? (
        <>
          {letterhead}
          {overviewContent}
          {summaryContent}
          {attentionContent}
          {upcomingContent}
        </>
      ) : (
        <>
          {executiveSummary}
          {overviewContent}
          {summaryContent}
          {attentionContent}
          {upcomingContent}
          {registerContent}
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
