export function units(amount) {
  const [integer, fraction = ''] = amount.split('.');
  return BigInt(integer + fraction.padEnd(6, '0'));
}

export function decimal(value) {
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return (value < 0n ? '-' : '') + String(absolute / 1000000n) + (fraction ? '.' + fraction : '');
}
