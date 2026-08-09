export const ROLE_CREDENTIAL_REQUIRED_MAP: Record<string, string[]> = {
  MD: ['Physician License (MD/DO)', 'DEA Registration', 'CPR/BLS Certification',
    'HIPAA Training', 'OSHA Bloodborne Pathogens Training',
    'Malpractice Insurance', 'Medical Director Agreement', 'Infection Control Training'],
  DO: ['Physician License (MD/DO)', 'DEA Registration', 'CPR/BLS Certification',
    'HIPAA Training', 'OSHA Bloodborne Pathogens Training',
    'Malpractice Insurance', 'Medical Director Agreement', 'Infection Control Training'],
  NP: ['Nurse Practitioner License', 'DEA Registration', 'CPR/BLS Certification',
    'HIPAA Training', 'OSHA Bloodborne Pathogens Training', 'Malpractice Insurance',
    'Collaborative Practice Agreement'],
  PA: ['Physician Assistant License', 'DEA Registration', 'CPR/BLS Certification',
    'HIPAA Training', 'OSHA Bloodborne Pathogens Training', 'Malpractice Insurance',
    'Supervising Physician Agreement'],
  RN: ['Registered Nurse License', 'CPR/BLS Certification', 'HIPAA Training',
    'OSHA Bloodborne Pathogens Training', 'Infection Control Training'],
  lpn: ['LPN/LVN License', 'CPR/BLS Certification', 'HIPAA Training',
    'OSHA Bloodborne Pathogens Training'],
  esthetician: ['Esthetician License', 'CPR/BLS Certification', 'HIPAA Training',
    'OSHA Bloodborne Pathogens Training'],
  cosmetologist: ['Cosmetology License', 'HIPAA Training',
    'OSHA Bloodborne Pathogens Training'],
  laser_tech: ['Laser Safety Certification', 'CPR/BLS Certification', 'HIPAA Training',
    'OSHA Bloodborne Pathogens Training', 'Infection Control Training'],
  phlebotomist: ['Phlebotomy Certification', 'CPR/BLS Certification', 'HIPAA Training',
    'OSHA Bloodborne Pathogens Training', 'Infection Control Training'],
  massage_therapist: ['Massage Therapy License', 'CPR/BLS Certification', 'HIPAA Training',
    'OSHA Bloodborne Pathogens Training'],
  MA: ['CPR/BLS Certification', 'HIPAA Training', 'OSHA Bloodborne Pathogens Training'],
  practice_manager: ['HIPAA Training', 'OSHA Bloodborne Pathogens Training'],
  front_desk: ['HIPAA Training', 'OSHA Bloodborne Pathogens Training'],
  other: [],
};

export const ROLE_CREDENTIAL_OPTIONAL_MAP: Record<string, string[]> = {
  RN: ['ACLS Certification', 'IV Therapy Certification', 'AED / Emergency Response'],
  lpn: ['Infection Control Training', 'IV Therapy Certification'],
  esthetician: ['Chemical Peel Certification', 'Microneedling Certification'],
  cosmetologist: ['CPR/BLS Certification', 'Chemical Peel Certification'],
  massage_therapist: ['Infection Control Training'],
  NP: ['Botox / Neurotoxin Certification', 'Dermal Filler Certification', 'Microneedling Certification'],
  PA: ['Botox / Neurotoxin Certification', 'Dermal Filler Certification', 'Microneedling Certification'],
  MA: ['AED / Emergency Response'],
};

export const ROLE_CREDENTIAL_MAP = ROLE_CREDENTIAL_REQUIRED_MAP;

export const ROLE_DISPLAY_LABELS: Record<string, string> = {
  MD: 'Physician',
  DO: 'Physician',
  NP: 'Nurse Practitioner',
  PA: 'Physician Assistant',
  RN: 'Registered Nurse',
  lpn: 'LPN / LVN',
  esthetician: 'Esthetician',
  cosmetologist: 'Cosmetologist',
  laser_tech: 'Laser Technician',
  phlebotomist: 'Phlebotomist',
  massage_therapist: 'Massage Therapist',
  MA: 'Medical Assistant',
  practice_manager: 'Practice Manager',
  front_desk: 'Front Desk',
  other: 'Other',
};

export const ROLE_CARD_ORDER: string[] = [
  'MD', 'DO', 'NP', 'PA', 'RN', 'lpn', 'esthetician', 'cosmetologist',
  'laser_tech', 'phlebotomist', 'massage_therapist', 'MA', 'practice_manager',
  'front_desk', 'other',
];

export const ROLE_VALUES = [
  'MD', 'DO', 'NP', 'PA', 'RN', 'lpn', 'esthetician', 'cosmetologist',
  'laser_tech', 'phlebotomist', 'massage_therapist', 'MA', 'practice_manager',
  'front_desk', 'other',
] as const;

/** Wizard Step-2 role card groups (order preserved). MD/DO render as the
 * merged "Physician" card with an explicit sub-choice (PHYSICIAN_GROUP in
 * staff-wizard.tsx); `other` is never offered in the add flow (zero-item
 * template → false "Work Ready"). Every other built-in belongs to exactly
 * one group — the coverage test enforces it. */
export const ROLE_GROUPS: { key: string; label: string; roles: string[] }[] = [
  {
    key: "clinical",
    label: "Clinical",
    roles: ["NP", "PA", "RN", "lpn", "MA", "phlebotomist"],
  },
  {
    key: "aesthetic",
    label: "Aesthetic",
    roles: ["esthetician", "cosmetologist", "laser_tech", "massage_therapist"],
  },
  {
    key: "operations",
    label: "Operations",
    roles: ["front_desk", "practice_manager"],
  },
];
