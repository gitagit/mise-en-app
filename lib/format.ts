// Pure formatting helpers shared by the inventory and recipes screens.
// Kept free of React so they can be unit-tested directly.

export function formatCost(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export type ExpirationStatus = "expired" | "expiring-soon" | "ok" | "none";

export function getExpirationStatus(expiresOn: string | null): ExpirationStatus {
  if (!expiresOn) return "none";
  const now = new Date();
  const exp = new Date(expiresOn);
  const daysUntil = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) return "expired";
  if (daysUntil <= 7) return "expiring-soon";
  return "ok";
}

export function formatExpiration(expiresOn: string | null): string {
  if (!expiresOn) return "";
  const now = new Date();
  const exp = new Date(expiresOn);
  const daysUntil = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) return `expired ${Math.abs(daysUntil)}d ago`;
  if (daysUntil === 0) return "expires today";
  if (daysUntil === 1) return "expires tomorrow";
  if (daysUntil <= 7) return `expires in ${daysUntil}d`;
  return `exp ${exp.toLocaleDateString()}`;
}

// Scale a quantity string by a ratio (e.g., "2 cups" with ratio 1.5 -> "3 cups")
export function scaleQuantity(quantityText: string | null, ratio: number): string | null {
  if (!quantityText || ratio === 1) return quantityText;

  // Match leading number (including fractions like 1/2, decimals like 1.5)
  const match = quantityText.match(/^(\d+(?:\/\d+)?(?:\.\d+)?)\s*(.*)$/);
  if (!match) return quantityText;

  let num: number;
  const numStr = match[1];
  const rest = match[2];

  // Handle fractions like "1/2"
  if (numStr.includes("/")) {
    const [numer, denom] = numStr.split("/").map(Number);
    num = numer / denom;
  } else {
    num = parseFloat(numStr);
  }

  const scaled = num * ratio;

  // Format nicely: avoid too many decimals
  let formatted: string;
  if (scaled === Math.floor(scaled)) {
    formatted = scaled.toString();
  } else if (scaled * 4 === Math.floor(scaled * 4)) {
    // Can express as quarter fraction
    const whole = Math.floor(scaled);
    const frac = scaled - whole;
    if (frac === 0.25) formatted = whole ? `${whole} 1/4` : "1/4";
    else if (frac === 0.5) formatted = whole ? `${whole} 1/2` : "1/2";
    else if (frac === 0.75) formatted = whole ? `${whole} 3/4` : "3/4";
    else formatted = scaled.toFixed(2).replace(/\.?0+$/, "");
  } else {
    formatted = scaled.toFixed(2).replace(/\.?0+$/, "");
  }

  return rest ? `${formatted} ${rest}` : formatted;
}
