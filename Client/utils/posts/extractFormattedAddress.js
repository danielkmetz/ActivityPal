export function extractFormattedAddress(obj) {
  if (!obj) return null;

  return (
    obj?.address ||
    obj?.formattedAddress ||
    obj?.formatted_address ||
    obj?.location?.formattedAddress ||
    obj?.location?.formatted_address ||
    obj?.geo?.formattedAddress ||
    obj?.result?.formattedAddress ||
    obj?.result?.formatted_address ||
    obj?.result?.location?.formattedAddress ||
    null
  );
}
