// models.ts — MongoDB collections (Mongoose). Mirrors the former relational schema 1:1.
//
// • `_id` is a string UUID (same ids as before), so API ids and validation are unchanged.
// • Money is integer paise stored as a Number (safe up to ~9×10^13 rupees).
// • Every "@unique" became a unique index; relations are stored as id fields (+ virtual populate
//   where the API returns the related object).
import { randomUUID } from 'node:crypto';
import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { ROLES } from '../shared/constants/roles';
import { ACCOUNT_STATUSES } from '../shared/constants/account-status';

const id = { type: String, default: () => randomUUID() };
const ts = { timestamps: true } as const;
const createdOnly = { timestamps: { createdAt: true, updatedAt: false } } as const;
const ref = (model: string) => ({ type: String, ref: model });
const optRef = (model: string) => ({ type: String, ref: model, default: null });
const str = { type: String, default: null };
const date = { type: Date, default: null };
const money = {
  type: Number,
  min: 0,
  validate: { validator: (v: unknown) => v == null || Number.isInteger(v), message: 'paise must be a whole number' },
};

export const CUSTOMER_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const WALLET_TX_TYPES = ['TOPUP', 'CARD_CHARGE', 'REFUND', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'REVERSAL'] as const;
export const APPLICATION_STATUSES = [
  'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED', 'COMPLETED', 'REGISTERED',
  'CONFIRMED', 'ATTENDED', 'CANCELLED', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED',
] as const;

// ── Users ──
const UserSchema = new Schema(
  {
    _id: id,
    fullName: { type: String, required: true, maxlength: 120 },
    phoneNormalized: { type: String, required: true, unique: true, maxlength: 16 },
    // unique only when present (many users have no email)
    emailNormalized: { type: String, default: undefined, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'USER' },
    accountStatus: { type: String, enum: ACCOUNT_STATUSES, default: 'PENDING_APPROVAL' },
    gender: str,
    dob: date,
    centreName: str,
    cscId: str,
    profilePhotoKey: str,
    mfaSecret: { type: String, default: null, select: false },
    mfaEnabled: { type: Boolean, default: false },
    rejectedReason: str,
    approvedById: optRef('User'),
    approvedAt: date,
  },
  ts,
);
UserSchema.index({ emailNormalized: 1 }, { unique: true, partialFilterExpression: { emailNormalized: { $type: 'string' } } });
UserSchema.index({ accountStatus: 1, createdAt: -1 });

const PasswordResetTokenSchema = new Schema(
  {
    _id: id,
    userId: { ...ref('User'), required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: date,
  },
  createdOnly,
);

// ── Services & customers ──
const ServiceSchema = new Schema(
  {
    _id: id,
    code: { type: String, required: true, unique: true, maxlength: 80 },
    nameKn: { type: String, required: true, maxlength: 200 },
    nameEn: str,
    description: str,
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    defaultFeePaise: { ...money, default: null },
  },
  ts,
);

const CustomerSchema = new Schema(
  {
    _id: id,
    ownerUserId: { ...ref('User'), required: true },
    serviceId: { ...ref('Service'), required: true },
    fullName: { type: String, required: true, maxlength: 120 },
    mobileNormalized: { type: String, required: true, maxlength: 16 },
    referenceCode: str,
    feePaise: { ...money, default: null },
    status: { type: String, enum: CUSTOMER_STATUSES, default: 'PENDING' },
    notes: str,
    createdById: str,
    updatedById: str,
    deletedAt: date,
  },
  { ...ts, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);
CustomerSchema.index({ ownerUserId: 1, createdAt: -1 });
CustomerSchema.index({ ownerUserId: 1, serviceId: 1, status: 1 });
CustomerSchema.index({ ownerUserId: 1, mobileNormalized: 1 });
CustomerSchema.virtual('service', { ref: 'Service', localField: 'serviceId', foreignField: '_id', justOne: true });
CustomerSchema.virtual('owner', { ref: 'User', localField: 'ownerUserId', foreignField: '_id', justOne: true });

const CustomerStatusHistorySchema = new Schema(
  {
    _id: id,
    customerId: { ...ref('Customer'), required: true, index: true },
    oldStatus: { type: String, enum: [...CUSTOMER_STATUSES, null], default: null },
    newStatus: { type: String, enum: CUSTOMER_STATUSES, required: true },
    changedById: str,
    reason: str,
  },
  createdOnly,
);

// ── Wallet ──
const WalletAccountSchema = new Schema(
  {
    _id: id,
    userId: { ...ref('User'), required: true, unique: true },
    // min: 0 is enforced by every debit's filter ({ balancePaise: { $gte: amount } }) too.
    balancePaise: { ...money, default: 0 },
    currency: { type: String, default: 'INR' },
    version: { type: Number, default: 0 },
  },
  ts,
);

const WalletTransactionSchema = new Schema(
  {
    _id: id,
    walletAccountId: { ...ref('WalletAccount'), required: true },
    userId: { ...ref('User'), required: true },
    type: { type: String, enum: WALLET_TX_TYPES, required: true },
    direction: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    amountPaise: { ...money, required: true },
    balanceAfterPaise: { ...money, required: true },
    status: { type: String, enum: ['PENDING', 'POSTED', 'FAILED', 'REVERSED'], required: true },
    // Idempotency: the same logical operation can never post twice.
    idempotencyKey: { type: String, required: true, unique: true, maxlength: 160 },
    referenceType: str,
    referenceId: str,
    description: str,
    createdById: str,
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  createdOnly,
);
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });

const ManualTopupRequestSchema = new Schema(
  {
    _id: id,
    userId: { ...ref('User'), required: true },
    amountPaise: { ...money, required: true },
    // One bank payment can only ever be claimed once.
    utrNumber: { type: String, required: true, unique: true, maxlength: 32 },
    note: str,
    screenshotKey: str,
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    reviewedById: str,
    reviewNote: str,
    creditedAmountPaise: { ...money, default: null },
    walletTransactionId: str,
    reviewedAt: date,
  },
  { ...ts, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);
ManualTopupRequestSchema.index({ status: 1, createdAt: -1 });
ManualTopupRequestSchema.index({ userId: 1, createdAt: -1 });
ManualTopupRequestSchema.index({ walletTransactionId: 1 }, { unique: true, partialFilterExpression: { walletTransactionId: { $type: 'string' } } });
ManualTopupRequestSchema.virtual('user', { ref: 'User', localField: 'userId', foreignField: '_id', justOne: true });

// ── FID ──
const FidGenerationSchema = new Schema(
  {
    _id: id,
    userId: { ...ref('User'), required: true },
    customerId: str,
    templateVersion: { type: String, required: true },
    idempotencyKey: { type: String, required: true, unique: true, maxlength: 160 },
    status: { type: String, enum: ['QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED'], default: 'QUEUED' },
    chargePaise: { ...money, default: 500 },
    walletTransactionId: str,
    fileKey: str,
    failureCode: str,
    completedAt: date,
  },
  createdOnly,
);
FidGenerationSchema.index({ userId: 1, createdAt: -1 });
FidGenerationSchema.index({ walletTransactionId: 1 }, { unique: true, partialFilterExpression: { walletTransactionId: { $type: 'string' } } });

// ── Public content ──
const AnnouncementSchema = new Schema(
  {
    _id: id,
    title: { type: String, required: true, maxlength: 240 },
    body: str,
    contentType: { type: String, enum: ['ANNOUNCEMENT', 'VIDEO'], default: 'ANNOUNCEMENT' },
    videoUrl: str,
    thumbnailKey: str,
    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' },
    publishAt: date,
    expiresAt: date,
    sortOrder: { type: Number, default: 0 },
    createdById: str,
  },
  ts,
);
AnnouncementSchema.index({ status: 1, publishAt: -1 });

const CommitteeMemberSchema = new Schema(
  {
    _id: id,
    committeeType: { type: String, enum: ['FOUNDER', 'TRUSTEE', 'STATE', 'DISTRICT'], required: true },
    name: { type: String, required: true, maxlength: 160 },
    roleTitle: str,
    district: str,
    bio: str,
    publicPhone: str,
    photoKey: str,
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdById: str,
    archivedAt: date,
  },
  ts,
);
CommitteeMemberSchema.index({ committeeType: 1, district: 1, sortOrder: 1 });

const GovernmentLinkSchema = new Schema(
  {
    _id: id,
    title: { type: String, required: true, maxlength: 200 },
    description: str,
    imageKey: str,
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdById: str,
  },
  ts,
);

const DocumentSchema = new Schema(
  {
    _id: id,
    title: { type: String, required: true, maxlength: 200 },
    category: str,
    fileKey: { type: String, required: true },
    originalFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    visibility: { type: String, enum: ['PUBLIC', 'PRIVATE'], default: 'PUBLIC' },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    uploadedById: str,
    archivedAt: date,
  },
  createdOnly,
);

// ── Applications ──
const appStatus = (def: string) => ({ type: String, enum: APPLICATION_STATUSES, default: def });

const InsuranceRequestSchema = new Schema(
  {
    _id: id,
    submittedByUserId: str,
    customerName: { type: String, required: true, maxlength: 120 },
    mobileNormalized: { type: String, required: true },
    vehicleNumber: str,
    nomineeName: str,
    nomineeRelation: str,
    policyType: str,
    rcFileKey: str,
    identityFileKey: str,
    notes: str,
    status: appStatus('SUBMITTED'),
    assignedToId: str,
  },
  ts,
);
InsuranceRequestSchema.index({ status: 1, createdAt: -1 });
InsuranceRequestSchema.index({ submittedByUserId: 1, createdAt: -1 });

const MembershipApplicationSchema = new Schema(
  {
    _id: id,
    operatorName: { type: String, required: true, maxlength: 120 },
    centreName: { type: String, required: true, maxlength: 160 },
    district: { type: String, required: true },
    taluk: { type: String, required: true },
    phoneNormalized: { type: String, required: true },
    emailNormalized: str,
    status: appStatus('SUBMITTED'),
    reviewedById: str,
  },
  ts,
);
MembershipApplicationSchema.index({ status: 1, createdAt: -1 });
MembershipApplicationSchema.index({ phoneNormalized: 1 });

const TrainingRegistrationSchema = new Schema(
  {
    _id: id,
    name: { type: String, required: true, maxlength: 120 },
    phoneNormalized: { type: String, required: true },
    topic: { type: String, required: true },
    mode: { type: String, required: true },
    notes: str,
    status: appStatus('REGISTERED'),
  },
  ts,
);
TrainingRegistrationSchema.index({ status: 1, createdAt: -1 });
TrainingRegistrationSchema.index({ phoneNormalized: 1 });

const GrievanceSchema = new Schema(
  {
    _id: id,
    ticketCode: { type: String, required: true, unique: true, maxlength: 40 },
    submittedByUserId: str,
    name: { type: String, required: true, maxlength: 120 },
    phoneNormalized: { type: String, required: true },
    category: { type: String, required: true },
    details: { type: String, required: true },
    status: appStatus('OPEN'),
    assignedToId: str,
    resolutionNote: str,
    resolvedAt: date,
  },
  ts,
);
GrievanceSchema.index({ status: 1, createdAt: -1 });
GrievanceSchema.index({ submittedByUserId: 1 });
GrievanceSchema.index({ phoneNormalized: 1 });

// ── Audit & settings ──
const AuditLogSchema = new Schema(
  {
    _id: id,
    actorUserId: str,
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: str,
    requestId: str,
    beforeRedacted: { type: Schema.Types.Mixed, default: null },
    afterRedacted: { type: Schema.Types.Mixed, default: null },
    ipHash: str,
  },
  { ...createdOnly, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);
AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.virtual('actor', { ref: 'User', localField: 'actorUserId', foreignField: '_id', justOne: true });

const SystemSettingSchema = new Schema(
  {
    _id: { type: String }, // the setting key
    value: { type: Schema.Types.Mixed, required: true },
    updatedById: str,
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

// Re-use compiled models in watch mode / tests.
function model<S extends Schema>(name: string, schema: S, collection: string) {
  return (mongoose.models[name] as mongoose.Model<InferSchemaType<S>>) ?? mongoose.model(name, schema, collection);
}

export const User = model('User', UserSchema, 'users');
export const PasswordResetToken = model('PasswordResetToken', PasswordResetTokenSchema, 'password_reset_tokens');
export const Service = model('Service', ServiceSchema, 'services');
export const Customer = model('Customer', CustomerSchema, 'customers');
export const CustomerStatusHistory = model('CustomerStatusHistory', CustomerStatusHistorySchema, 'customer_status_history');
export const WalletAccount = model('WalletAccount', WalletAccountSchema, 'wallet_accounts');
export const WalletTransaction = model('WalletTransaction', WalletTransactionSchema, 'wallet_transactions');
export const ManualTopupRequest = model('ManualTopupRequest', ManualTopupRequestSchema, 'manual_topup_requests');
export const FidGeneration = model('FidGeneration', FidGenerationSchema, 'fid_generations');
export const Announcement = model('Announcement', AnnouncementSchema, 'announcements');
export const CommitteeMember = model('CommitteeMember', CommitteeMemberSchema, 'committee_members');
export const GovernmentLink = model('GovernmentLink', GovernmentLinkSchema, 'government_links');
export const DocumentModel = model('Document', DocumentSchema, 'documents');
export const InsuranceRequest = model('InsuranceRequest', InsuranceRequestSchema, 'insurance_requests');
export const MembershipApplication = model('MembershipApplication', MembershipApplicationSchema, 'membership_applications');
export const TrainingRegistration = model('TrainingRegistration', TrainingRegistrationSchema, 'training_registrations');
export const Grievance = model('Grievance', GrievanceSchema, 'grievances');
export const AuditLog = model('AuditLog', AuditLogSchema, 'audit_logs');
export const SystemSetting = model('SystemSetting', SystemSettingSchema, 'system_settings');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_MODELS: mongoose.Model<any>[] = [
  User, PasswordResetToken, Service, Customer, CustomerStatusHistory, WalletAccount, WalletTransaction,
  ManualTopupRequest, FidGeneration, Announcement, CommitteeMember, GovernmentLink, DocumentModel,
  InsuranceRequest, MembershipApplication, TrainingRegistration, Grievance, AuditLog, SystemSetting,
];

// ── Plain record types returned by repositories (after toPlain: `_id` → `id`) ──
export interface UserRecord {
  id: string;
  fullName: string;
  phoneNormalized: string;
  emailNormalized: string | null;
  passwordHash: string;
  role: (typeof import('../shared/constants/roles').ROLES)[number];
  accountStatus: (typeof ACCOUNT_STATUSES)[number];
  gender: string | null;
  dob: Date | null;
  centreName: string | null;
  cscId: string | null;
  profilePhotoKey: string | null;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  rejectedReason: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
