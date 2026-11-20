/**
 * Creates the MongoDB database (MONGODB_DB, default "vyas_inventory") with all collections and indexes,
 * and fills every EMPTY collection with the application's initial data.
 * Collections that already contain documents are left untouched unless --force is passed.
 *
 *   npm run seed            # seed empty collections only
 *   npm run seed -- --force # replace all collections with the initial data
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import {
  INITIAL_USERS,
  INITIAL_PROJECTS,
  INITIAL_MATERIALS,
  INITIAL_TRANSACTIONS,
  INITIAL_QUERIES,
  INITIAL_CONTRACTORS,
  INITIAL_TRANSFERS,
  INITIAL_VENDORS,
  INITIAL_MARKET_BENCHMARKS,
  INITIAL_PRS,
  INITIAL_QUOTES,
} from '../src/initialData.ts';

const SEED: { name: string; keyField: string; docs: any[] }[] = [
  { name: 'users', keyField: 'id', docs: INITIAL_USERS },
  { name: 'projects', keyField: 'id', docs: INITIAL_PROJECTS },
  { name: 'materials', keyField: 'id', docs: INITIAL_MATERIALS },
  { name: 'inventory_transactions', keyField: 'id', docs: INITIAL_TRANSACTIONS },
  { name: 'site_queries', keyField: 'id', docs: INITIAL_QUERIES },
  { name: 'contractors', keyField: 'id', docs: INITIAL_CONTRACTORS },
  { name: 'internal_transfers', keyField: 'id', docs: INITIAL_TRANSFERS },
  { name: 'vendors', keyField: 'id', docs: INITIAL_VENDORS },
  { name: 'market_benchmarks', keyField: 'materialCode', docs: INITIAL_MARKET_BENCHMARKS },
  { name: 'project_requirements', keyField: 'id', docs: INITIAL_PRS },
  { name: 'vendor_quotations', keyField: 'id', docs: INITIAL_QUOTES },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'vyas_inventory';
  const force = process.argv.includes('--force');
  if (!uri) throw new Error('MONGODB_URI is not set (check your .env file).');

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  try {
    const db = client.db(dbName);
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    console.log(`Seeding database "${dbName}"${force ? ' (force)' : ''}...`);

    for (const { name, keyField, docs } of SEED) {
      if (!existing.has(name)) await db.createCollection(name);
      existing.add(name);
      const col = db.collection(name);
      await col.createIndex({ [keyField]: 1 }, { name: `${keyField}_lookup` });

      const count = await col.countDocuments();
      if (count > 0 && !force) {
        console.log(`  ${name.padEnd(24)} skipped (already has ${count} documents)`);
        continue;
      }
      if (force) await col.deleteMany({});
      // Strip any accidental _id and copy plain data
      const clean = docs.map(({ _id, ...doc }: any) => JSON.parse(JSON.stringify(doc)));
      if (clean.length > 0) await col.insertMany(clean, { ordered: true });
      console.log(`  ${name.padEnd(24)} inserted ${clean.length} documents`);
    }

    // Support collections the server writes to (no initial data, only structure + indexes)
    const SUPPORT: { name: string; indexes: { key: Record<string, 1 | -1>; options: Record<string, any> }[] }[] = [
      {
        name: 'purchase_orders',
        indexes: [
          { key: { poNumber: 1 }, options: { name: 'po_number', unique: true } },
          { key: { prId: 1 }, options: { name: 'one_issued_po_per_pr', unique: true, partialFilterExpression: { status: 'Issued' } } },
        ],
      },
      {
        name: 'quote_attachments',
        indexes: [
          { key: { id: 1 }, options: { name: 'id_lookup', unique: true } },
          { key: { prId: 1, vendorId: 1 }, options: { name: 'pr_vendor' } },
        ],
      },
      {
        name: 'notifications',
        indexes: [
          { key: { id: 1 }, options: { name: 'id_lookup', unique: true } },
          { key: { createdAt: -1 }, options: { name: 'newest_first' } },
        ],
      },
      { name: 'po_documents', indexes: [{ key: { id: 1, poNumber: 1 }, options: { name: 'id_po' } }] },
      { name: 'rate_predictions', indexes: [{ key: { key: 1 }, options: { name: 'key_lookup' } }] },
      { name: 'counters', indexes: [] },
      { name: 'app_meta', indexes: [] },
    ];
    for (const { name, indexes } of SUPPORT) {
      const created = !existing.has(name);
      if (created) await db.createCollection(name);
      for (const { key, options } of indexes) await db.collection(name).createIndex(key, options);
      console.log(`  ${name.padEnd(24)} ${created ? 'created' : 'exists'} (${indexes.length} indexes)`);
    }

    await db
      .collection('app_meta')
      .updateOne({ _id: 'seed' as any }, { $setOnInsert: { seededAt: new Date() } }, { upsert: true });
    console.log('Done.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err?.message || err);
  process.exit(1);
});
