// me.routes.ts — the signed-in operator's own view of things an admin acts on.
// GET /me/applications → status of every insurance / membership / training / grievance
// submission linked to this user, so admin decisions flow back to the operator.
import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { requireAuth } from '../../middleware/require-auth';
import { Grievance, InsuranceRequest, MembershipApplication, TrainingRegistration } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';

const router = Router();
const TAKE = 50;

router.get(
  '/me/applications',
  requireAuth,
  asyncHandler(async (req, res) => {
    await connectDb();
    const userId = req.user!.id;
    const phone = req.user!.phone;
    // Insurance + grievances are linked by user id when submitted while signed in. Membership and
    // training forms have no user column, so they are matched on the operator's own mobile number.
    const [insurance, membership, training, grievances] = await Promise.all([
      InsuranceRequest.find({ submittedByUserId: userId }).sort({ createdAt: -1 }).limit(TAKE).select('customerName policyType status createdAt updatedAt').lean(),
      MembershipApplication.find({ phoneNormalized: phone }).sort({ createdAt: -1 }).limit(TAKE).select('operatorName centreName status createdAt updatedAt').lean(),
      TrainingRegistration.find({ phoneNormalized: phone }).sort({ createdAt: -1 }).limit(TAKE).select('topic mode status createdAt updatedAt').lean(),
      Grievance.find({ $or: [{ submittedByUserId: userId }, { phoneNormalized: phone }] }).sort({ createdAt: -1 }).limit(TAKE).select('ticketCode category status resolutionNote resolvedAt createdAt updatedAt').lean(),
    ]);
    res.json(toPlain({ insurance, membership, training, grievances }));
  }),
);

export default router;
