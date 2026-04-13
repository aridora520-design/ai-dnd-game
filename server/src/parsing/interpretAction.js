function interpretAction(input) {
  const text = (input || "").toLowerCase().trim();

  if (text.includes("threaten") || text.includes("intimidate")) {
    return { type: "threaten" };
  }

  if (text === "help") {
    return { type: "help" };
  }

  if (text === "look" || text.includes("look")) {
    return { type: "look" };
  }

  if (!text) {
    return { type: "unknown" };
  }

  if (text.startsWith("say ")) {
    return { type: "say", message: input.slice(4).trim() };
  }

  if (text === "say") {
    return { type: "say", message: "" };
  }

  if (text.includes("run") || text.includes("flee") || text.includes("escape")) {
    return { type: "run" };
  }

  if (text.includes("defend") || text.includes("block") || text.includes("brace")) {
    return { type: "defend" };
  }

  if (text.includes("drink") || text.includes("ale") || text.includes("beer")) {
    return { type: "drink" };
  }

  if (text.includes("eat") || text.includes("meal") || text.includes("food")) {
    return { type: "eat" };
  }

  if (
    text.includes("bar fight") ||
    text.includes("barfight") ||
    text.includes("start a fight") ||
    text.includes("punch someone in the bar") ||
    text.includes("fight in the bar")
  ) {
    return { type: "barfight" };
  }

  if (text.includes("search") || text.includes("look around") || text.includes("inspect")) {
    return { type: "search" };
  }

  if (
    text.includes("shoot") ||
    text.includes("arrow") ||
    text.includes("bow") ||
    text.includes("snipe")
  ) {
    return { type: "attack", style: "ranged", rawText: input };
  }

  if (
    text.includes("stab") ||
    text.includes("slash") ||
    text.includes("hit") ||
    text.includes("attack") ||
    text.includes("strike") ||
    text.includes("kick") ||
    text.includes("punch")
  ) {
    return { type: "attack", style: "melee", rawText: input };
  }

  return { type: "unknown", rawText: input };
}

module.exports = { interpretAction };