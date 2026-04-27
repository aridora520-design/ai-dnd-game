function ensureLocationHp(worldState, locationKey) {
  const locationState = worldState.locationStates[locationKey];

  if (typeof locationState.hp !== "number") locationState.hp = 100;
  if (typeof locationState.maxHp !== "number") locationState.maxHp = 100;
  if (!locationState.form) locationState.form = locationKey === "bar" ? "old_bar" : locationKey;
  if (!locationState.status) locationState.status = "standing";

  return locationState;
}

function updateLocationStatus(locationState) {
  if (locationState.hp <= 0) {
    locationState.hp = 0;
    locationState.status = "destroyed";
    return;
  }

  const ratio = locationState.hp / locationState.maxHp;

  if (ratio <= 0.3) {
    locationState.status = "critical";
  } else if (ratio <= 0.7) {
    locationState.status = "damaged";
  } else {
    locationState.status = "standing";
  }
}

function damageLocation(worldState, locationKey, amount) {
  const locationState = ensureLocationHp(worldState, locationKey);

  if (locationState.status === "destroyed") {
    return {
      success: false,
      text: `The ${locationKey} is already destroyed.`
    };
  }

  locationState.hp = Math.max(0, locationState.hp - amount);
  updateLocationStatus(locationState);

  if (locationState.status === "destroyed") {
    locationState.form = `${locationKey}_ruins`;
    locationState.rebuildProject = {
      active: true,
      progress: 0,
      required: 100,
      type: `rebuild_${locationKey}`
    };

    return {
      success: true,
      destroyed: true,
      text: `The ${locationKey} collapses into ruins. The old ${locationKey} is gone.`
    };
  }

  return {
    success: true,
    destroyed: false,
    text: `The ${locationKey} takes ${amount} damage. HP: ${locationState.hp}/${locationState.maxHp}. Status: ${locationState.status}.`
  };
}

function repairLocation(worldState, locationKey, amount) {
  const locationState = ensureLocationHp(worldState, locationKey);

  if (locationState.status === "destroyed") {
    if (!locationState.rebuildProject) {
      locationState.rebuildProject = {
        active: true,
        progress: 0,
        required: 100,
        type: `rebuild_${locationKey}`
      };
    }

    locationState.rebuildProject.progress += amount;

    if (locationState.rebuildProject.progress >= locationState.rebuildProject.required) {
      locationState.form = locationKey === "bar" ? "rebuilt_bar" : locationKey;
      locationState.hp = locationState.maxHp;
      locationState.status = "standing";
      locationState.rebuildProject = null;

      return {
        success: true,
        rebuilt: true,
        text: `The ${locationKey} has been rebuilt. A new chapter begins here.`
      };
    }

    return {
      success: true,
      rebuilt: false,
      text: `Rebuild progress for ${locationKey}: ${locationState.rebuildProject.progress}/${locationState.rebuildProject.required}.`
    };
  }

  locationState.hp = Math.min(locationState.maxHp, locationState.hp + amount);
  updateLocationStatus(locationState);

  return {
    success: true,
    rebuilt: false,
    text: `The ${locationKey} is repaired by ${amount}. HP: ${locationState.hp}/${locationState.maxHp}. Status: ${locationState.status}.`
  };
}

function isLocationDestroyed(worldState, locationKey) {
  const locationState = ensureLocationHp(worldState, locationKey);
  return locationState.status === "destroyed";
}

module.exports = {
  ensureLocationHp,
  damageLocation,
  repairLocation,
  isLocationDestroyed
};