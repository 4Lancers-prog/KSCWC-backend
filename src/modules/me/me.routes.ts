// me.routes.ts — the signed-in operator's own view of things an admin acts on.
// GET /me/applications → status of every insurance / membership / training / grievance
// submission linked to this user, so admin decisions flow back to the operator.
import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../../common/errors/app-error';
import * as storage from '../../lib/storage';
import * as authRepo from '../auth/auth.repository';
import { setUserLogo, toSessionUser } from '../auth/auth.service';
import { asyncHandler } from '../../middleware/async-handler';
import { requireAuth } from '../../middleware/require-auth';
import { Grievance, InsuranceRequest, MembershipApplication, TrainingRegistration, User } from '../../db/models';
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
      MembershipApplication.find({ $or: [{ submittedByUserId: userId }, { phoneNormalized: phone }] }).sort({ createdAt: -1 }).limit(TAKE).select('operatorName centreName status createdAt updatedAt').lean(),
      TrainingRegistration.find({ $or: [{ submittedByUserId: userId }, { phoneNormalized: phone }] }).sort({ createdAt: -1 }).limit(TAKE).select('topic mode status createdAt updatedAt').lean(),
      Grievance.find({ $or: [{ submittedByUserId: userId }, { phoneNormalized: phone }] }).sort({ createdAt: -1 }).limit(TAKE).select('ticketCode category status resolutionNote resolvedAt createdAt updatedAt').lean(),
    ]);
    res.json(toPlain({ insurance, membership, training, grievances }));
  }),
);

// ── Centre logo ──
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
router.get('/users/:id/logo', requireAuth, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (req.user!.id !== id && req.user!.role === 'USER') throw AppError.notFound('Not found'); // operators: own logo only
  await connectDb();
  const u = await User.findById(id).select('logoKey logoMime').lean();
  if (!u?.logoKey) throw AppError.notFound('No logo');
  res.set({ 'Content-Type': u.logoMime ?? 'image/png', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.send(await storage.getPrivate(u.logoKey));
}));
router.post('/me/logo', requireAuth, logoUpload.single('logo'), asyncHandler(async (req, res) => {
  await setUserLogo(req.user!.id, req.file as never);
  const u = await authRepo.findById(req.user!.id);
  res.json({ user: toSessionUser(u!) });
}));
router.delete('/me/logo', requireAuth, asyncHandler(async (req, res) => {
  await connectDb();
  await User.updateOne({ _id: req.user!.id }, { $set: { logoKey: null, logoMime: null } });
  const u = await authRepo.findById(req.user!.id);
  res.json({ user: toSessionUser(u!) });
}));

export default router;
