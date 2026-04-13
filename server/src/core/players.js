const fs = require("fs");
const path = require("path");

const playersFolder = path.join(__dirname, "..", "..", "players");

if (!fs.existsSync(playersFolder)) {
  fs.mkdirSync(playersFolder);
}

function getPlayerFilePath(playerName) {
  const safeName = playerName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(playersFolder, `${safeName}.json`);
}

function createNewPlayer(name) {
  return {
    name,
    location: "village",
    hp: 100,
    maxHp: 100,
    inventory: [],
    stats: {
      strength: 2,
      dexterity: 3,
      defense: 1,
      presence: 2
    },
    reputation: {
      chaos: 0,
      honor: 0,
      intimidation: 0,
      title: "Unknown"
    },
    flags: {
      knownTroublemaker: false,
      helpedTownsfolk: false,
      bartenderBarred: false,
      blockedFromStreet: false,
      wantedByGuards: false
    }
  };
}

function ensurePlayerShape(player) {
  if (!player.inventory) {
    player.inventory = [];
  }

  if (!player.stats) {
    player.stats = {
      strength: 2,
      dexterity: 3,
      defense: 1,
      presence: 2
    };
  }

  if (player.stats.presence === undefined) player.stats.presence = 2;

  if (!player.reputation) {
    player.reputation = {
      chaos: 0,
      honor: 0,
      intimidation: 0,
      title: "Unknown"
    };
  }

  if (!player.flags) {
    player.flags = {
      knownTroublemaker: false,
      helpedTownsfolk: false,
      bartenderBarred: false,
      blockedFromStreet: false,
      wantedByGuards: false
    };
  }

  if (player.flags.knownTroublemaker === undefined) player.flags.knownTroublemaker = false;
  if (player.flags.helpedTownsfolk === undefined) player.flags.helpedTownsfolk = false;
  if (player.flags.bartenderBarred === undefined) player.flags.bartenderBarred = false;
  if (player.flags.blockedFromStreet === undefined) player.flags.blockedFromStreet = false;
  if (player.flags.wantedByGuards === undefined) player.flags.wantedByGuards = false;

  return player;
}

function loadPlayer(playerName) {
  const playerFilePath = getPlayerFilePath(playerName);

  if (fs.existsSync(playerFilePath)) {
    const player = JSON.parse(fs.readFileSync(playerFilePath, "utf8"));
    return ensurePlayerShape(player);
  }

  const newPlayer = createNewPlayer(playerName);
  savePlayer(newPlayer);
  return newPlayer;
}

function savePlayer(player) {
  const playerFilePath = getPlayerFilePath(player.name);
  fs.writeFileSync(playerFilePath, JSON.stringify(ensurePlayerShape(player), null, 2));
}

function loadAllPlayers() {
  if (!fs.existsSync(playersFolder)) {
    return [];
  }

  const files = fs.readdirSync(playersFolder).filter(file => file.endsWith(".json"));

  return files.map(file => {
    const filePath = path.join(playersFolder, file);
    return ensurePlayerShape(JSON.parse(fs.readFileSync(filePath, "utf8")));
  });
}

function getOtherPlayersInSameLocation(currentPlayer) {
  const allPlayers = loadAllPlayers();

  return allPlayers.filter(player =>
    player.name !== currentPlayer.name &&
    player.location === currentPlayer.location
  );
}

module.exports = {
  playersFolder,
  getPlayerFilePath,
  createNewPlayer,
  ensurePlayerShape,
  loadPlayer,
  savePlayer,
  loadAllPlayers,
  getOtherPlayersInSameLocation
};