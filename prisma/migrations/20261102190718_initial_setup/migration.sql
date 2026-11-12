-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('TOPUP', 'CARD_CHARGE', 'REFUND', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "WalletTxDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "WalletTxStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FidStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('ANNOUNCEMENT', 'VIDEO');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CommitteeType" AS ENUM ('FOUNDER', 'TRUSTEE', 'STATE', 'DISTRICT');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED', 'COMPLETED', 'REGISTERED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "phone_normalized" VARCHAR(16) NOT NULL,
    "email_normalized" VARCHAR(254),
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "account_status" "AccountStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "gender" VARCHAR(20),
    "dob" DATE,
    "centre_name" VARCHAR(160),
    "csc_id" VARCHAR(80),
    "profile_photo_key" TEXT,
    "mfa_secret" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "rejected_reason" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name_kn" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200),
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "default_fee_paise" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "mobile_normalized" VARCHAR(16) NOT NULL,
    "reference_code" VARCHAR(100),
    "fee_paise" BIGINT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_status_history" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "old_status" "CustomerStatus",
    "new_status" "CustomerStatus" NOT NULL,
    "changed_by" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance_paise" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "direction" "WalletTxDirection" NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "balance_after_paise" BIGINT NOT NULL,
    "status" "WalletTxStatus" NOT NULL,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "reference_type" VARCHAR(40),
    "reference_id" UUID,
    "description" VARCHAR(240),
    "created_by" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_transaction_id" UUID,
    "razorpay_order_id" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "receipt_reference" TEXT NOT NULL,
    "captured_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "payment_order_id" UUID,
    "event_type" TEXT NOT NULL,
    "signature_verified" BOOLEAN NOT NULL,
    "payload_redacted" JSONB,
    "processing_status" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fid_generations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "customer_id" UUID,
    "template_version" TEXT NOT NULL,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "status" "FidStatus" NOT NULL DEFAULT 'QUEUED',
    "charge_paise" BIGINT NOT NULL DEFAULT 500,
    "wallet_transaction_id" UUID,
    "file_key" TEXT,
    "failure_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "fid_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT,
    "content_type" "ContentType" NOT NULL DEFAULT 'ANNOUNCEMENT',
    "video_url" TEXT,
    "thumbnail_key" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publish_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_members" (
    "id" UUID NOT NULL,
    "committee_type" "CommitteeType" NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "role_title" VARCHAR(160),
    "district" VARCHAR(120),
    "bio" TEXT,
    "public_phone" VARCHAR(16),
    "photo_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "committee_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_links" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "image_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "government_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(120),
    "file_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PUBLIC',
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "uploaded_by" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_requests" (
    "id" UUID NOT NULL,
    "submitted_by_user_id" UUID,
    "customer_name" VARCHAR(120) NOT NULL,
    "mobile_normalized" VARCHAR(16) NOT NULL,
    "vehicle_number" VARCHAR(32),
    "nominee_name" VARCHAR(120),
    "nominee_relation" VARCHAR(60),
    "policy_type" VARCHAR(80),
    "rc_file_key" TEXT,
    "identity_file_key" TEXT,
    "notes" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "assigned_to" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "insurance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_applications" (
    "id" UUID NOT NULL,
    "operator_name" VARCHAR(120) NOT NULL,
    "centre_name" VARCHAR(160) NOT NULL,
    "district" VARCHAR(120) NOT NULL,
    "taluk" VARCHAR(120) NOT NULL,
    "phone_normalized" VARCHAR(16) NOT NULL,
    "email_normalized" VARCHAR(254),
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "membership_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_registrations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone_normalized" VARCHAR(16) NOT NULL,
    "topic" VARCHAR(160) NOT NULL,
    "mode" VARCHAR(40) NOT NULL,
    "notes" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'REGISTERED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grievances" (
    "id" UUID NOT NULL,
    "ticket_code" VARCHAR(40) NOT NULL,
    "submitted_by_user_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "phone_normalized" VARCHAR(16) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "details" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to" UUID,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grievances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(80),
    "request_id" VARCHAR(80),
    "before_redacted" JSONB,
    "after_redacted" JSONB,
    "ip_hash" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_normalized_key" ON "users"("phone_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");

-- CreateIndex
CREATE INDEX "users_phone_normalized_idx" ON "users"("phone_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_code_key" ON "services"("code");

-- CreateIndex
CREATE INDEX "customers_owner_user_id_created_at_idx" ON "customers"("owner_user_id", "created_at");

-- CreateIndex
CREATE INDEX "customers_owner_user_id_service_id_status_idx" ON "customers"("owner_user_id", "service_id", "status");

-- CreateIndex
CREATE INDEX "customers_owner_user_id_mobile_normalized_idx" ON "customers"("owner_user_id", "mobile_normalized");

-- CreateIndex
CREATE INDEX "customer_status_history_customer_id_idx" ON "customer_status_history"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_user_id_key" ON "wallet_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_id_created_at_idx" ON "wallet_transactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_wallet_transaction_id_key" ON "payment_orders"("wallet_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_razorpay_order_id_key" ON "payment_orders"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_receipt_reference_key" ON "payment_orders"("receipt_reference");

-- CreateIndex
CREATE INDEX "payment_orders_razorpay_order_id_idx" ON "payment_orders"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "fid_generations_idempotency_key_key" ON "fid_generations"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "fid_generations_wallet_transaction_id_key" ON "fid_generations"("wallet_transaction_id");

-- CreateIndex
CREATE INDEX "fid_generations_user_id_created_at_idx" ON "fid_generations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "announcements_status_publish_at_idx" ON "announcements"("status", "publish_at");

-- CreateIndex
CREATE INDEX "committee_members_committee_type_district_sort_order_idx" ON "committee_members"("committee_type", "district", "sort_order");

-- CreateIndex
CREATE INDEX "insurance_requests_status_created_at_idx" ON "insurance_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "membership_applications_status_created_at_idx" ON "membership_applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "training_registrations_status_created_at_idx" ON "training_registrations"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "grievances_ticket_code_key" ON "grievances"("ticket_code");

-- CreateIndex
CREATE INDEX "grievances_status_created_at_idx" ON "grievances"("status", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_status_history" ADD CONSTRAINT "customer_status_history_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_account_id_fkey" FOREIGN KEY ("wallet_account_id") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_wallet_transaction_id_fkey" FOREIGN KEY ("wallet_transaction_id") REFERENCES "wallet_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fid_generations" ADD CONSTRAINT "fid_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fid_generations" ADD CONSTRAINT "fid_generations_wallet_transaction_id_fkey" FOREIGN KEY ("wallet_transaction_id") REFERENCES "wallet_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
