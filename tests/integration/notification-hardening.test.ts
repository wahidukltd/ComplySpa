import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import "./helpers";
import { execSql } from "./helpers";

describe("notification hardening (migration 046)", () => {
  const adminClient = createAdminClient();
  const testClinicName = `Harden Test ${Date.now()}`;
  const createdClinicIds: string[] = [];

  afterAll(async () => {
    for (const id of createdClinicIds) {
      await adminClient.from("clinics").delete().eq("id", id);
    }
  });

  it("reconcile_stale_pending_alerts marks pending rows older than 48h as failed with a reason", async () => {
    const { data: clinic } = await adminClient
      .from("clinics")
      .insert({ name: testClinicName, trial_plan: "practice" })
      .select("id")
      .single();
    createdClinicIds.push(clinic!.id);

    const { data: typeRow } = await adminClient
      .from("credential_types")
      .select("id")
      .limit(1)
      .maybeSingle();
    expect(typeRow).not.toBeNull();

    const { data: staff } = await adminClient
      .from("staff_members")
      .insert({ clinic_id: clinic!.id, name: "Harden Test RN", role: "RN" })
      .select("id")
      .single();

    const { data: credential } = await adminClient
      .from("credentials")
      .insert({
        staff_member_id: staff!.id,
        clinic_id: clinic!.id,
        credential_type_id: typeRow!.id,
      })
      .select("id")
      .single();

    const staleId = randomUUID();
    const { error: insertErr } = await adminClient.from("alert_logs").insert({
      id: staleId,
      clinic_id: clinic!.id,
      credential_id: credential!.id,
      alert_type: "email",
      recipient: "owner@test.com",
      delivery_status: "pending",
      days_before_expiration: 7,
      sent_at: new Date(Date.now() - 49 * 3600 * 1000).toISOString(),
    });
    expect(insertErr).toBeNull();

    const freshId = randomUUID();
    await adminClient.from("alert_logs").insert({
      id: freshId,
      clinic_id: clinic!.id,
      credential_id: credential!.id,
      alert_type: "email",
      recipient: "owner@test.com",
      delivery_status: "pending",
      days_before_expiration: 7,
      sent_at: new Date().toISOString(),
    });

    execSql("SELECT reconcile_stale_pending_alerts()");

    const { data: staleRow } = await adminClient
      .from("alert_logs")
      .select("delivery_status, failure_reason")
      .eq("id", staleId)
      .single();
    expect(staleRow!.delivery_status).toBe("failed");
    expect(staleRow!.failure_reason).toBe("no_delivery_confirmation");

    const { data: freshRow } = await adminClient
      .from("alert_logs")
      .select("delivery_status")
      .eq("id", freshId)
      .single();
    expect(freshRow!.delivery_status).toBe("pending");
  });

  it("webhook-style delivered transition records delivered_at", async () => {
    const { data: clinic } = await adminClient
      .from("clinics")
      .insert({ name: `${testClinicName}-delivered`, trial_plan: "practice" })
      .select("id")
      .single();
    createdClinicIds.push(clinic!.id);

    const { data: typeRow } = await adminClient
      .from("credential_types")
      .select("id")
      .limit(1)
      .maybeSingle();
    const { data: staff } = await adminClient
      .from("staff_members")
      .insert({ clinic_id: clinic!.id, name: "Harden Test RN", role: "RN" })
      .select("id")
      .single();
    const { data: credential } = await adminClient
      .from("credentials")
      .insert({
        staff_member_id: staff!.id,
        clinic_id: clinic!.id,
        credential_type_id: typeRow!.id,
      })
      .select("id")
      .single();

    const messageId = `msg-delivered-${Date.now()}`;
    await adminClient.from("alert_logs").insert({
      clinic_id: clinic!.id,
      credential_id: credential!.id,
      alert_type: "email",
      recipient: "owner@test.com",
      delivery_status: "pending",
      days_before_expiration: 30,
      resend_webhook_id: messageId,
      sent_at: new Date().toISOString(),
    });

    // Same UPDATE the webhook route performs for email.delivered.
    execSql(
      "UPDATE alert_logs SET delivery_status = 'delivered', delivered_at = NOW() WHERE resend_webhook_id = '" +
        messageId +
        "' AND delivery_status = 'pending'",
    );

    const { data: row } = await adminClient
      .from("alert_logs")
      .select("delivery_status, delivered_at")
      .eq("resend_webhook_id", messageId)
      .single();
    expect(row!.delivery_status).toBe("delivered");
    expect(row!.delivered_at).not.toBeNull();
  });

  it("webhook-style failed transition records failure_reason", async () => {
    const { data: clinic } = await adminClient
      .from("clinics")
      .insert({ name: `${testClinicName}-failed`, trial_plan: "practice" })
      .select("id")
      .single();
    createdClinicIds.push(clinic!.id);

    const { data: typeRow } = await adminClient
      .from("credential_types")
      .select("id")
      .limit(1)
      .maybeSingle();
    const { data: staff } = await adminClient
      .from("staff_members")
      .insert({ clinic_id: clinic!.id, name: "Harden Test RN", role: "RN" })
      .select("id")
      .single();
    const { data: credential } = await adminClient
      .from("credentials")
      .insert({
        staff_member_id: staff!.id,
        clinic_id: clinic!.id,
        credential_type_id: typeRow!.id,
      })
      .select("id")
      .single();

    const messageId = `msg-failed-${Date.now()}`;
    await adminClient.from("alert_logs").insert({
      clinic_id: clinic!.id,
      credential_id: credential!.id,
      alert_type: "email",
      recipient: "owner@test.com",
      delivery_status: "pending",
      days_before_expiration: 7,
      resend_webhook_id: messageId,
      sent_at: new Date().toISOString(),
    });

    // Same UPDATE the webhook route performs for email.suppressed.
    execSql(
      "UPDATE alert_logs SET delivery_status = 'failed', failure_reason = 'suppressed' WHERE resend_webhook_id = '" +
        messageId +
        "' AND delivery_status = 'pending'",
    );

    const { data: row } = await adminClient
      .from("alert_logs")
      .select("delivery_status, failure_reason")
      .eq("resend_webhook_id", messageId)
      .single();
    expect(row!.delivery_status).toBe("failed");
    expect(row!.failure_reason).toBe("suppressed");
  });
});
