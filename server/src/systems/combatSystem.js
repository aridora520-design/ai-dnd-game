function createCombatSystem({
  randomChoice,
  rollD20,
  rollDie,
  addWorldEvent,
  updateReputation,
  getReputationReaction,
  buildResultBlock,
  savePlayer,
  saveWorldState
}) {
  function getAttackFlavor(outcome) {
    const options = {
      hit: [
        "Clean hit. Not elegant, but effective.",
        "That landed with conviction.",
        "The goblin regrets being in range."
      ],
      kill: [
        "The goblin drops. The forest gets quieter for a moment.",
        "Problem solved. Subtlety was not involved.",
        "A decisive finish."
      ],
      miss: [
        "A bold attempt. Accuracy remains theoretical.",
        "You commit fully. The hit does not.",
        "The goblin survives, unfortunately encouraged."
      ]
    };

    const pool = options[outcome] || ["Something happened."];
    return randomChoice(pool);
  }

  function narrateAttackIntro(style, flavor) {
    if (style === "ranged" && flavor.isTrickShot) {
      if (flavor.mentionsJump && flavor.mentionsSpin) {
        return "You launch yourself into the air and commit to a spinning shot.";
      }
      if (flavor.mentionsNoScope) {
        return "You attempt a ridiculous no-scope shot with more confidence than caution.";
      }
      return "You attempt a reckless trick shot, trusting style and instinct.";
    }

    if (style === "ranged") {
      return randomChoice([
        "You steady yourself and line up a ranged attack.",
        "You draw carefully and prepare to fire.",
        "You shift your footing and aim at the goblin."
      ]);
    }

    if (flavor.mentionsKick) {
      return "You rush in, chambering a kick as you close the distance.";
    }
    if (flavor.mentionsPunch) {
      return "You tighten your fists and drive forward into close combat.";
    }
    if (flavor.mentionsStab) {
      return "You lunge forward, trying to stab through an opening.";
    }
    if (flavor.mentionsSlash) {
      return "You sweep in with a slashing attack.";
    }

    return randomChoice([
      "You rush the goblin and commit to close combat.",
      "You step in hard, ready to strike at melee range.",
      "You close the distance and attack with force."
    ]);
  }

  function narratePlayerHit(style, damage, flavor) {
    if (style === "ranged" && flavor.isTrickShot) {
      if (flavor.mentionsNoScope) {
        return `Against all reason, your no-scope shot lands for ${damage} damage.`;
      }
      if (flavor.mentionsJump && flavor.mentionsSpin) {
        return `Mid-spin, you release perfectly, and the shot crashes into the goblin for ${damage} damage.`;
      }
      return `Your reckless trick shot somehow connects for ${damage} damage.`;
    }

    if (style === "ranged") {
      return `Your shot strikes the goblin for ${damage} damage.`;
    }

    if (flavor.mentionsKick) {
      return `Your kick slams into the target for ${damage} damage.`;
    }
    if (flavor.mentionsPunch) {
      return `Your punch lands cleanly and deals ${damage} damage.`;
    }
    if (flavor.mentionsStab) {
      return `You drive the stab home and deal ${damage} damage.`;
    }
    if (flavor.mentionsSlash) {
      return `Your slash cuts across the target for ${damage} damage.`;
    }

    return `You strike for ${damage} damage.`;
  }

  function narratePlayerMiss(style, flavor) {
    if (style === "ranged" && flavor.isTrickShot) {
      return "The trick shot looks spectacular, but fails to connect.";
    }

    if (style === "ranged") {
      return "Your shot misses as the target jerks out of the way.";
    }

    if (flavor.mentionsKick) {
      return "Your kick cuts through empty air.";
    }
    if (flavor.mentionsPunch) {
      return "You throw the punch, but the target slips away.";
    }
    if (flavor.mentionsStab) {
      return "Your stab goes wide.";
    }
    if (flavor.mentionsSlash) {
      return "Your slash misses.";
    }

    return "You miss.";
  }

  function narrateCriticalHit(style, damage, flavor) {
    if (style === "ranged" && flavor.isTrickShot) {
      return `Somehow, your impossible trick shot becomes a devastating critical hit for ${damage} damage.`;
    }

    return `A critical hit lands for ${damage} damage.`;
  }

  function narrateCriticalFail(style, flavor) {
    if (style === "ranged" && flavor.isTrickShot) {
      return "Your flashy move collapses into a complete disaster.";
    }

    return "Your attack goes badly wrong.";
  }

  function narrateGoblinAttackHit(damage) {
    return `The goblin strikes back and hits for ${damage} damage.`;
  }

  function narrateGoblinAttackMiss() {
    return "The goblin strikes back, but misses.";
  }

  function narrateDefendSuccess() {
    return "You brace perfectly and turn the attack aside.";
  }

  function narrateDefendPartial(damage) {
    return `You block most of it, but still lose ${damage} HP.`;
  }

  function narrateRunSuccess() {
    return "You break away and escape to the street.";
  }

  function narrateRunFail(damage) {
    return `You fail to escape, and the goblin clips you for ${damage} damage.`;
  }

  function narrateDeath() {
    return "You collapse as the fight finally overwhelms you.";
  }

  function narrateRespawn() {
    return "You awaken in the village, restored to full health.";
  }

  function handlePlayerDeath(player, worldState) {
    addWorldEvent(worldState, `${player.name} falls in battle.`, player.location);
    player.location = "village";
    player.hp = player.maxHp;
    addWorldEvent(worldState, `${player.name} awakens in the village, restored to full health.`, "village");
    savePlayer(player);
    saveWorldState(worldState);
  }

  function handleAttackAction(player, worldState, interpreted, flavor) {
    if (player.location !== "forest" || !worldState.goblinAlive) {
      const resultText = buildResultBlock(
        [
          "Action: Attack",
          "Outcome: Invalid",
          "Target: None"
        ],
        "You swing at nothing and achieve exactly that."
      );

      addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);
      return;
    }

    addWorldEvent(worldState, `${player.name}: ${narrateAttackIntro(interpreted.style, flavor)}`, player.location);

    const attackRoll = rollD20();
    const total = attackRoll + player.stats.strength;
    const dc = 12;

    if (attackRoll === 20) {
      const damage = 12 + rollDie(6);
      updateReputation(player, { chaos: 2, intimidation: 2 });
      worldState.goblinHp -= damage;

      addWorldEvent(worldState, `${player.name}: ${narrateCriticalHit(interpreted.style, damage, flavor)}`, player.location);

      if (worldState.goblinHp <= 0) {
        worldState.goblinAlive = false;
        worldState.goblinCorpses = (worldState.goblinCorpses || 0) + 1;
        updateReputation(player, { chaos: 3, intimidation: 2 });

        addWorldEvent(worldState, `${player.name} kills the goblin.`, player.location);
        addWorldEvent(worldState, `${player.name} stands over the fallen goblin.\nIntimidation +2.`, player.location);
        addWorldEvent(worldState, "With its dying breath, the goblin blows on a horn and calls for reinforcements.", player.location);

        worldState.locationStates.forest.stateFlags.goblinReinforcementsIncoming = true;
        worldState.locationStates.forest.stateFlags.reinforcementAmbushPending = true;
        worldState.locationStates.forest.stateFlags.forestDanger += 1;
        worldState.globalState.recentViolence += 1;

        const reactionText = getReputationReaction(player.reputation);
        const resultText = buildResultBlock(
          [
            "Action: Attack",
            "Outcome: Kill",
            `Damage: ${damage}`,
            `Goblin Corpses: ${worldState.goblinCorpses}`,
            "Threat: Reinforcements may ambush you deeper in the forest",
            `Reputation: ${player.reputation.title}`,
            reactionText ? `World: ${reactionText}` : null
          ].filter(Boolean),
          "You won the fight decisively, but the forest may not be finished with you."
        );

        addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);
        worldState.goblinHp = 0;
      } else {
        const reactionText = getReputationReaction(player.reputation);
        const resultText = buildResultBlock(
          [
            "Action: Attack",
            "Outcome: Critical Hit",
            `Damage: ${damage}`,
            `Goblin HP: ${Math.max(0, worldState.goblinHp)}`,
            "Threat: Still active",
            `Reputation: ${player.reputation.title}`,
            reactionText ? `World: ${reactionText}` : null
          ].filter(Boolean),
          "That hit was savage."
        );

        addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);
      }

      return;
    }

    if (attackRoll === 1) {
      updateReputation(player, { chaos: 1 });
      addWorldEvent(worldState, `${player.name}: ${narrateCriticalFail(interpreted.style, flavor)}`, player.location);

      const selfDamage = 3;
      player.hp = Math.max(0, player.hp - selfDamage);
      addWorldEvent(worldState, `${player.name} hurts themselves for ${selfDamage} damage in the failed attack.`, player.location);

      if (player.hp <= 0) {
        addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, player.location);
        handlePlayerDeath(player, worldState);
      }

      return;
    }

    if (total >= dc) {
      const damage = 6 + rollDie(6);
      updateReputation(player, { chaos: 1, intimidation: 1 });
      worldState.goblinHp -= damage;

      addWorldEvent(worldState, `${player.name}: ${narratePlayerHit(interpreted.style, damage, flavor)}`, player.location);

      if (damage >= 8) {
        updateReputation(player, { intimidation: 1 });
        addWorldEvent(worldState, `${player.name}'s brutal strike shakes the battlefield.\nIntimidation +1.`, player.location);
      }

      if (worldState.goblinHp <= 0) {
        worldState.goblinAlive = false;
        worldState.goblinCorpses = (worldState.goblinCorpses || 0) + 1;
        updateReputation(player, { chaos: 3, intimidation: 2 });

        addWorldEvent(worldState, `${player.name} kills the goblin.`, player.location);
        addWorldEvent(worldState, `${player.name} stands over the fallen goblin.\nIntimidation +2.`, player.location);
        addWorldEvent(worldState, "With its dying breath, the goblin blows on a horn and calls for reinforcements.", player.location);

        worldState.locationStates.forest.stateFlags.goblinReinforcementsIncoming = true;
        worldState.locationStates.forest.stateFlags.reinforcementAmbushPending = true;
        worldState.locationStates.forest.stateFlags.forestDanger += 1;
        worldState.globalState.recentViolence += 1;

        const reactionText = getReputationReaction(player.reputation);
        const resultText = buildResultBlock(
          [
            "Action: Attack",
            "Outcome: Kill",
            `Damage: ${damage}`,
            `Goblin Corpses: ${worldState.goblinCorpses}`,
            "Threat: Reinforcements may ambush you deeper in the forest",
            `Reputation: ${player.reputation.title}`,
            reactionText ? `World: ${reactionText}` : null
          ].filter(Boolean),
          "You won the fight, but the forest may not be finished with you."
        );

        addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);
        worldState.goblinHp = 0;
      } else {
        const reactionText = getReputationReaction(player.reputation);
        const resultText = buildResultBlock(
          [
            "Action: Attack",
            "Outcome: Hit",
            `Damage: ${damage}`,
            `Goblin HP: ${Math.max(0, worldState.goblinHp)}`,
            "Threat: Still active",
            `Reputation: ${player.reputation.title}`,
            reactionText ? `World: ${reactionText}` : null
          ].filter(Boolean),
          getAttackFlavor("hit")
        );

        addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);

        const goblinRoll = rollD20();
        const goblinTotal = goblinRoll + 1;
        const playerDefenseDc = 10 + player.stats.defense;

        if (goblinTotal >= playerDefenseDc) {
          const goblinDamage = 6 + rollDie(4);
          player.hp = Math.max(0, player.hp - goblinDamage);
          addWorldEvent(worldState, `${player.name}: ${narrateGoblinAttackHit(goblinDamage)}`, player.location);
        } else {
          addWorldEvent(worldState, `${player.name}: ${narrateGoblinAttackMiss()}`, player.location);
        }

        if (player.hp <= 0) {
          addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, player.location);
          player.location = "village";
          player.hp = player.maxHp;
          addWorldEvent(worldState, `${player.name}: ${narrateRespawn()}`, "village");
        }
      }

      return;
    }

    updateReputation(player, { chaos: 1 });
    addWorldEvent(worldState, `${player.name}: ${narratePlayerMiss(interpreted.style, flavor)}`, player.location);

    const reactionText = getReputationReaction(player.reputation);
    const resultText = buildResultBlock(
      [
        "Action: Attack",
        "Outcome: Miss",
        `Goblin HP: ${worldState.goblinHp}`,
        "Threat: Still active",
        `Reputation: ${player.reputation.title}`,
        reactionText ? `World: ${reactionText}` : null
      ].filter(Boolean),
      getAttackFlavor("miss")
    );

    addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);
  }

  function handleDefendAction(player, worldState) {
    if (player.location !== "forest" || !worldState.goblinAlive) {
      addWorldEvent(worldState, `${player.name} tries to defend, but nothing threatens them.`, player.location);
      return;
    }

    const goblinRoll = rollD20();
    const goblinTotal = goblinRoll + 1;
    const defendDc = 14 + player.stats.defense;

    if (goblinTotal >= defendDc) {
      const reducedDamage = 3;
      player.hp = Math.max(0, player.hp - reducedDamage);
      updateReputation(player, { honor: 1 });
      addWorldEvent(worldState, `${player.name}: ${narrateDefendPartial(reducedDamage)}\nHonor +1.`, player.location);
    } else {
      updateReputation(player, { honor: 1 });
      addWorldEvent(worldState, `${player.name}: ${narrateDefendSuccess()}\nHonor +1.`, player.location);
    }

    if (player.hp <= 0) {
      handlePlayerDeath(player, worldState);
    }
  }

  function handleRunAction(player, worldState) {
    if (player.location !== "forest" || !worldState.goblinAlive) {
      addWorldEvent(worldState, `${player.name} tries to run, but there is nothing to flee from.`, player.location);
      return;
    }

    const roll = rollD20();
    const total = roll + player.stats.dexterity;
    const dc = 11;

    if (total >= dc) {
      player.location = "street";
      updateReputation(player, { honor: 1 });
      addWorldEvent(worldState, `${player.name}: ${narrateRunSuccess()}\nHonor +1.`, "forest");
    } else {
      const goblinDamage = 5;
      player.hp = Math.max(0, player.hp - goblinDamage);
      addWorldEvent(worldState, `${player.name}: ${narrateRunFail(goblinDamage)}`, player.location);
      updateReputation(player, { intimidation: 1 });

      if (player.hp <= 0) {
        handlePlayerDeath(player, worldState);
      }
    }
  }

  return {
    getAttackFlavor,
    narrateAttackIntro,
    narratePlayerHit,
    narratePlayerMiss,
    narrateCriticalHit,
    narrateCriticalFail,
    narrateGoblinAttackHit,
    narrateGoblinAttackMiss,
    narrateDefendSuccess,
    narrateDefendPartial,
    narrateRunSuccess,
    narrateRunFail,
    narrateDeath,
    narrateRespawn,
    handlePlayerDeath,
    handleAttackAction,
    handleDefendAction,
    handleRunAction
  };
}

module.exports = { createCombatSystem };