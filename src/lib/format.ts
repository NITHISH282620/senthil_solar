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
 * A duration in hours as "2hr 30min" rather than the decimal "2.5" nobody on
 * site reads at a glance.
 */
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours <= 0) {
    return "—";
  }
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}hr`;
  return `${h}hr ${m}min`;
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

/**
 * Today's date in Asia/Kolkata, as YYYY-MM-DD.
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC date, and IST runs 5h30
 * ahead of it. Every date the database derives itself uses
 * `(now() AT TIME ZONE 'Asia/Kolkata')::date`, so between midnight and 05:30
 * IST the two disagreed: the dashboard's "cash in today" and the cash page's
 * own total were computed for different days, and an early-morning site
 * check-in — normal on solar sites, where crews start before the heat — was
 * filed against the previous day.
 */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
