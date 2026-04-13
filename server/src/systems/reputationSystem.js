function getReputationTitle(rep) {
  if (rep.chaos > 20 && rep.honor < 5) return "Agent of Chaos";
  if (rep.honor >= 20 && rep.chaos < 5) return "Paragon of Order";
  if (rep.honor >= 10 && rep.chaos < 10) return "Honored Guardian";
  if (rep.honor >= 5 && rep.chaos < 10) return "Trusted Soul";
  if (rep.intimidation >= 20) return "Warlord";
  if (rep.intimidation >= 10) return "Enforcer";
  if (rep.intimidation >= 5) return "Menacing Figure";
  if (rep.chaos > 10 && rep.honor > 10) return "Unpredictable Force";

  return "Unknown Figure";
}

function getReputationReaction(rep) {
  if (rep.chaos > 15) {
    return "Word spreads: you are not to be trusted with stability.";
  }

  if (rep.honor > 15) {
    return "The locals speak well of you.";
  }

  if (rep.intimidation > 15) {
    return "People step aside when you approach.";
  }

  if (rep.chaos > 8 && rep.honor > 8) {
    return "No one is quite sure what you’ll do next.";
  }

  return null;
}

function updateReputation(player, changes) {
  for (const key in changes) {
    if (player.reputation[key] !== undefined) {
      player.reputation[key] += changes[key];
    }
  }

  if (player.reputation.chaos >= 10) {
    player.flags.knownTroublemaker = true;
  }

  if (player.reputation.honor >= 10) {
    player.flags.helpedTownsfolk = true;
  }

  player.reputation.title = getReputationTitle(player.reputation);
}

module.exports = {
  updateReputation,
  getReputationTitle,
  getReputationReaction
};