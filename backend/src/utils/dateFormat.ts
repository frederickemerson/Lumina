/**
 * Date formatting utilities for MySQL compatibility
 */

/**
 * Convert Date or ISO string to MySQL datetime format (YYYY-MM-DD HH:MM:SS)
 */
export function toMySQLDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Format: YYYY-MM-DD HH:MM:SS
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Get current date/time in MySQL format
 */
export function getMySQLDateTime(): string {
  return toMySQLDateTime(new Date());
}

