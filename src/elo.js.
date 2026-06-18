// elo.js — standard ELO rating calculation.
// K-factor of 32 is a common default for casual/online chess variants;
// lower it (e.g. 16) later if ratings swing too fast once you have real players.

const K_FACTOR = 32;

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// result: 1 = A wins, 0 = A loses, 0.5 = draw
function newRatings(ratingA, ratingB, resultA) {
  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;
  const resultB = 1 - resultA;
  const newA = Math.round(ratingA + K_FACTOR * (resultA - expectedA));
  const newB = Math.round(ratingB + K_FACTOR * (resultB - expectedB));
  return { newA, newB };
}

module.exports = { newRatings, expectedScore, K_FACTOR };
