import { Router } from 'express';
import { authenticate } from '../../http/middleware/authenticate.js';
import { authRateLimit } from '../../http/middleware/rate-limit.js';
import { validate } from '../../http/middleware/validate.js';
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
} from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.schemas.js';

export const authRouter: Router = Router();

authRouter.post('/register', authRateLimit, validate({ body: registerSchema }), registerHandler);
authRouter.post('/login', authRateLimit, validate({ body: loginSchema }), loginHandler);
authRouter.post('/refresh', authRateLimit, refreshHandler);
authRouter.post('/logout', logoutHandler);
authRouter.get('/me', authenticate, meHandler);
