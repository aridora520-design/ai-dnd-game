function createActionResolutionSystem({
  rollD20,
  addWorldEvent,
  updateReputation,
  narrateDeath,
  handlePlayerDeath,
  banPlayerFromGuardZones,
  markBartenderHostile,
  advanceEventChain,
  closeActiveEvent,
  clearVillageRumorFlagForEvent,
  finishForestEncounter
}) {
  function resolveCheck({ bonus = 0, dc = 12 }) {
    const roll = rollD20();
    const total = roll + bonus;

    let tier = "fail";
    if (roll === 20 || total >= dc + 5) tier = "great";
    else if (total >= dc) tier = "success";
    else if (total >= dc - 2) tier = "mixed";

    return { roll, total, dc, tier };
  }

  function reactionIntentIsAttackLike(intent) {
    return intent === "attack";
  }

  function resolveForestHostileEvent(player, worldState, locationKey, eventObj, config) {
    if (reactionIntentIsAttackLike(config.reactionIntent)) {
      const check = resolveCheck({
        bonus: player.stats.strength + player.stats.dexterity,
        dc: config.dc
      });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { intimidation: config.intimidationReward || 1, chaos: config.chaosReward || 1 });

        finishForestEncounter(worldState, {
          corpses: config.corpsesOnWin || 1,
          dangerDelta: config.dangerRelief !== undefined ? -config.dangerRelief : 0,
          clearReinforcementPending: !!config.clearReinforcementPending,
          cooldownTurns: config.cooldownTurnsOnWin ?? 2
        });

        addWorldEvent(
          worldState,
          `${player.name} ${config.winText}`,
          locationKey
        );
        // 💛 SUPPORT TRIGGER
        if (
        !worldState.lastSupportTrigger ||
        (worldState.turn || 0) - worldState.lastSupportTrigger > 5
        ) {
        addWorldEvent(
            worldState,
            "💛 Big moment. If you're enjoying the world, the support link is right below the action box.",
            locationKey
        );
        worldState.lastSupportTrigger = worldState.turn || 0;
        }

        closeActiveEvent(worldState, locationKey);
        return true;
      }

      const damage = check.tier === "mixed" ? config.damageOnMixed : config.damageOnFail;
      player.hp = Math.max(0, player.hp - damage);

      finishForestEncounter(worldState, {
        dangerDelta: config.dangerRiseOnFail ?? 1,
        clearReinforcementPending: false,
        cooldownTurns: config.cooldownTurnsOnFail ?? 1
      });

      addWorldEvent(
        worldState,
        `${player.name} ${check.tier === "mixed" ? config.mixedText : config.failText} They take ${damage} damage.`,
        locationKey
      );

      if (player.hp <= 0) {
        addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, locationKey);
        handlePlayerDeath(player, worldState);
      }

      closeActiveEvent(worldState, locationKey);
      return true;
    }

    if (config.reactionIntent === "defend" || config.reactionIntent === "help") {
      const check = resolveCheck({
        bonus: player.stats.defense + 2,
        dc: config.defendDc || (config.dc - 1)
      });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 2 });

        finishForestEncounter(worldState, {
          dangerDelta: config.defendDangerRelief ? -config.defendDangerRelief : 0,
          clearReinforcementPending: !!config.clearReinforcementPending,
          cooldownTurns: config.cooldownTurnsOnDefend ?? 2
        });

        addWorldEvent(
          worldState,
          `${player.name} ${config.defendWinText}`,
          locationKey
        );

        closeActiveEvent(worldState, locationKey);
        return true;
      }

      const damage = config.damageOnDefendFail ?? 6;
      player.hp = Math.max(0, player.hp - damage);

      finishForestEncounter(worldState, {
        dangerDelta: 1,
        cooldownTurns: 1
      });

      addWorldEvent(
        worldState,
        `${player.name} ${config.defendFailText} They take ${damage} damage.`,
        locationKey
      );

      if (player.hp <= 0) {
        addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, locationKey);
        handlePlayerDeath(player, worldState);
      }

      closeActiveEvent(worldState, locationKey);
      return true;
    }

    if (config.reactionIntent === "flee") {
      const check = resolveCheck({
        bonus: player.stats.dexterity + 1,
        dc: config.fleeDc || 12
      });

      if (check.tier === "great" || check.tier === "success") {
        player.location = "street";

        finishForestEncounter(worldState, {
          clearReinforcementPending: !!config.clearReinforcementPending,
          cooldownTurns: 2
        });

        addWorldEvent(
          worldState,
          `${player.name} ${config.fleeWinText}`,
          "forest"
        );

        closeActiveEvent(worldState, "forest");
        return true;
      }

      const damage = config.damageOnFleeFail ?? 7;
      player.hp = Math.max(0, player.hp - damage);

      finishForestEncounter(worldState, {
        dangerDelta: 1,
        cooldownTurns: 1
      });

      addWorldEvent(
        worldState,
        `${player.name} ${config.fleeFailText} They take ${damage} damage.`,
        locationKey
      );

      if (player.hp <= 0) {
        addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, locationKey);
        handlePlayerDeath(player, worldState);
      }

      closeActiveEvent(worldState, locationKey);
      return true;
    }

    const damage = config.damageOnHesitation ?? 8;
    player.hp = Math.max(0, player.hp - damage);

    finishForestEncounter(worldState, {
      dangerDelta: 1,
      cooldownTurns: 1
    });

    addWorldEvent(
      worldState,
      `${player.name} hesitates and loses the initiative. They take ${damage} damage.`,
      locationKey
    );

    if (player.hp <= 0) {
      addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, locationKey);
      handlePlayerDeath(player, worldState);
    }

    closeActiveEvent(worldState, locationKey);
    return true;
  }

  function handleGuardQuestionCommon(player, worldState, locationKey, eventObj, reaction, flavorText) {
    if (reaction.intent === "talk") {
      const check = resolveCheck({
        bonus: player.stats.presence + Math.floor(player.reputation.honor / 5),
        dc: 13
      });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 1 });
        worldState.globalState.guardsAlertLevel = Math.max(0, worldState.globalState.guardsAlertLevel - 1);
        addWorldEvent(
          worldState,
          `${player.name} answers steadily. The guard ${flavorText.success}`,
          locationKey
        );
        closeActiveEvent(worldState, locationKey);
        return true;
      }

      if (check.tier === "mixed") {
        worldState.globalState.guardsAlertLevel += 1;
        worldState.locationStates.street.stateFlags.guardsAlert = true;
        addWorldEvent(
          worldState,
          `${player.name} only half-sells the explanation. The guard ${flavorText.mixed}`,
          locationKey
        );
        closeActiveEvent(worldState, locationKey);
        return true;
      }

      worldState.globalState.guardsAlertLevel += 1;
      worldState.locationStates.street.stateFlags.guardsAlert = true;
      banPlayerFromGuardZones(player, worldState, locationKey);
      addWorldEvent(
        worldState,
        `${player.name}'s explanation collapses. The guard ${flavorText.fail}`,
        locationKey
      );
      closeActiveEvent(worldState, locationKey);
      return true;
    }

    if (reaction.intent === "threaten" || reaction.intent === "attack") {
      updateReputation(player, { chaos: 2, intimidation: 2 });
      banPlayerFromGuardZones(player, worldState, locationKey);
      addWorldEvent(
        worldState,
        `${player.name} turns hostile toward the guard. That ends badly for future freedom of movement.`,
        locationKey
      );

      if (locationKey === "bar" || locationKey === "street") {
        player.location = "village";
        addWorldEvent(
          worldState,
          `${player.name} is forced back toward the village under guard pressure.`,
          "village"
        );
      }

      closeActiveEvent(worldState, locationKey);
      return true;
    }

    if (reaction.intent === "observe" || reaction.intent === "flee") {
      worldState.globalState.guardsAlertLevel += 1;
      worldState.locationStates.street.stateFlags.guardsAlert = true;
      addWorldEvent(
        worldState,
        `${player.name} gives the guards exactly the kind of evasive behavior they were worried about.`,
        locationKey
      );
      closeActiveEvent(worldState, locationKey);
      return true;
    }

    addWorldEvent(worldState, `${player.name} hesitates while the guard waits for an answer.`, locationKey);
    return true;
  }

  function handleActiveEventReaction(player, worldState, rawAction, reaction) {
    const locationKey = player.location;
    const locState = worldState.locationStates[locationKey];
    if (!locState || !locState.activeEvent) return false;

    const eventObj = locState.activeEvent;

    if (eventObj.id === "bar_drunk_accusation") {
      if (reaction.intent === "talk") {
        const check = resolveCheck({
          bonus: player.stats.presence + Math.floor(player.reputation.honor / 5),
          dc: 12
        });

        if (check.tier === "great" || check.tier === "success") {
          updateReputation(player, { honor: 2 });
          addWorldEvent(
            worldState,
            `${player.name} gets between them with a steady voice. The drunk grumbles, but the merchant backs off and the moment cools.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "success");
          return true;
        }

        if (check.tier === "mixed") {
          updateReputation(player, { honor: 1 });
          addWorldEvent(
            worldState,
            `${player.name} nearly settles it, but the drunk shoves the merchant anyway. The tension snaps.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "mixed");
          return true;
        }

        updateReputation(player, { chaos: 1 });
        addWorldEvent(
          worldState,
          `${player.name}'s attempt to calm things down fails. The accusation turns ugly fast.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      if (reaction.intent === "attack" || reaction.intent === "threaten") {
        updateReputation(player, { chaos: 1, intimidation: 1 });
        markBartenderHostile(worldState, player.name);
        player.flags.bartenderBarred = true;
        addWorldEvent(
          worldState,
          `${player.name} escalates the confrontation. The room tips from argument into violence. Rowan will remember this.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      if (reaction.intent === "observe" || reaction.intent === "flee") {
        addWorldEvent(
          worldState,
          `${player.name} hangs back. No one steps in before fists start flying.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "ignore");
        return true;
      }

      addWorldEvent(worldState, `${player.name} hesitates while the accusation boils over.`, locationKey);
      return true;
    }

    if (eventObj.id === "bar_brawl") {
      if (reaction.intent === "talk") {
        const check = resolveCheck({
          bonus: player.stats.presence + Math.floor(player.reputation.honor / 5),
          dc: 13
        });

        if (check.tier === "great" || check.tier === "success") {
          updateReputation(player, { honor: 2 });
          addWorldEvent(
            worldState,
            `${player.name} cuts through the chaos with a commanding voice. Somehow, the worst of the fight breaks apart.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "success");
          return true;
        }

        if (check.tier === "mixed") {
          const damage = 4;
          player.hp = Math.max(0, player.hp - damage);
          worldState.locationStates.bar.stateFlags.barDamaged = true;
          worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

          updateReputation(player, { honor: 1 });
          addWorldEvent(
            worldState,
            `${player.name} nearly restores order, but catches a bottle for ${damage} damage. The noise spills out into the street.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "mixed");
          return true;
        }

        worldState.locationStates.bar.stateFlags.barDamaged = true;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        updateReputation(player, { chaos: 1 });
        markBartenderHostile(worldState, player.name);
        player.flags.bartenderBarred = true;

        addWorldEvent(
          worldState,
          `${player.name} fails to calm the brawl. Furniture breaks, people shout, and someone has clearly sent for the guards. Rowan blames ${player.name}.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      if (reaction.intent === "attack" || reaction.intent === "defend" || reaction.intent === "help") {
        const bonus =
          reaction.intent === "attack"
            ? player.stats.strength
            : reaction.intent === "defend"
              ? player.stats.defense + 1
              : player.stats.strength;

        const check = resolveCheck({ bonus, dc: 12 });

        if (check.tier === "great" || check.tier === "success") {
          worldState.locationStates.bar.stateFlags.barDamaged = true;
          worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

          if (reaction.intent === "attack") {
            updateReputation(player, { intimidation: 2, chaos: 1 });
            markBartenderHostile(worldState, player.name);
            player.flags.bartenderBarred = true;
            addWorldEvent(
              worldState,
              `${player.name} crashes into the melee and forces it to end the hard way. But the bar is wrecked, the street heard everything, and Rowan blames them.`,
              locationKey
            );
          } else {
            updateReputation(player, { honor: 2 });
            addWorldEvent(
              worldState,
              `${player.name} throws themselves into the chaos and keeps it from getting worse, but the damage is already done.`,
              locationKey
            );
          }

          advanceEventChain(worldState, locationKey, eventObj, "mixed");
          return true;
        }

        const damage = 6;
        player.hp = Math.max(0, player.hp - damage);
        worldState.locationStates.bar.stateFlags.barDamaged = true;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        updateReputation(player, { chaos: 1, intimidation: 1 });
        markBartenderHostile(worldState, player.name);
        player.flags.bartenderBarred = true;

        addWorldEvent(
          worldState,
          `${player.name} gets swallowed by the bar brawl and takes ${damage} damage. The guards are definitely getting involved now, and Rowan is done with them.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      if (reaction.intent === "observe" || reaction.intent === "flee") {
        worldState.locationStates.bar.stateFlags.barDamaged = true;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        updateReputation(player, { honor: -1 });
        addWorldEvent(
          worldState,
          `${player.name} backs off while the bar tears itself apart. The disturbance spills toward the street.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "ignore");
        return true;
      }

      addWorldEvent(worldState, `${player.name} reacts awkwardly, but the fight only grows louder.`, locationKey);
      return true;
    }

    if (eventObj.id === "bar_thief") {
      if (reaction.intent === "attack" || reaction.intent === "help") {
        const statBonus = reaction.intent === "attack" ? player.stats.dexterity : player.stats.dexterity + 1;
        const check = resolveCheck({ bonus: statBonus, dc: 13 });

        if (check.tier === "great" || check.tier === "success") {
          updateReputation(player, { honor: 2 });
          worldState.locationStates.bar.stateFlags.thiefActive = false;
          addWorldEvent(
            worldState,
            `${player.name} cuts off the thief before they reach the door and recovers the stolen purse.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "success");
          return true;
        }

        if (check.tier === "mixed") {
          updateReputation(player, { honor: 1 });
          worldState.locationStates.bar.stateFlags.thiefActive = false;
          worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

          addWorldEvent(
            worldState,
            `${player.name} almost catches the thief, but the chase spills into the street.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "mixed");
          return true;
        }

        updateReputation(player, { chaos: 1 });
        worldState.locationStates.bar.stateFlags.thiefActive = false;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        addWorldEvent(
          worldState,
          `${player.name} lunges too late. The thief bursts outside into the street.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      if (reaction.intent === "talk" || reaction.intent === "threaten") {
        const bonus = reaction.intent === "talk" ? player.stats.presence : player.stats.presence + 1;
        const check = resolveCheck({ bonus, dc: 14 });

        if (check.tier === "great") {
          updateReputation(player, { intimidation: 2 });
          worldState.locationStates.bar.stateFlags.thiefActive = false;
          addWorldEvent(
            worldState,
            `${player.name}'s voice freezes the thief for one fatal second. The purse is recovered.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "success");
          return true;
        }

        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        addWorldEvent(
          worldState,
          `${player.name} shouts after the thief, but momentum wins. The chase spills outside.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "mixed");
        return true;
      }

      if (reaction.intent === "observe" || reaction.intent === "flee") {
        worldState.locationStates.bar.stateFlags.thiefActive = false;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        updateReputation(player, { honor: -1 });
        addWorldEvent(
          worldState,
          `${player.name} lets the moment pass. The thief escapes into the street.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "ignore");
        return true;
      }

      addWorldEvent(worldState, `${player.name} hesitates while the thief makes their move.`, locationKey);
      return true;
    }

    if (eventObj.id === "bar_fire") {
      if (reaction.intent === "help" || reaction.intent === "defend") {
        const check = resolveCheck({ bonus: player.stats.defense + 1, dc: 12 });

        if (check.tier === "great" || check.tier === "success") {
          updateReputation(player, { honor: 2 });
          worldState.locationStates.bar.stateFlags.barOnFire = false;
          addWorldEvent(
            worldState,
            `${player.name} beats down the first flames before they can spread.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "success");
          return true;
        }

        if (check.tier === "mixed") {
          const damage = 5;
          player.hp = Math.max(0, player.hp - damage);
          worldState.locationStates.bar.stateFlags.barDamaged = true;
          worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

          addWorldEvent(
            worldState,
            `${player.name} slows the flames, but takes ${damage} damage as the fire spreads farther into the room.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "mixed");
          return true;
        }

        const damage = 8;
        player.hp = Math.max(0, player.hp - damage);
        worldState.locationStates.bar.stateFlags.barDamaged = true;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
        markBartenderHostile(worldState, player.name);
        player.flags.bartenderBarred = true;

        addWorldEvent(
          worldState,
          `${player.name} rushes the flames and gets burned for ${damage} damage. The fire spreads, and Rowan does not forget the chaos around them.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      if (reaction.intent === "observe" || reaction.intent === "flee") {
        worldState.locationStates.bar.stateFlags.barDamaged = true;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
        markBartenderHostile(worldState, player.name);
        player.flags.bartenderBarred = true;

        addWorldEvent(
          worldState,
          `${player.name} backs away as the first flames spread across the bar. Rowan will remember that.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "ignore");
        return true;
      }

      addWorldEvent(worldState, `${player.name} reacts, but the fire keeps demanding action.`, locationKey);
      return true;
    }

    if (eventObj.id === "bar_fire_spreading") {
      if (reaction.intent === "help" || reaction.intent === "defend") {
        const check = resolveCheck({ bonus: player.stats.defense + 1, dc: 14 });

        if (check.tier === "great" || check.tier === "success") {
          updateReputation(player, { honor: 2 });
          worldState.locationStates.bar.stateFlags.barOnFire = false;
          worldState.locationStates.bar.stateFlags.barDamaged = true;
          worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

          addWorldEvent(
            worldState,
            `${player.name} finally gets the spreading fire under control, but the bar is left blackened and damaged.`,
            locationKey
          );
          closeActiveEvent(worldState, locationKey);
          return true;
        }

        worldState.locationStates.bar.stateFlags.barOnFire = false;
        worldState.locationStates.bar.stateFlags.barDamaged = true;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
        markBartenderHostile(worldState, player.name);
        player.flags.bartenderBarred = true;

        addWorldEvent(
          worldState,
          `${player.name} cannot stop the damage in time. The flames are put out eventually, but the bar is left badly damaged and Rowan holds a grudge.`,
          locationKey
        );
        closeActiveEvent(worldState, locationKey);
        return true;
      }

      worldState.locationStates.bar.stateFlags.barOnFire = false;
      worldState.locationStates.bar.stateFlags.barDamaged = true;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
      markBartenderHostile(worldState, player.name);
      player.flags.bartenderBarred = true;

      addWorldEvent(
        worldState,
        `${player.name} fails to act while the fire spreads. The bar survives, but only barely. Rowan does not want them resting here again anytime soon.`,
        locationKey
      );
      closeActiveEvent(worldState, locationKey);
      return true;
    }

    if (eventObj.id === "bar_guard_question") {
      return handleGuardQuestionCommon(player, worldState, locationKey, eventObj, reaction, {
        success: "relaxes slightly and lets the matter go.",
        mixed: "does not arrest you, but definitely makes a note of you.",
        fail: "signals to others. You're now a problem to be managed."
      });
    }

    if (eventObj.id === "street_guard_response") {
      if (reaction.intent === "talk") {
        const check = resolveCheck({
          bonus: player.stats.presence + Math.floor(player.reputation.honor / 5),
          dc: 13
        });

        if (check.tier === "great" || check.tier === "success") {
          updateReputation(player, { honor: 1 });
          addWorldEvent(
            worldState,
            `${player.name} explains the situation well enough that the guards calm down and focus on restoring order.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "success");
          return true;
        }

        if (check.tier === "mixed") {
          worldState.locationStates.street.stateFlags.guardsAlert = true;
          worldState.globalState.guardsAlertLevel += 1;
          worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

          addWorldEvent(
            worldState,
            `${player.name} only half-convinces the guards. They tighten their grip on the street.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "mixed");
          return true;
        }

        worldState.locationStates.street.stateFlags.guardsAlert = true;
        worldState.globalState.guardsAlertLevel += 1;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        addWorldEvent(
          worldState,
          `${player.name}'s explanation falls apart. The guards move into crackdown mode.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      if (reaction.intent === "threaten" || reaction.intent === "attack") {
        updateReputation(player, { chaos: 2, intimidation: 2 });
        worldState.locationStates.street.stateFlags.guardsAlert = true;
        worldState.globalState.guardsAlertLevel += 1;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
        banPlayerFromGuardZones(player, worldState, locationKey);

        addWorldEvent(
          worldState,
          `${player.name} meets the guards with hostility. The whole street locks down, and their access to the street and bar is cut off.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      worldState.locationStates.street.stateFlags.guardsAlert = true;
      worldState.globalState.guardsAlertLevel += 1;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

      addWorldEvent(worldState, `${player.name} hesitates while the guards take control of the scene.`, locationKey);
      advanceEventChain(worldState, locationKey, eventObj, "ignore");
      return true;
    }

    if (eventObj.id === "street_chase") {
      if (reaction.intent === "attack" || reaction.intent === "help") {
        const check = resolveCheck({ bonus: player.stats.dexterity + 1, dc: 13 });

        if (check.tier === "great" || check.tier === "success") {
          updateReputation(player, { honor: 2 });
          addWorldEvent(
            worldState,
            `${player.name} catches the thief in the street and ends the chase.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "success");
          return true;
        }

        if (check.tier === "mixed") {
          updateReputation(player, { honor: 1 });
          worldState.locationStates.street.stateFlags.guardsAlert = true;
          worldState.globalState.guardsAlertLevel += 1;
          worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

          addWorldEvent(
            worldState,
            `${player.name} nearly stops the thief, but the commotion draws guard attention.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "mixed");
          return true;
        }

        updateReputation(player, { chaos: 1 });
        worldState.locationStates.street.stateFlags.guardsAlert = true;
        worldState.globalState.guardsAlertLevel += 1;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        addWorldEvent(
          worldState,
          `${player.name} loses the thief in the chaos. A guard steps in to question what happened.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      if (reaction.intent === "observe" || reaction.intent === "flee") {
        worldState.locationStates.street.stateFlags.guardsAlert = true;
        worldState.globalState.guardsAlertLevel += 1;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        addWorldEvent(
          worldState,
          `${player.name} watches the thief vanish into the street traffic. Guards move in afterward.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "ignore");
        return true;
      }

      addWorldEvent(worldState, `${player.name} hesitates while the chase slips away.`, locationKey);
      return true;
    }

    if (eventObj.id === "street_cart") {
      if (reaction.intent === "help" || reaction.intent === "defend" || reaction.intent === "attack") {
        const check = resolveCheck({ bonus: player.stats.strength + 1, dc: 13 });

        if (check.tier === "great" || check.tier === "success") {
          updateReputation(player, { honor: 2 });
          worldState.locationStates.street.stateFlags.cartCrashed = false;
          addWorldEvent(
            worldState,
            `${player.name} gets hold of the runaway cart and drags it off line before it kills someone.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "success");
          return true;
        }

        if (check.tier === "mixed") {
          const damage = 6;
          player.hp = Math.max(0, player.hp - damage);
          updateReputation(player, { honor: 1 });
          worldState.locationStates.street.stateFlags.cartCrashed = true;

          addWorldEvent(
            worldState,
            `${player.name} slows the cart, but not before taking ${damage} damage and leaving wreckage across the street.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "mixed");
          return true;
        }

        worldState.locationStates.street.stateFlags.cartCrashed = true;
        addWorldEvent(
          worldState,
          `${player.name} fails to stop the cart. It crashes and litters the street with debris.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      worldState.locationStates.street.stateFlags.cartCrashed = true;
      addWorldEvent(worldState, `${player.name} watches the cart thunder by toward disaster.`, locationKey);
      advanceEventChain(worldState, locationKey, eventObj, "ignore");
      return true;
    }

    if (eventObj.id === "street_debris") {
      worldState.locationStates.street.stateFlags.cartCrashed = true;
      addWorldEvent(
        worldState,
        `${player.name} stands among the aftermath as townsfolk try to clear the wreckage.`,
        locationKey
      );
      closeActiveEvent(worldState, locationKey);
      return true;
    }

    if (eventObj.id === "street_guard_stop") {
      if (reaction.intent === "talk") {
        const check = resolveCheck({
          bonus: player.stats.presence + Math.floor(player.reputation.honor / 5),
          dc: 12
        });

        if (check.tier === "great" || check.tier === "success") {
          updateReputation(player, { honor: 1 });
          worldState.globalState.guardsAlertLevel = Math.max(0, worldState.globalState.guardsAlertLevel - 1);
          addWorldEvent(
            worldState,
            `${player.name} answers calmly. The guard nods and steps aside.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "success");
          return true;
        }

        if (check.tier === "mixed") {
          worldState.locationStates.street.stateFlags.guardsAlert = true;
          worldState.globalState.guardsAlertLevel += 1;

          addWorldEvent(
            worldState,
            `${player.name} gets through part of the questioning, but the guard remains suspicious.`,
            locationKey
          );
          advanceEventChain(worldState, locationKey, eventObj, "mixed");
          return true;
        }

        worldState.locationStates.street.stateFlags.guardsAlert = true;
        worldState.globalState.guardsAlertLevel += 1;

        addWorldEvent(
          worldState,
          `${player.name}'s answers only make things worse. The street grows tense.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      if (reaction.intent === "threaten" || reaction.intent === "attack") {
        updateReputation(player, { chaos: 2, intimidation: 2 });
        worldState.locationStates.street.stateFlags.guardsAlert = true;
        worldState.globalState.guardsAlertLevel += 1;
        banPlayerFromGuardZones(player, worldState, locationKey);

        addWorldEvent(
          worldState,
          `${player.name} escalates things with the guard. The street shifts toward crackdown, and access to the street and bar is stripped away.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "fail");
        return true;
      }

      worldState.locationStates.street.stateFlags.guardsAlert = true;
      worldState.globalState.guardsAlertLevel += 1;

      addWorldEvent(worldState, `${player.name} stalls while the guard studies them.`, locationKey);
      advanceEventChain(worldState, locationKey, eventObj, "ignore");
      return true;
    }

    if (eventObj.id === "street_crackdown") {
      worldState.locationStates.street.stateFlags.guardsAlert = true;
      worldState.globalState.guardsAlertLevel += 1;

      addWorldEvent(
        worldState,
        `${player.name} feels the pressure of the crackdown as guards watch every movement on the street.`,
        locationKey
      );

      if (worldState.globalState.guardsAlertLevel > 0) {
        worldState.globalState.guardsAlertLevel -= 1;
      }

      closeActiveEvent(worldState, locationKey);
      return true;
    }

    if (eventObj.id === "village_guard_question") {
      return handleGuardQuestionCommon(player, worldState, locationKey, eventObj, reaction, {
        success: "decides the answers are good enough for now.",
        mixed: "moves on, but not convinced.",
        fail: "treats you like a growing local problem."
      });
    }

    if (eventObj.id === "forest_horn_signal") {
      worldState.locationStates.forest.stateFlags.forestDanger += 1;
      worldState.locationStates.forest.stateFlags.goblinReinforcementsIncoming = false;
      worldState.locationStates.forest.stateFlags.reinforcementAmbushPending = true;
      worldState.globalState.recentViolence += 1;

      addWorldEvent(
        worldState,
        `${player.name} hears the distant horn answer. The forest feels less empty now, and more hostile.`,
        locationKey
      );

      advanceEventChain(worldState, locationKey, eventObj, "ignore");
      return true;
    }

    if (eventObj.id === "forest_reinforcement_ambush") {
      return resolveForestHostileEvent(player, worldState, locationKey, eventObj, {
        reactionIntent: reaction.intent,
        dc: 14,
        corpsesOnWin: 1,
        dangerRelief: 1,
        clearReinforcementPending: true,
        cooldownTurnsOnWin: 2,
        cooldownTurnsOnFail: 1,
        winText: "meets the ambush head-on and drops the goblin reinforcement before it can do real damage. Another corpse hits the forest floor.",
        mixedText: "tries to turn the ambush into a counterattack, but the fight stays messy.",
        failText: "is caught hard by the reinforcement ambush.",
        defendWinText: "weathers the ambush and forces the reinforcement back into the brush.",
        defendFailText: "partially turns aside the ambush, but cannot fully avoid the blows.",
        fleeWinText: "breaks away from the ambush and escapes back to the street.",
        fleeFailText: "tries to flee the ambush, but gets clipped before getting clear.",
        damageOnMixed: 5,
        damageOnFail: 10,
        damageOnDefendFail: 6,
        damageOnFleeFail: 7,
        damageOnHesitation: 8,
        intimidationReward: 2,
        chaosReward: 1
      });
    }

    if (eventObj.id === "forest_goblin_patrol") {
      return resolveForestHostileEvent(player, worldState, locationKey, eventObj, {
        reactionIntent: reaction.intent,
        dc: 15,
        corpsesOnWin: 1,
        dangerRelief: 0,
        clearReinforcementPending: false,
        cooldownTurnsOnWin: 2,
        cooldownTurnsOnFail: 1,
        winText: "cuts through the returning patrol and leaves another goblin corpse in the undergrowth.",
        mixedText: "wins the clash, but not cleanly.",
        failText: "gets dragged into a rough patrol skirmish.",
        defendWinText: "holds the patrol off and forces it to scatter.",
        defendFailText: "absorbs part of the patrol’s rush, but still gets tagged.",
        fleeWinText: "slips away from the patrol and gets back to the street.",
        fleeFailText: "tries to flee the patrol, but one goblin lands a parting hit.",
        damageOnMixed: 6,
        damageOnFail: 9,
        damageOnDefendFail: 5,
        damageOnFleeFail: 6,
        damageOnHesitation: 7,
        intimidationReward: 1,
        chaosReward: 1
      });
    }

    if (eventObj.id === "forest_goblin_hunter") {
      return resolveForestHostileEvent(player, worldState, locationKey, eventObj, {
        reactionIntent: reaction.intent,
        dc: 16,
        corpsesOnWin: 1,
        dangerRelief: 0,
        clearReinforcementPending: false,
        cooldownTurnsOnWin: 2,
        cooldownTurnsOnFail: 1,
        winText: "outplays the goblin hunter and drops it where it stalked from.",
        mixedText: "survives the hunter’s pressure, but takes punishment doing it.",
        failText: "gets outmaneuvered by the hunter in the brush.",
        defendWinText: "reads the hunter’s line and turns the ambush aside.",
        defendFailText: "catches the hunter’s angle too late.",
        fleeWinText: "breaks contact with the hunter and falls back to the street.",
        fleeFailText: "tries to flee the hunter, but the hunter draws blood first.",
        damageOnMixed: 8,
        damageOnFail: 11,
        damageOnDefendFail: 7,
        damageOnFleeFail: 8,
        damageOnHesitation: 9,
        intimidationReward: 2,
        chaosReward: 1
      });
    }

    if (eventObj.id === "forest_goblin_warband") {
      return resolveForestHostileEvent(player, worldState, locationKey, eventObj, {
        reactionIntent: reaction.intent,
        dc: 17,
        corpsesOnWin: 2,
        dangerRelief: 1,
        clearReinforcementPending: false,
        cooldownTurnsOnWin: 3,
        cooldownTurnsOnFail: 1,
        winText: "breaks the warband’s momentum and leaves multiple goblin corpses behind.",
        mixedText: "manages to survive the warband clash, but only barely keeps control.",
        failText: "gets overwhelmed by the warband surge.",
        defendWinText: "anchors against the warband and forces it to pull back.",
        defendFailText: "holds for a moment, then gets driven backward.",
        fleeWinText: "escapes the warband by abandoning ground and sprinting for the street.",
        fleeFailText: "tries to flee the warband, but gets slashed on the way out.",
        damageOnMixed: 10,
        damageOnFail: 14,
        damageOnDefendFail: 9,
        damageOnFleeFail: 10,
        damageOnHesitation: 11,
        intimidationReward: 3,
        chaosReward: 1
      });
    }

    if (eventObj.id === "forest_hunter") {
      if (reaction.intent === "help") {
        const check = resolveCheck({ bonus: player.stats.presence + player.stats.defense, dc: 11 });

        if (check.tier === "great" || check.tier === "success") {
          updateReputation(player, { honor: 2 });
          if (!player.inventory.includes("Health Potion")) {
            player.inventory.push("Health Potion");
          }

          worldState.locationStates.forest.stateFlags.woundedHunterPresent = false;
          worldState.locationStates.village.stateFlags.hunterSavedRumor = true;
          worldState.locationStates.village.stateFlags.hunterAbandonedRumor = false;
          worldState.globalState.hunterSavedBy = player.name;

          addWorldEvent(
            worldState,
            `${player.name} helps the wounded hunter to safety. Before leaving, the hunter presses a Health Potion into ${player.name}'s hand.`,
            locationKey
          );

          advanceEventChain(worldState, locationKey, eventObj, "success");
          return true;
        }

        updateReputation(player, { honor: 1 });
        worldState.locationStates.forest.stateFlags.woundedHunterPresent = false;
        worldState.locationStates.village.stateFlags.hunterSavedRumor = true;
        worldState.globalState.hunterSavedBy = player.name;

        addWorldEvent(
          worldState,
          `${player.name} struggles to help the hunter properly, but the effort still matters and word will likely spread.`,
          locationKey
        );

        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      if (reaction.intent === "observe" || reaction.intent === "flee") {
        updateReputation(player, { honor: -1 });
        worldState.locationStates.forest.stateFlags.woundedHunterPresent = false;
        worldState.locationStates.village.stateFlags.hunterAbandonedRumor = true;
        worldState.locationStates.village.stateFlags.hunterSavedRumor = false;
        worldState.globalState.hunterAbandonedBy = player.name;

        addWorldEvent(
          worldState,
          `${player.name} leaves the wounded hunter behind.`,
          locationKey
        );

        advanceEventChain(worldState, locationKey, eventObj, "ignore");
        return true;
      }

      addWorldEvent(worldState, `${player.name} hesitates while the hunter bleeds into the leaves.`, locationKey);
      return true;
    }

    if (
      eventObj.id === "village_hunter_praise" ||
      eventObj.id === "village_hunter_grumble" ||
      eventObj.id === "village_guard_murmur" ||
      eventObj.id === "village_honor_scene" ||
      eventObj.id === "village_chaos_scene" ||
      eventObj.id === "village_tavern_gossip"
    ) {
      addWorldEvent(
        worldState,
        `${player.name} takes in the village mood: ${eventObj.text}`,
        locationKey
      );

      clearVillageRumorFlagForEvent(worldState, eventObj.id);
      closeActiveEvent(worldState, locationKey);
      return true;
    }

    return false;
  }

  return {
    resolveCheck,
    reactionIntentIsAttackLike,
    resolveForestHostileEvent,
    handleGuardQuestionCommon,
    handleActiveEventReaction
  };
}

module.exports = { createActionResolutionSystem };