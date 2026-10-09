import { z } from 'zod';

export const imageSchema = z.object({
  url: z.string().min(1),
  key: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().positive().max(5 * 1024 * 1024),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});
export type ImageInfo = z.infer<typeof imageSchema>;

const email = z.string().trim().toLowerCase().email('Enter a valid email.');
const password = z.string().min(8, 'Password must be at least 8 characters.').max(200);
const name = z.string().trim().min(1, 'Name is required.').max(100);

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

export const registerSchema = z.object({ name, email, password, image: imageSchema.nullish() });

export const profileSchema = z.object({
  name: name.optional(),
  email: email.optional(),
  image: imageSchema.nullish(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: password,
});

const count = z.coerce.number().int().min(0).max(1_000_000);

export const adminCreateUserSchema = z.object({
  role: z.enum(['CLIENT', 'CUSTOMER']),
  name,
  email,
  password,
  image: imageSchema.nullish(),
  s_counts: count.optional(),
  b_counts: count.optional(),
  cartLimit: z.coerce.number().int().min(0).max(1000).optional(),
});

export const adminUpdateUserSchema = z.object({
  name: name.optional(),
  email: email.optional(),
  password: password.optional(),
  image: imageSchema.nullish(),
  s_counts: count.optional(),
  b_counts: count.optional(),
  cartLimit: z.coerce.number().int().min(0).max(1000).optional(),
});

export const adminUsersQuery = z.object({
  role: z.enum(['CLIENT', 'CUSTOMER']).optional(),
  q: z.string().trim().max(100).optional(),
});

export const adminPostUpdateSchema = z.object({
  // Display name; an empty string clears it (the title is shown instead).
  name: z
    .string()
    .trim()
    .max(120, 'Name must be 120 characters or less.')
    .transform((v) => (v === '' ? null : v))
    .nullish(),
  image: imageSchema.nullish(),
  connects: z.coerce.number().int().min(0).max(1_000_000).optional(),
  price: z.coerce
    .number()
    .min(0)
    .max(10_000_000)
    .transform((v) => Math.round(v * 100) / 100)
    .optional(),
});

export const visibilitySchema = z.object({ visible: z.boolean() });

export const acceptSchema =z.object({ note: z.string().trim().max(500).optional() });

export const postStatusQuery = z.object({
  status: z.enum(['REQUESTED', 'PUBLISHED', 'PROGRESSING', 'COMPLETED']).optional(),
});

export const clientPostsSchema = z.object({
  titles: z
    .array(z.string())
    .transform((arr) => arr.map((t) => t.trim()).filter((t) => t.length > 0))
    .pipe(z.array(z.string().max(300, 'Each line must be 300 characters or less.')).min(1, 'Add at least one line.').max(50)),
});

export const checkUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .url('Enter a valid URL.')
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), 'URL must start with http:// or https://'),
});

export const messageSchema = z.object({ body: z.string().trim().min(1, 'Message is empty.').max(4000) });

export const startConversationSchema = z.object({ userId: z.string().min(1) });

export const cursorQuery = z.object({ cursor: z.string().optional() });

export const adminConversationsQuery = z.object({
  scope: z.enum(['all', 'mine']).default('all'),
  type: z.enum(['DEAL', 'ADMIN_CLIENT', 'ADMIN_CUSTOMER']).optional(),
  userId: z.string().optional(),
  postId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
});
