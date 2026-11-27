import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma, withTransaction } from '../../db.js';
import { config } from '../../config.js';
import { ApiError, ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveBusiness, requirePermission } from '../../middleware/tenant.js';
import { writeAudit } from '../../utils/audit.js';
import { inviteSchema, updateMemberSchema } from './users.schemas.js';

export const usersRoutes = Router();
usersRoutes.use(authenticate, resolveBusiness);

// List members of the current business.
usersRoutes.get(
  '/',
  ah(async (req, res) => {
    const members = await prisma.membership.findMany({
      where: { businessId: req.businessId },
      include: { user: { select: { id: true, email: true, fullName: true, isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      data: members.map((m) => ({ membershipId: m.id, role: m.role, ...m.user })),
    });
  })
);

// Invite = create a login for a teammate (or attach an existing Stoku user).
usersRoutes.post(
  '/invite',
  requirePermission('users:manage'),
  validate({ body: inviteSchema }),
  ah(async (req, res) => {
    const email = req.body.email.toLowerCase();
    const result = await withTransaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            fullName: req.body.fullName,
            passwordHash: await bcrypt.hash(req.body.password, config.bcryptRounds),
          },
        });
      }
      const existing = await tx.membership.findUnique({
        where: { userId_businessId: { userId: user.id, businessId: req.businessId } },
      });
      if (existing) throw ApiError.conflict('User is already a member of this business');
      const membership = await tx.membership.create({
        data: { userId: user.id, businessId: req.businessId, role: req.body.role },
      });
      await writeAudit(tx, {
        businessId: req.businessId,
        userId: req.user.id,
        action: 'user.invite',
        entityType: 'Membership',
        entityId: membership.id,
        after: { userId: user.id, email, role: req.body.role },
      });
      return { membership, user };
    });
    res.status(201).json({
      data: {
        membershipId: result.membership.id,
        role: result.membership.role,
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
      },
    });
  })
);

// Change a member's role or active flag. Owners cannot be modified.
usersRoutes.patch(
  '/:membershipId',
  requirePermission('users:manage'),
  validate({ body: updateMemberSchema }),
  ah(async (req, res) => {
    const membership = await prisma.membership.findFirst({
      where: { id: req.params.membershipId, businessId: req.businessId },
    });
    if (!membership) throw ApiError.notFound('Membership not found');
    if (membership.role === 'OWNER') throw ApiError.forbidden('The owner cannot be modified');

    const updated = await withTransaction(async (tx) => {
      const m = await tx.membership.update({
        where: { id: membership.id },
        data: { role: req.body.role ?? membership.role },
      });
      if (req.body.isActive !== undefined) {
        await tx.user.update({
          where: { id: membership.userId },
          data: { isActive: req.body.isActive },
        });
      }
      await writeAudit(tx, {
        businessId: req.businessId,
        userId: req.user.id,
        action: 'user.update',
        entityType: 'Membership',
        entityId: m.id,
        before: { role: membership.role },
        after: { role: m.role, isActive: req.body.isActive },
      });
      return m;
    });
    res.json({ data: updated });
  })
);
