function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

module.exports = {
  randomChoice,
  rollD20,
  rollDie
};