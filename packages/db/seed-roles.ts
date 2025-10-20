import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedRoles() {
  console.log('🔒 Seeding roles and permissions...');

  const roles = [
    {
      name: 'admin',
      description: 'Full system access',
      permissions: [
        { resource: 'entries', action: 'create' },
        { resource: 'entries', action: 'read' },
        { resource: 'entries', action: 'update' },
        { resource: 'entries', action: 'delete' },
        { resource: 'accounts', action: 'create' },
        { resource: 'accounts', action: 'read' },
        { resource: 'users', action: 'create' },
        { resource: 'users', action: 'read' },
        { resource: 'users', action: 'update' },
        { resource: 'users', action: 'delete' },
      ],
    },
    {
      name: 'accountant',
      description: 'Can manage entries and accounts',
      permissions: [
        { resource: 'entries', action: 'create' },
        { resource: 'entries', action: 'read' },
        { resource: 'accounts', action: 'read' },
        { resource: 'invoices', action: 'create' },
        { resource: 'invoices', action: 'read' },
        { resource: 'reconciliation', action: 'create' },
        { resource: 'reconciliation', action: 'read' },
      ],
    },
    {
      name: 'auditor',
      description: 'Read-only access to all data',
      permissions: [
        { resource: 'entries', action: 'read' },
        { resource: 'accounts', action: 'read' },
        { resource: 'invoices', action: 'read' },
        { resource: 'reports', action: 'read' },
        { resource: 'audit', action: 'read' },
      ],
    },
    {
      name: 'viewer',
      description: 'Limited read-only access',
      permissions: [
        { resource: 'entries', action: 'read' },
        { resource: 'accounts', action: 'read' },
      ],
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }

  console.log(`✅ Created ${roles.length} roles`);
}

seedRoles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
