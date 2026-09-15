/**
 * How much room the board gives to what you have starred.
 *
 * These two numbers are the mechanism by which overload becomes visible without
 * the app ever saying so (PRD §5.7, UC-3060): the more you star, the less room
 * each thing gets, until the task lists fall out of the cards altogether.
 *
 * They are guesses, chosen to make the mockups read correctly, and they are the
 * single most likely thing to need tuning after real use. Tests pin the boundary
 * BEHAVIOUR, not these values — if changing a number here breaks a test, the test
 * is wrong.
 */
export const layout = {
  /** Above this many starred items, cards stop showing their tasks. */
  detailBudget: 6,
  /** Task rows shown inside one card before the rest fold into a line. */
  rowsPerCard: 3,
} as const
