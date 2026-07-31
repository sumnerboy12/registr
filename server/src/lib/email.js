// Only an email on the configured domain can ever be granted access — SSO
// itself already enforces this (only that tenant's accounts can complete the
// flow), so this is really just a sanity check on data entered by hand.
export function isAllowedEmailDomain(email) {
  const domains = (process.env.ALLOWED_EMAIL_DOMAIN || 'waymanroofing.co.nz')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const at = String(email || '').lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return domains.includes(domain);
}

export function allowedEmailDomainList() {
  return (process.env.ALLOWED_EMAIL_DOMAIN || 'waymanroofing.co.nz')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
    .join(', ');
}
