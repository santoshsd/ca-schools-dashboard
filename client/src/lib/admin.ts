export const ADMIN_EMAILS = ["santosh.dodamani@gmail.com"];

export function isAdminUser(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email);
}
