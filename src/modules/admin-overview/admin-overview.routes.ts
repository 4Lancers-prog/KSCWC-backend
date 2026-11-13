// admin-overview.routes.ts — GET /admin/overview: counts of everything waiting on staff, used by
// the admin dashboard tiles and the nav badges (polled, so new user activity shows up live).
import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import {
  Customer, Grievance, InsuranceRequest, ManualTopupRequest, MembershipApplication, TrainingRegistration, User,
} from '../../db/models';
import { connectDb } from '../../lib/db';

const router = Router();

router.get(
  '/admin/overview',
  requirePermission('users:read'), // every staff role has this; USER has none
  asyncHandler(async (_req, res) => {
    await connectDb();
    const [
      pendingUsers, activeUsers, pendingManualTopups, openGrievances,
      newInsurance, newMembership, newTraining, totalCustomers,
    ] = await Promise.all([
      User.countDocuments({ accountStatus: 'PENDING_APPROVAL' }),
      User.countDocuments({ accountStatus: 'ACTIVE', role: 'USER' }),
      ManualTopupRequest.countDocuments({ status: 'PENDING' }),
      Grievance.countDocuments({ status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
      InsuranceRequest.countDocuments({ status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }),
      MembershipApplication.countDocuments({ status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }),
      TrainingRegistration.countDocuments({ status: 'REGISTERED' }),
      Customer.countDocuments({ deletedAt: null }),
    ]);
    res.json({
      pendingUsers,
      activeUsers,
      pendingManualTopups,
      openGrievances,
      newApplications: newInsurance + newMembership + newTraining,
      newInsurance,
      newMembership,
      newTraining,
      totalCustomers,
    });
  }),
);

export default router;
