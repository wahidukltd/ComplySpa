-- Credential Types Audit: add 11 real med spa credential types

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Botox / Neurotoxin Certification', 'training', 365, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Dermal Filler Certification', 'training', 365, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Microneedling Certification', 'training', 365, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Phlebotomy Certification', 'training', 730, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('IV Therapy Certification', 'training', 365, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('AED / Emergency Response', 'training', 365, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Cosmetology License', 'license', 365, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('General Liability Insurance', 'insurance', 365, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Workers Compensation Insurance', 'insurance', 365, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Collaborative Practice Agreement', 'agreement', 365, false);

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Supervising Physician Agreement', 'agreement', 365, false);