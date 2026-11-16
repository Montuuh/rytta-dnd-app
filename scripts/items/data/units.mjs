// Prices are stored in copper pieces: 1 GP = 100 CP, 1 SP = 10 CP.
export const gp = (amount) => Math.round(amount * 100)
export const sp = (amount) => Math.round(amount * 10)
export const cp = (amount) => amount
