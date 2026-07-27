export const ROLE_CREDENTIAL_REQUIRED_MAP: Record<string, string[]> = {
  MD: ['Physician License (MD/DO)', 'DEA Registration', 'CPR/BLS Certification',
    'HIPAA Training', 'OSHA Bloodborne Pathogens Training',
    'Malpractice Insurance', 'Medical Director Agreement'],
  DO: ['Physician License (MD/DO)', 'DEA Registration', 'CPR/BLS Certification',
    'HIPAA Training', 'OSHA Bloodborne Pathogens Training',
    'Malpractice Insurance', 'Medical Director Agreement'],
  NP: ['Nurse Practitioner License', 'DEA Registration', 'CPR/BLS Certification',
    'HIPAA Training', 'OSHA Bloodborne Pathogens Training', 'Malpractice Insurance'],
  PA: ['Physician Assistant License', 'DEA Registration', 'CPR/BLS Certification',
    'HIPAA Training', 'OSHA Bloodborne Pathogens Training', 'Malpractice Insurance'],
  RN: ['Registered Nurse License', 'CPR/BLS Certification', 'HIPAA Training',
    'OSHA Bloodborne Pathogens Training'],
  esthetician: ['Esthetician License', 'CPR/BLS Certification', 'HIPAA Training',
    'OSHA Bloodborne Pathogens Training'],
  MA: ['CPR/BLS Certification', 'HIPAA Training', 'OSHA Bloodborne Pathogens Training'],
  front_desk: ['HIPAA Training', 'OSHA Bloodborne Pathogens Training'],
  other: [],
};

export const ROLE_CREDENTIAL_OPTIONAL_MAP: Record<string, string[]> = {
  RN: ['ACLS Certification'],
  esthetician: ['Chemical Peel Certification'],
};

export const ROLE_CREDENTIAL_MAP = ROLE_CREDENTIAL_REQUIRED_MAP;

export const ROLE_DISPLAY_LABELS: Record<string, string> = {
  MD: 'Physician',
  DO: 'Physician',
  NP: 'Nurse Practitioner',
  PA: 'Physician Assistant',
  RN: 'Registered Nurse',
  esthetician: 'Esthetician',
  MA: 'Medical Assistant',
  front_desk: 'Front Desk',
  other: 'Other',
};

export const ROLE_CARD_ORDER: string[] = [
  'MD', 'DO', 'NP', 'PA', 'RN', 'esthetician', 'MA', 'front_desk', 'other',
];

export const ROLE_VALUES = ['MD', 'DO', 'NP', 'PA', 'RN', 'esthetician', 'MA', 'front_desk', 'other'] as const;

export type RoleValue = (typeof ROLE_VALUES)[number];
