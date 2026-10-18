// Display formatting shared by the screens and the HUD.

const thousands = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

// ₦1,250 style: naira sign, thousands separators, whole naira.
export function formatNaira(amount: number): string {
  return `₦${thousands.format(Math.max(0, Math.round(amount)))}`;
}
