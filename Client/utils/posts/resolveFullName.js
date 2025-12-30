const nameFrom = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();

export const resolveFullName = (pp) =>
  pp?.fullName ||
  nameFrom(pp?.sender) ||
  (pp?.originalOwner?.__typename === 'User' ? nameFrom(pp?.originalOwner) : '') ||
  nameFrom(pp?.user) ||
  nameFrom(pp?.owner) ||
  'Someone';
