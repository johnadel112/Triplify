import { z } from 'zod';

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/^(?=.*[A-Za-z])(?=.*\d)[\x20-\x7E]+$/, 'Include at least one letter and one number');

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Enter your password').max(72),
});

export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  password,
  consent: z.literal(true, { error: 'You must accept the terms' }),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  phoneNumber: z
    .string()
    .trim()
    .refine((value) => !value || /^\+?[0-9 ()-]{5,30}$/.test(value), 'Enter a valid phone number'),
  preferredCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(72),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type FieldErrors = Record<string, string>;

export function validationErrors(error: z.ZodError): FieldErrors {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message]));
}
