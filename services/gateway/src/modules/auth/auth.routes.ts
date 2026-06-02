import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../../http/middleware/authenticate.js';
import { authRateLimit } from '../../http/middleware/rate-limit.js';
import { validate } from '../../http/middleware/validate.js';
import {
  loginHandler,
  logoutAllHandler,
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
// Optional auth: logout works with or without a valid access token, and
// denylists it when present.
authRouter.post('/logout', optionalAuthenticate, logoutHandler);
authRouter.post('/logout-all', authenticate, logoutAllHandler);
authRouter.get('/me', authenticate, meHandler);
