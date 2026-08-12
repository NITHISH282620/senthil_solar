import { format, formatDistanceToNow, parseISO } from "date-fns";

/**
 * Format currency in Indian Rupees
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date string to readable format
 */
export function formatDate(dateString: string | null, pattern = "dd MMM yyyy"): string {
  if (!dateString) return "—";
  try {
    return format(parseISO(dateString), pattern);
  } catch {
    return "—";
  }
}

/**
 * Format a datetime string to readable format
 */
export function formatDateTime(dateString: string | null): string {
  if (!dateString) return "—";
  try {
    return format(parseISO(dateString), "dd MMM yyyy, hh:mm a");
  } catch {
    return "—";
  }
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "—";
  try {
    return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
  } catch {
    return "—";
  }
}

/**
 * Format a phone number for display
 */
export function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  // Simple Indian phone formatting: +91 98765 43210
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}

/**
 * Format compact number (e.g., 12500 → "12.5K")
 */
export function formatCompactNumber(num: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(num);
}
