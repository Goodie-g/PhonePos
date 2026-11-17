import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  fullName: z.string().min(1).max(120),
  businessName: z.string().min(2).max(120),
});

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});
