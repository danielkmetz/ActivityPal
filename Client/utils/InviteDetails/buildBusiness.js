export const buildInitialBusinessFromInvite = (post = {}) => {
  if (!post) return null;

  const d = post.details || {};

  const placeId =
    post.placeId ||
    d.placeId ||
    d.place?.place_id ||
    d.googlePlace?.place_id ||
    d.business?.place_id ||
    null;

  const name =
    post.businessName ||
    d.businessName ||
    d.place?.name ||
    d.business?.name ||
    '';

  const formatted_address =
    post.location ||
    d.location ||
    d.place?.formatted_address ||
    d.business?.formatted_address ||
    '';

  if (!placeId && !name) return null;

  return {
    place_id: placeId,
    name,
    formatted_address,
  };
};
