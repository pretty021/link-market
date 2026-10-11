import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before seeding.');
  if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters.');

  const admin = await prisma.admin.upsert({
    where: { email },
    create: { email, passwordHash: await bcrypt.hash(password, 12), name: 'Admin' },
    update: {},
  });
  console.log(`Admin: ${admin.email}`);

  if (process.env.NODE_ENV === 'production' && process.env.SEED_SAMPLE_DATA !== 'true') return;

  // Development sample data. Every sample account uses the password "password123".
  const hash = await bcrypt.hash('password123', 10);
  const user = (role: 'CLIENT' | 'CUSTOMER', name: string, mail: string, extra: object = {}) =>
    prisma.user.upsert({
      where: { email: mail },
      create: { role, name, email: mail, passwordHash: hash, createdById: role === 'CLIENT' ? admin.id : null, ...extra },
      update: {},
    });

  const pty96 = await user('CLIENT', 'pty96', 'client@example.com', { s_counts: 12 });
  const nova = await user('CLIENT', 'Nova Seller', 'client2@example.com', { s_counts: 3 });
  await user('CUSTOMER', 'Alex Buyer', 'customer@example.com', { b_counts: 5, cartLimit: 2 });
  await user('CUSTOMER', 'Sam Buyer', 'customer2@example.com', { b_counts: 1 });
  await user('CUSTOMER', 'Riley Buyer', 'customer3@example.com');

  if ((await prisma.post.count()) > 0) return;

  const published = [
    { title: 'Account #1042 - 8 months old, transfer via platform method', price: 120, connects: 40 },
    { title: 'Account #1043 - 1 year old, full access', price: 95, connects: 25 },
    { title: 'Account #1044 - 5 months old, verified', price: 150.5, connects: 60 },
  ];
  for (const p of published) {
    await prisma.post.create({
      data: {
        clientId: pty96.id,
        title: p.title,
        price: p.price,
        connects: p.connects,
        status: 'PUBLISHED',
        approval: true,
        approvalRecord: { create: { adminId: admin.id } },
      },
    });
  }
  await prisma.post.createMany({
    data: [
      { clientId: pty96.id, title: 'Account #1045 - 2 years old' },
      { clientId: nova.id, title: 'Account #2001 - fresh, 3 months' },
    ],
  });
  console.log('Sample clients, customers and posts created (password: password123).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
