import { Router } from 'express';
import { ah } from '../../utils/api-error.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { loginSchema, refreshSchema, registerSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

export const authRoutes = Router();

authRoutes.post(
  '/register',
  validate({ body: registerSchema }),
  ah(async (req, res) => {
    const result = await authService.registerBusiness(req.body, req);
    res.status(201).json(result);
  })
);

authRoutes.post(
  '/login',
  validate({ body: loginSchema }),
  ah(async (req, res) => {
    res.json(await authService.login(req.body, req));
  })
);

authRoutes.post(
  '/refresh',
  validate({ body: refreshSchema }),
  ah(async (req, res) => {
    res.json(await authService.refresh(req.body, req));
  })
);

authRoutes.post(
  '/logout',
  validate({ body: refreshSchema }),
  ah(async (req, res) => {
    await authService.logout(req.body);
    res.status(204).end();
  })
);

authRoutes.get(
  '/me',
  authenticate,
  ah(async (req, res) => {
    res.json(await authService.getMe(req.user.id));
  })
);
