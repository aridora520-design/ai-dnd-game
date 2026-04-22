function createTimeSystem({ addWorldEvent }) {
  function ensureTimeState(worldState) {
    if (!worldState.time) {
      worldState.time = {
        day: 1,
        hour: 8,
        turn: 0
      };
    }

    if (typeof worldState.time.day !== "number") {
      worldState.time.day = 1;
    }

    if (typeof worldState.time.hour !== "number") {
      worldState.time.hour = 8;
    }

    if (typeof worldState.time.turn !== "number") {
      worldState.time.turn = 0;
    }

    if (!worldState.locationStates) {
      worldState.locationStates = {};
    }

    for (const locationState of Object.values(worldState.locationStates)) {
      if (!locationState.recovery) {
        locationState.recovery = {
          status: "normal",
          recoveryType: null,
          repairEndsAtTurn: null,
          repairEndsAtDay: null,
          repairEndsAtHour: null,
          contributions: 0
        };
      }

      if (!locationState.stateFlags) {
        locationState.stateFlags = {};
      }
    }

    if (worldState.locationStates.bar) {
      const barFlags = worldState.locationStates.bar.stateFlags;

      if (typeof barFlags.barDamaged !== "boolean") {
        barFlags.barDamaged = false;
      }

      if (typeof barFlags.barRepairing !== "boolean") {
        barFlags.barRepairing = false;
      }

      if (barFlags.barClosedUntilTurn === undefined) {
        barFlags.barClosedUntilTurn = null;
      }

      if (barFlags.barClosedUntilDay === undefined) {
        barFlags.barClosedUntilDay = null;
      }

      if (barFlags.barClosedUntilHour === undefined) {
        barFlags.barClosedUntilHour = null;
      }

      if (barFlags.barAutoRepairAtTurn === undefined) {
        barFlags.barAutoRepairAtTurn = null;
      }

      if (typeof barFlags.barRepairProgress !== "number") {
        barFlags.barRepairProgress = 0;
      }

      if (typeof barFlags.barRepairNeeded !== "number") {
        barFlags.barRepairNeeded = 0;
      }

      if (typeof barFlags.repairContributionPoints !== "number") {
        barFlags.repairContributionPoints = 0;
      }
    }
  }

  function getCurrentWorldTime(worldState) {
    ensureTimeState(worldState);

    return {
      day: worldState.time.day,
      hour: worldState.time.hour,
      turn: worldState.time.turn
    };
  }

  function formatWorldTime(worldState) {
    ensureTimeState(worldState);

    const { day, hour } = worldState.time;
    return `Day ${day}, ${String(hour).padStart(2, "0")}:00`;
  }

  function normalizeWorldTime(worldState) {
    ensureTimeState(worldState);

    while (worldState.time.hour >= 24) {
      worldState.time.hour -= 24;
      worldState.time.day += 1;
    }

    while (worldState.time.hour < 0) {
      worldState.time.hour += 24;
      worldState.time.day = Math.max(1, worldState.time.day - 1);
    }

    if (worldState.time.day < 1) {
      worldState.time.day = 1;
    }
  }

  function advanceWorldTime(worldState, amount, reason = "time passes", location = null) {
    ensureTimeState(worldState);

    const hours = Math.max(0, Number(amount) || 0);

    if (hours === 0) {
      return getCurrentWorldTime(worldState);
    }

    worldState.time.hour += hours;
    worldState.time.turn += hours;

    normalizeWorldTime(worldState);

    return getCurrentWorldTime(worldState);
  }

  function processTimedWorldChanges(worldState) {
    ensureTimeState(worldState);

    processBarRepair(worldState);
    processGenericLocationRecoveries(worldState);
  }

  function processBarRepair(worldState) {
    if (!worldState.locationStates.bar) return;

    const barState = worldState.locationStates.bar;
    const barFlags = barState.stateFlags;

    if (!barFlags.barRepairing) return;

    const autoRepairComplete =
      barFlags.barAutoRepairAtTurn !== null &&
      worldState.time.turn >= barFlags.barAutoRepairAtTurn;

    const playerRepairComplete =
      typeof barFlags.barRepairProgress === "number" &&
      typeof barFlags.barRepairNeeded === "number" &&
      barFlags.barRepairNeeded > 0 &&
      barFlags.barRepairProgress >= barFlags.barRepairNeeded;

    if (autoRepairComplete || playerRepairComplete) {
      barFlags.barRepairing = false;
      barFlags.barDamaged = false;
      barFlags.barOnFire = false;

      barFlags.barClosedUntilTurn = null;
      barFlags.barClosedUntilDay = null;
      barFlags.barClosedUntilHour = null;

      barFlags.barAutoRepairAtTurn = null;
      barFlags.barRepairProgress = 0;
      barFlags.barRepairNeeded = 0;
      barFlags.repairContributionPoints = 0;

      barState.recovery.status = "normal";
      barState.recovery.recoveryType = null;
      barState.recovery.repairEndsAtTurn = null;
      barState.recovery.repairEndsAtDay = null;
      barState.recovery.repairEndsAtHour = null;
      barState.recovery.contributions = 0;

      addWorldEvent(
        worldState,
        playerRepairComplete
          ? "The bar repairs are completed ahead of schedule thanks to player help. The doors are open again."
          : "The bar repairs are finished. The doors are open again.",
        "bar"
      );
    }
  }

  function processGenericLocationRecoveries(worldState) {
    for (const [locationKey, locationState] of Object.entries(worldState.locationStates)) {
      if (locationKey === "bar") continue;
      if (!locationState.recovery) continue;

      const recovery = locationState.recovery;

      if (
        recovery.status === "repairing" &&
        recovery.repairEndsAtTurn !== null &&
        worldState.time.turn >= recovery.repairEndsAtTurn
      ) {
        recovery.status = "normal";
        recovery.recoveryType = null;
        recovery.repairEndsAtTurn = null;
        recovery.repairEndsAtDay = null;
        recovery.repairEndsAtHour = null;
        recovery.contributions = 0;

        addWorldEvent(
          worldState,
          `${capitalize(locationKey)} has recovered and returns to normal at ${formatWorldTime(worldState)}.`,
          locationKey
        );
      }
    }
  }

  function scheduleBarRepair(worldState, hours) {
    ensureTimeState(worldState);

    const repairHours = Math.max(1, Number(hours) || 1);
    const barState = worldState.locationStates.bar;
    const barFlags = barState.stateFlags;

    barFlags.barDamaged = true;
    barFlags.barRepairing = true;

    barFlags.barAutoRepairAtTurn = worldState.time.turn + repairHours;
    barFlags.barClosedUntilTurn = worldState.time.turn + repairHours;

    barFlags.barRepairProgress = 0;
    barFlags.barRepairNeeded = 6;
    barFlags.repairContributionPoints = 0;

    const endTime = projectFutureTime(worldState, repairHours);
    barFlags.barClosedUntilDay = endTime.day;
    barFlags.barClosedUntilHour = endTime.hour;

    barState.recovery.status = "repairing";
    barState.recovery.recoveryType = "bar-repair";
    barState.recovery.repairEndsAtTurn = barFlags.barAutoRepairAtTurn;
    barState.recovery.repairEndsAtDay = endTime.day;
    barState.recovery.repairEndsAtHour = endTime.hour;
    barState.recovery.contributions = 0;

    addWorldEvent(
      worldState,
      `The bar is forced to close for repairs. It should reopen by Day ${endTime.day}, ${String(endTime.hour).padStart(2, "0")}:00 unless players repair it sooner.`,
      "bar"
    );
  }

  function scheduleLocationRecovery(worldState, locationKey, recoveryState) {
    ensureTimeState(worldState);

    if (!worldState.locationStates[locationKey]) {
      return {
        success: false,
        text: `Unknown location: ${locationKey}.`
      };
    }

    const locationState = worldState.locationStates[locationKey];
    const hours = Math.max(1, Number(recoveryState.hours) || 1);
    const endTime = projectFutureTime(worldState, hours);

    locationState.recovery.status = "repairing";
    locationState.recovery.recoveryType = recoveryState.recoveryType || "generic-repair";
    locationState.recovery.repairEndsAtTurn = worldState.time.turn + hours;
    locationState.recovery.repairEndsAtDay = endTime.day;
    locationState.recovery.repairEndsAtHour = endTime.hour;
    locationState.recovery.contributions = 0;

    return {
      success: true,
      text: `${capitalize(locationKey)} recovery scheduled for Day ${endTime.day}, ${String(endTime.hour).padStart(2, "0")}:00.`
    };
  }

  function getLocationRecoveryActions(worldState, locationKey) {
    ensureTimeState(worldState);

    if (!worldState.locationStates[locationKey]) {
      return [];
    }

    const locationState = worldState.locationStates[locationKey];
    const actions = [];

    if (locationKey === "bar" && locationState.stateFlags.barRepairing) {
      actions.push("repair");
      actions.push("help repair");
      actions.push("donate wood");
      actions.push("donate supplies");
      actions.push("clear rubble");
    }

    if (locationKey !== "bar" && locationState.recovery.status === "repairing") {
      actions.push("repair");
      actions.push("help repair");
    }

    return actions;
  }

  function contributeToRecovery(worldState, locationKey, contribution) {
    ensureTimeState(worldState);

    if (!worldState.locationStates[locationKey]) {
      return {
        success: false,
        text: `There is nothing to repair in ${locationKey}.`
      };
    }

    const locationState = worldState.locationStates[locationKey];
    const amount = Math.max(1, Number(contribution.amount) || 1);

    if (locationKey === "bar") {
      const barFlags = locationState.stateFlags;

      if (!barFlags.barRepairing) {
        return {
          success: false,
          text: "The bar does not currently need repairs."
        };
      }

      barFlags.barRepairProgress += amount;
      locationState.recovery.contributions += amount;

      const progressText = `${barFlags.barRepairProgress}/${barFlags.barRepairNeeded}`;

      return {
        success: true,
        text: `${contribution.actor || "Someone"} helps repair the bar. Repair progress: ${progressText}.`
      };
    }

    if (
      locationState.recovery.status !== "repairing" ||
      locationState.recovery.repairEndsAtTurn === null
    ) {
      return {
        success: false,
        text: `${capitalize(locationKey)} does not currently need repairs.`
      };
    }

    locationState.recovery.contributions += amount;

    const turnsReduced = Math.floor(locationState.recovery.contributions / 3);

    if (turnsReduced > 0) {
      locationState.recovery.repairEndsAtTurn = Math.max(
        worldState.time.turn + 1,
        locationState.recovery.repairEndsAtTurn - turnsReduced
      );

      locationState.recovery.contributions = locationState.recovery.contributions % 3;

      const remainingHours = Math.max(1, locationState.recovery.repairEndsAtTurn - worldState.time.turn);
      const endTime = projectFutureTime(worldState, remainingHours);

      locationState.recovery.repairEndsAtDay = endTime.day;
      locationState.recovery.repairEndsAtHour = endTime.hour;
    }

    return {
      success: true,
      text: `${contribution.actor || "Someone"} helps repair ${locationKey}.`
    };
  }

  function projectFutureTime(worldState, hoursAhead) {
    const current = getCurrentWorldTime(worldState);
    let futureDay = current.day;
    let futureHour = current.hour + hoursAhead;

    while (futureHour >= 24) {
      futureHour -= 24;
      futureDay += 1;
    }

    return {
      day: futureDay,
      hour: futureHour
    };
  }

  function capitalize(text) {
    if (!text || typeof text !== "string") return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  return {
    ensureTimeState,
    getCurrentWorldTime,
    formatWorldTime,
    advanceWorldTime,
    processTimedWorldChanges,
    scheduleBarRepair,
    scheduleLocationRecovery,
    getLocationRecoveryActions,
    contributeToRecovery
  };
}

module.exports = { createTimeSystem };