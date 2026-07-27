-- Credential Gaps: add is_required to onboarding_items, seed optional types

ALTER TABLE onboarding_items ADD COLUMN is_required boolean NOT NULL DEFAULT true;

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('ACLS Certification', 'training', 730, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Chemical Peel Certification', 'training', 365, false);
