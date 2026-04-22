function interpretAction(rawAction) {
  const original = (rawAction || "").trim();
  const lower = original.toLowerCase();

  if (!lower) {
    return {
      type: "unknown",
      raw: original
    };
  }

  // =========================
  // SAY / SPEAK
  // =========================
  if (
    lower.startsWith("say ") ||
    lower.startsWith("say:") ||
    lower.startsWith('say "') ||
    lower.startsWith("tell ")
  ) {
    const message = extractSpeechMessage(original);
    return {
      type: "say",
      message,
      raw: original
    };
  }

  // =========================
  // LOOK / HELP
  // =========================
  if (
    lower === "look" ||
    lower === "look around" ||
    lower === "inspect" ||
    lower === "observe"
  ) {
    return {
      type: "look",
      raw: original
    };
  }

  if (
    lower === "help" ||
    lower === "commands" ||
    lower === "menu" ||
    lower === "what can i do"
  ) {
    return {
      type: "help",
      raw: original
    };
  }

  // =========================
  // MOVEMENT / SEARCH / REST
  // =========================
  if (
    lower === "search" ||
    lower.includes("search around") ||
    lower.includes("search the area") ||
    lower.includes("look for supplies")
  ) {
    return {
      type: "search",
      raw: original
    };
  }

  if (
    lower === "rest" ||
    lower === "sleep" ||
    lower === "take a rest" ||
    lower === "take rest"
  ) {
    return {
      type: "rest",
      raw: original
    };
  }

  if (
    lower === "wait" ||
    lower === "pass time" ||
    lower === "stay awhile"
  ) {
    return {
      type: "wait",
      raw: original
    };
  }

  // =========================
  // BAR ACTIONS
  // =========================
  if (
    lower === "drink" ||
    lower.includes("have a drink") ||
    lower.includes("order a drink")
  ) {
    return {
      type: "drink",
      raw: original
    };
  }

  if (
    lower === "eat" ||
    lower.includes("have a meal") ||
    lower.includes("order food") ||
    lower.includes("eat food")
  ) {
    return {
      type: "eat",
      raw: original
    };
  }

  if (
    lower === "barfight" ||
    lower === "start barfight" ||
    lower.includes("start a bar fight") ||
    lower.includes("pick a fight in the bar")
  ) {
    return {
      type: "barfight",
      raw: original
    };
  }

  // =========================
  // COMBAT
  // =========================
  if (
    hasAny(lower, [
      "attack",
      "strike",
      "hit",
      "slash",
      "stab",
      "shoot",
      "fire at",
      "swing at",
      "lunge at",
      "smash",
      "kick",
      "punch"
    ])
  ) {
    return {
      type: "attack",
      target: extractTarget(lower),
      raw: original
    };
  }

  if (
    lower === "defend" ||
    lower === "block" ||
    lower === "brace" ||
    lower.includes("take cover") ||
    lower.includes("raise my guard")
  ) {
    return {
      type: "defend",
      raw: original
    };
  }

  if (
    lower === "run" ||
    lower === "flee" ||
    lower === "escape" ||
    lower.includes("run away")
  ) {
    return {
      type: "run",
      raw: original
    };
  }

  // =========================
  // SOCIAL / INTIMIDATION
  // =========================
  if (
    lower === "threaten" ||
    lower.includes("make a threat") ||
    lower.includes("intimidate") ||
    lower.includes("scare them")
  ) {
    return {
      type: "threaten",
      raw: original
    };
  }

  // =========================
  // RECOVERY / REPAIR ACTIONS
  // =========================
  if (
    lower === "repair" ||
    lower === "help repair" ||
    lower === "fix" ||
    lower === "rebuild" ||
    lower.includes("repair the bar") ||
    lower.includes("help repair the bar") ||
    lower.includes("fix the bar") ||
    lower.includes("rebuild the bar") ||
    lower.includes("help with repairs")
  ) {
    return {
      type: "repair",
      raw: original,
      recoveryAction: "labor",
      target: extractRecoveryTarget(lower)
    };
  }

  if (
    lower === "clear rubble" ||
    lower.includes("clear the rubble") ||
    lower.includes("move rubble") ||
    lower.includes("haul debris") ||
    lower.includes("clean debris")
  ) {
    return {
      type: "repair",
      raw: original,
      recoveryAction: "clear-rubble",
      target: extractRecoveryTarget(lower)
    };
  }

  if (
    lower === "donate wood" ||
    lower.includes("bring wood") ||
    lower.includes("give wood") ||
    lower.includes("donate lumber") ||
    lower.includes("bring lumber")
  ) {
    return {
      type: "repair",
      raw: original,
      recoveryAction: "donate-wood",
      target: extractRecoveryTarget(lower)
    };
  }

  if (
    lower === "donate supplies" ||
    lower.includes("bring supplies") ||
    lower.includes("give supplies") ||
    lower.includes("donate materials") ||
    lower.includes("bring materials")
  ) {
    return {
      type: "repair",
      raw: original,
      recoveryAction: "donate-supplies",
      target: extractRecoveryTarget(lower)
    };
  }

  // =========================
  // SPECIAL RECOVERY-ERA ACTIONS
  // =========================
  if (
    lower.includes("inspect damage") ||
    lower.includes("check damage") ||
    lower.includes("look at the damage")
  ) {
    return {
      type: "inspect-recovery",
      raw: original,
      target: extractRecoveryTarget(lower)
    };
  }

  if (
    lower.includes("encourage workers") ||
    lower.includes("help workers") ||
    lower.includes("organize repairs")
  ) {
    return {
      type: "repair",
      raw: original,
      recoveryAction: "organize-repairs",
      target: extractRecoveryTarget(lower)
    };
  }

  // =========================
  // FALLBACK SAY DETECTION
  // =========================
  if (
    original.startsWith('"') ||
    original.startsWith("'")
  ) {
    return {
      type: "say",
      message: stripWrappingQuotes(original),
      raw: original
    };
  }

  // =========================
  // UNKNOWN
  // =========================
  return {
    type: "unknown",
    raw: original
  };
}

function extractSpeechMessage(original) {
  const trimmed = (original || "").trim();

  if (trimmed.toLowerCase().startsWith("say")) {
    return trimmed.slice(3).replace(/^[:\s]+/, "").trim();
  }

  if (trimmed.toLowerCase().startsWith("tell")) {
    return trimmed.slice(4).replace(/^[:\s]+/, "").trim();
  }

  return stripWrappingQuotes(trimmed);
}

function stripWrappingQuotes(text) {
  if (!text) return "";

  let result = text.trim();

  if (
    (result.startsWith('"') && result.endsWith('"')) ||
    (result.startsWith("'") && result.endsWith("'"))
  ) {
    result = result.slice(1, -1).trim();
  }

  return result;
}

function hasAny(text, phrases) {
  return phrases.some(phrase => text.includes(phrase));
}

function extractTarget(lower) {
  if (lower.includes("goblin")) return "goblin";
  if (lower.includes("guard")) return "guard";
  if (lower.includes("thief")) return "thief";
  if (lower.includes("hunter")) return "hunter";
  if (lower.includes("patron")) return "patron";
  return null;
}

function extractRecoveryTarget(lower) {
  if (lower.includes("bar") || lower.includes("tavern")) return "bar";
  if (lower.includes("village")) return "village";
  if (lower.includes("street")) return "street";
  if (lower.includes("forest")) return "forest";
  return null;
}

module.exports = { interpretAction };