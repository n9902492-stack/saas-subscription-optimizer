import { Router } from 'express';
import { financeAccess } from '../workspaces/finance-access.js';
import { merchantKey } from '../transactions/merchant-key.js';

export function vendorRoutes(database, requireSession) {
  const router = Router({ mergeParams: true });
  const imports = database.collection('statementImports');
  const aliases = database.collection('merchantAliases');

  router.use(requireSession, financeAccess(database));

  router.get('/', async (request, response) => {
    const workspaceId = request.workspaceId;
    const [matches, rows] = await Promise.all([
      aliases.find({ workspaceId }, { projection: { merchantKey: 1, vendor: 1 } }).sort({ _id: 1 }).toArray(),
      imports.aggregate([
        { $match: { workspaceId } },
        { $unwind: '$transactions' },
        { $group: {
          _id: { merchant: '$transactions.merchant', currency: '$transactions.currency' },
          amount: { $sum: '$transactions.amount' },
          count: { $sum: 1 },
        } },
        { $sort: { '_id.merchant': 1, '_id.currency': 1 } },
      ]).toArray(),
    ]);

    const names = new Map(matches.map(({ merchantKey: key, vendor }) => [key, vendor]));
    const vendors = new Map();
    const totals = new Map();
    const unmatched = new Map();
    for (const { _id: { merchant, currency }, amount, count } of rows) {
      const units = toUnits(amount.toString());
      addTotal(totals, currency, units, count);

      const vendorName = names.get(merchantKey(merchant));
      if (!vendorName) {
        addTotal(unmatched, currency, units, count);
        continue;
      }
      const key = merchantKey(vendorName);
      if (!vendors.has(key)) {
        vendors.set(key, { name: vendorName, merchants: new Set(), totals: new Map() });
      }
      const vendor = vendors.get(key);
      vendor.merchants.add(merchant);
      addTotal(vendor.totals, currency, units, count);
    }

    response.json({
      totals: serializeTotals(totals),
      unmatched: serializeTotals(unmatched),
      vendors: [...vendors.values()].sort((a, b) => a.name.localeCompare(b.name)).map((vendor) => ({
        name: vendor.name, merchantCount: vendor.merchants.size, totals: serializeTotals(vendor.totals),
      })),
    });
  });

  return router;
}

// Statement import accepts up to four decimal places. Expand Decimal128
// exponent notation exactly instead of using floating-point arithmetic.
function toUnits(amount) {
  const [, sign, whole, fraction = '', exponent = '0'] = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(amount);
  const digits = BigInt(whole + fraction);
  const scale = Number(exponent) + 4 - fraction.length;
  const units = scale >= 0 ? digits * 10n ** BigInt(scale) : digits / 10n ** BigInt(-scale);
  return sign ? -units : units;
}

function addTotal(map, currency, units, count) {
  const total = map.get(currency) ?? { units: 0n, count: 0 };
  map.set(currency, { units: total.units + units, count: total.count + count });
}

function serializeTotals(map) {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, { units, count }]) => {
    const digits = (units < 0n ? -units : units).toString().padStart(5, '0');
    const fraction = digits.slice(-4).replace(/0+$/, '');
    return {
      currency,
      amount: (units < 0n ? '-' : '') + digits.slice(0, -4) + (fraction ? '.' + fraction : ''),
      count,
    };
  });
}
