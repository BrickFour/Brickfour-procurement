/**
 * Makes the database's login list match the users defined in src/initialData.ts:
 * adds new users, updates changed ones and removes any login that is no longer listed
 * (other collections are not touched).
 *
 *   node scripts/sync-users.ts            # show what would change
 *   node scripts/sync-users.ts --apply    # apply it
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { INITIAL_USERS } from '../src/initialData.ts';

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'brickfour_inventory';
  const apply = process.argv.includes('--apply');
  if (!uri) throw new Error('MONGODB_URI is not set (check your .env file).');

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  try {
    const users = client.db(dbName).collection('users');
    const current = await users.find({}, { projection: { _id: 0, id: 1, email: 1, role: 1 } }).toArray();
    const wanted = new Set(INITIAL_USERS.map((u) => u.id));
    const toRemove = current.filter((u: any) => !wanted.has(u.id));
    const existingIds = new Set(current.map((u: any) => u.id));
    const toAdd = INITIAL_USERS.filter((u) => !existingIds.has(u.id));

    console.log(`Database "${dbName}": ${current.length} login(s) now, ${INITIAL_USERS.length} listed.`);
    toAdd.forEach((u) => console.log(`  + add     ${u.id.padEnd(16)} ${u.role.padEnd(12)} ${u.email}`));
    INITIAL_USERS.filter((u) => existingIds.has(u.id)).forEach((u) => console.log(`  = update  ${u.id.padEnd(16)} ${u.role.padEnd(12)} ${u.email}`));
    toRemove.forEach((u: any) => console.log(`  - remove  ${String(u.id).padEnd(16)} ${String(u.role).padEnd(12)} ${u.email}`));

    if (!apply) {
      console.log('\nNothing changed. Run again with --apply to make these changes.');
      return;
    }
    const now = new Date();
    for (const u of INITIAL_USERS) {
      await users.updateOne({ id: u.id }, { $set: u, $setOnInsert: { _createdAt: now } }, { upsert: true });
    }
    if (toRemove.length) await users.deleteMany({ id: { $in: toRemove.map((u: any) => u.id) } });
    console.log(`\nDone: ${INITIAL_USERS.length} login(s) in the database.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('User sync failed:', err?.message || err);
  process.exit(1);
});
