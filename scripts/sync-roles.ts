import { PrismaClient } from '@prisma/client'
import { SYSTEM_ROLES, ALL_PERMISSION_KEYS } from '../src/lib/rbac/permissions'

const db = new PrismaClient()

async function main() {
  console.log('1. Syncing permissions...')
  const existingPerms = await db.permission.findMany()
  const permMap = new Map<string, string>(existingPerms.map((p) => [p.key, p.id]))

  const missingPerms = ALL_PERMISSION_KEYS.filter((k) => !permMap.has(k))
  if (missingPerms.length > 0) {
    await db.permission.createMany({
      data: missingPerms.map((k) => ({
        key: k,
        description: k,
        isSystem: true,
      })),
      skipDuplicates: true,
    })
    const refetched = await db.permission.findMany()
    for (const p of refetched) permMap.set(p.key, p.id)
  }
  console.log(`- Permissions in DB: ${permMap.size}`)

  console.log('2. Syncing roles...')
  const roleMap = new Map<string, string>()
  for (const role of SYSTEM_ROLES) {
    const r = await db.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description, isSystem: true },
      create: { key: role.key, name: role.name, description: role.description, isSystem: true },
      select: { id: true, key: true },
    })
    roleMap.set(role.key, r.id)
  }
  console.log(`- Synced ${roleMap.size} roles.`)

  console.log('3. Batch syncing role permissions...')
  const neededRolePerms: { roleId: string; permissionId: string; scope: string; grantedBy: string }[] = []

  for (const role of SYSTEM_ROLES) {
    const roleId = roleMap.get(role.key)
    if (!roleId) continue

    for (const permKey of role.permissions) {
      const permId = permMap.get(permKey)
      if (!permId) {
        console.warn(`Permission ${permKey} not found in permMap`)
        continue
      }
      neededRolePerms.push({
        roleId,
        permissionId: permId,
        scope: '*',
        grantedBy: 'system_sync',
      })
    }
  }

  // Insert all missing role permissions in one single batch!
  const result = await db.rolePermission.createMany({
    data: neededRolePerms,
    skipDuplicates: true,
  })

  console.log(`- Inserted ${result.count} role permissions (duplicates skipped).`)
  console.log('Role and permission sync complete!')
}

main()
  .catch((e) => {
    console.error('Error syncing roles:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
