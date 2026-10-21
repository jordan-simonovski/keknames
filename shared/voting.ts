/** A guess requires more than half of the team's eligible operatives. */
export function voteMajority(votes: Record<string, string[]>, eligibleIds: readonly string[]): number | null {
  const eligible = new Set(eligibleIds);
  for (const [index, voters] of Object.entries(votes)) {
    const count = new Set(voters.filter((id) => eligible.has(id))).size;
    if (count > eligible.size / 2) return Number(index);
  }
  return null;
}
