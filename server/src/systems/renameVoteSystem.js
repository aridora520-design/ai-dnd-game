function ensureRenameVote(locationState) {
  if (!locationState.renameVote) {
    locationState.renameVote = {
      active: false,
      proposals: {},
      votes: {},
      endsAtTurn: null,
        endsAtTime: null
    };
  }

  return locationState.renameVote;
}

function startRenameVote(worldState, locationKey, durationMinutes = 15) {
  const locationState = worldState.locationStates[locationKey];
  if (!locationState) return null;

  const vote = ensureRenameVote(locationState);

  vote.active = true;
  vote.proposals = {};
  vote.votes = {};
  vote.endsAtTurn = null;
  vote.endsAtTime = Date.now() + durationMinutes * 60 * 1000;

  return vote;
}

function submitRenameProposal(worldState, player, locationKey, proposedName) {
  const locationState = worldState.locationStates[locationKey];
  if (!locationState) return { success: false, text: "That location does not exist." };

  const vote = ensureRenameVote(locationState);

  if (!vote.active) {
    return { success: false, text: "There is no active rename vote here." };
  }

  if (!proposedName || proposedName.length < 3) {
    return { success: false, text: "The proposed name is too short." };
  }

  vote.proposals[proposedName] = vote.proposals[proposedName] || {
    name: proposedName,
    proposedBy: player.name,
    votes: 0
  };

  return {
    success: true,
    text: `${player.name} proposes the new name: ${proposedName}.`
  };
}
function voteForRename(worldState, player, locationKey, proposedName) {
  const locationState = worldState.locationStates[locationKey];
  if (!locationState) return { success: false, text: "That location does not exist." };

  const vote = ensureRenameVote(locationState);

  if (!vote.active) {
    return { success: false, text: "There is no active rename vote here." };
  }

  const proposal = vote.proposals[proposedName];

  if (!proposal) {
    return { success: false, text: `No proposal named ${proposedName} exists.` };
  }

  const previousVote = vote.votes[player.name];

  if (previousVote && vote.proposals[previousVote]) {
    vote.proposals[previousVote].votes = Math.max(
      0,
      vote.proposals[previousVote].votes - 1
    );
  }

  vote.votes[player.name] = proposedName;
  proposal.votes += 1;

  return {
    success: true,
    text: `${player.name} votes for ${proposedName}.`
  };
}
function finishRenameVote(worldState, locationKey) {
  const locationState = worldState.locationStates[locationKey];
  if (!locationState) {
    return { success: false, text: "That location does not exist." };
  }

  const vote = ensureRenameVote(locationState);

  if (!vote.active) {
    return { success: false, text: "There is no active rename vote here." };
  }

  const proposals = Object.values(vote.proposals || {});

  if (proposals.length === 0) {
    vote.active = false;
    return { success: false, text: "Rename vote ended with no proposals." };
  }

  const winner = proposals.sort((a, b) => (b.votes || 0) - (a.votes || 0))[0];

  worldState.locationNames = worldState.locationNames || {};
  worldState.locationNames[locationKey] = winner.name;

  vote.active = false;

  return {
    success: true,
    winningName: winner.name,
    text: `${locationKey} has been renamed to ${winner.name}.`
  };
}
function processRenameVotes(worldState) {
  const results = [];

  for (const locationKey of Object.keys(worldState.locationStates || {})) {
    const locationState = worldState.locationStates[locationKey];
    const vote = locationState.renameVote;

    if (!vote?.active) continue;
    if (!vote.endsAtTime) continue;
    if (Date.now() < vote.endsAtTime) continue;

    const result = finishRenameVote(worldState, locationKey);
    results.push({ locationKey, ...result });
  }

  return results;
}
module.exports = {
  ensureRenameVote,
  startRenameVote,
  submitRenameProposal,
  voteForRename,
  finishRenameVote,
  processRenameVotes
};