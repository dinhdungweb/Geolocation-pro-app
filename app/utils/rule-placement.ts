export function placeRuleIds(
  orderedIds: string[],
  movingId: string,
  placement: string,
) {
  if (!orderedIds.includes(movingId)) return orderedIds;

  const remainingIds = orderedIds.filter((id) => id !== movingId);
  let insertIndex = 0;
  if (placement.startsWith("after:")) {
    const referenceId = placement.slice("after:".length);
    const referenceIndex = remainingIds.indexOf(referenceId);
    insertIndex = referenceIndex >= 0 ? referenceIndex + 1 : remainingIds.length;
  } else if (placement === "last") {
    insertIndex = remainingIds.length;
  }

  remainingIds.splice(insertIndex, 0, movingId);
  return remainingIds;
}
