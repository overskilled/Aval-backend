import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@aval.local')
    .trim()
    .toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'ChangeMeNow!42';

  if (password.length < 8) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      role: 'admin',
      emailVerified: true,
      kycStatus: 'approved',
      passwordHash,
    },
    create: {
      email,
      passwordHash,
      firstName: 'Aval',
      lastName: 'Admin',
      fullName: 'Aval Admin',
      role: 'admin',
      emailVerified: true,
      kycStatus: 'approved',
      country: 'Cameroun',
    },
  });

  console.log(
    `[seed] admin upserted — id=${admin.id}  email=${admin.email}  role=${admin.role}`,
  );
  console.log(`[seed] sign in with: ${email} / ${password}`);
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
