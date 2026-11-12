// committee.ts — committee member types.
export const COMMITTEE_TYPES = ['FOUNDER', 'TRUSTEE', 'STATE', 'DISTRICT'] as const;
export type CommitteeType = (typeof COMMITTEE_TYPES)[number];
