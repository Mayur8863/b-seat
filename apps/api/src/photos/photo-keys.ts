/** Keys are derived from ids and never stored; a key's bytes never change (ADR-0011 section 1). */
export const photoKeys = (spaceId: string, photoId: string) => ({
  card: `spaces/${spaceId}/${photoId}/card.webp`,
  display: `spaces/${spaceId}/${photoId}/display.webp`,
});
