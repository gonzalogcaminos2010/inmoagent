// All operations are supplied by the sandbox runner; never deletes unrelated resources.
export function cleanupSandbox({
  owned,
  tags,
  down,
  removeVolume,
  removeTag,
  removeTemp,
  report,
}) {
  try {
    if (owned) {
      try {
        down();
        removeVolume();
      } catch (error) {
        report(error);
      }
    }
    for (const tag of tags) {
      try {
        removeTag(tag);
      } catch (error) {
        report(error);
      }
    }
  } finally {
    removeTemp();
  }
}
