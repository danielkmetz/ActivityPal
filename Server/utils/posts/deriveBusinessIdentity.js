function deriveBusinessIdentity(p = {}) {
  const placeId =
    p.placeId ??
    p.details?.placeId ??
    p.details?.place?.placeId ??
    p.refs?.business?.placeId ??
    p.location?.placeId ??
    p.shared?.snapshot?.placeId ??
    p.shared?.snapshot?.refs?.business?.placeId ??
    null;

  const businessName =
    p.businessName ??
    p.details?.businessName ??
    p.details?.placeName ??
    p.details?.place?.name ??
    p.refs?.business?.name ??
    p.location?.name ??
    p.shared?.snapshot?.businessName ??
    p.shared?.snapshot?.refs?.business?.name ??
    null;

  const businessLogoKey =
    p.businessLogoKey ??
    p.details?.businessLogoKey ??
    p.refs?.business?.logoKey ??
    p.location?.logoKey ??
    p.shared?.snapshot?.businessLogoKey ??
    p.shared?.snapshot?.refs?.business?.logoKey ??
    null;

  const businessLogoUrl =
    p.businessLogoUrl ??
    p.details?.businessLogoUrl ??
    p.refs?.business?.logoUrl ??
    p.location?.logoUrl ??
    p.shared?.snapshot?.businessLogoUrl ??
    p.shared?.snapshot?.refs?.business?.logoUrl ??
    null;

  return { placeId, businessName, businessLogoKey, businessLogoUrl };
}

module.exports = { deriveBusinessIdentity }