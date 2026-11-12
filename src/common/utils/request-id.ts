// request-id.ts — per-request correlation id.
import { nanoid } from 'nanoid';

export const newRequestId = (): string => `req_${nanoid(16)}`;
