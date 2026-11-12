// fid.ts — FID generation states.
export const FID_STATUSES = ['QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED'] as const;
export type FidStatus = (typeof FID_STATUSES)[number];
