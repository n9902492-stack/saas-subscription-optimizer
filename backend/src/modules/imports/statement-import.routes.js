import { Router } from 'express';
import { Decimal128, ObjectId } from 'mongodb';
import { financeAccess } from '../workspaces/finance-access.js';
import { readStatement } from './statement-import.service.js';

export async function statementImportRoutes(database, requireSession) {
  const router = Router({ mergeParams: true });
  const sources = database.collection('paymentSources');
  const imports = database.collection('statementImports');
  await imports.createIndex({ workspaceId: 1, paymentSourceId: 1, hash: 1 }, { unique: true });
  router.use(requireSession, financeAccess(database));

  router.post('/columns', (request, response) => {
    const statement = parseInput(request, response);
    if (statement) response.json(statement);
  });

  router.post('/preview', async (request, response) => {
    const paymentSourceId = await findSource(request, response);
    if (!paymentSourceId) return;
    const statement = parseInput(request, response, true);
    if (!statement) return;
    const { transactions, errors, hash } = statement;
    response.json({
      rows: transactions.slice(0, 25), validCount: transactions.length,
      invalidCount: errors.length, errors: errors.slice(0, 25), hash,
    });
  });

  router.post('/commit', async (request, response) => {
    const paymentSourceId = await findSource(request, response);
    if (!paymentSourceId) return;
    const statement = parseInput(request, response, true);
    if (!statement) return;
    const { transactions, errors, hash } = statement;
    if (errors.length || request.body.previewHash !== hash) {
      return response.status(400).json({ message: 'Preview the current file and correct all invalid rows before saving.' });
    }
    const key = { workspaceId: request.workspaceId, paymentSourceId, hash };
    try {
      const result = await imports.insertOne({
        ...key, createdBy: request.session.userId, createdAt: new Date(),
        transactions: transactions.map(({ amount, ...row }) => ({ ...row, amount: Decimal128.fromString(amount) })),
      });
      response.status(201).json({ id: result.insertedId, count: transactions.length, existing: false });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await imports.findOne(key, { projection: { _id: 1 } });
      if (!existing) throw error;
      response.json({ id: existing._id, count: transactions.length, existing: true });
    }
  });

  async function findSource(request, response) {
    const id = request.body?.paymentSourceId;
    if (typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)) {
      const source = await sources.findOne(
        { _id: new ObjectId(id), workspaceId: request.workspaceId }, { projection: { _id: 1 } },
      );
      if (source) return source._id;
    }
    response.status(404).json({ message: 'Select a payment source in this workspace.' });
  }

  return router;
}

function parseInput(request, response, requireMapping = false) {
  const { csv, mapping } = request.body ?? {};
  try {
    if (requireMapping && (!mapping || typeof mapping !== 'object' || Array.isArray(mapping))) {
      throw new Error('Map the statement columns first.');
    }
    return readStatement(csv, requireMapping ? mapping : undefined);
  } catch (error) {
    response.status(400).json({ message: error.message });
  }
}
