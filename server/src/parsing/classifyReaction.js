const { parseFlavor } = require("./flavorParser");

function classifyReaction(rawText) {
  const text = (rawText || "").toLowerCase().trim();
  const flavor = parseFlavor(text);

  if (!text) {
    return { intent: "unknown", text, flavor };
  }

  if (text.startsWith("say ")) {
    return { intent: "say", text, message: rawText.slice(4).trim(), flavor };
  }

  if (
    text.includes("attack") ||
    text.includes("hit") ||
    text.includes("strike") ||
    text.includes("kick") ||
    text.includes("punch") ||
    text.includes("stab") ||
    text.includes("slash") ||
    text.includes("shoot") ||
    text.includes("arrow") ||
    text.includes("bow") ||
    text.includes("snipe") ||
    text.includes("tackle")
  ) {
    return {
      intent: "attack",
      style: (text.includes("shoot") || text.includes("arrow") || text.includes("bow") || text.includes("snipe")) ? "ranged" : "melee",
      text,
      flavor
    };
  }

  if (
    text.includes("defend") ||
    text.includes("block") ||
    text.includes("brace") ||
    text.includes("protect") ||
    text.includes("shield")
  ) {
    return { intent: "defend", text, flavor };
  }

  if (
    text.includes("help") ||
    text.includes("save") ||
    text.includes("drag") ||
    text.includes("carry") ||
    text.includes("bandage") ||
    text.includes("stamp out") ||
    text.includes("put out") ||
    text.includes("kick the lantern")
  ) {
    return { intent: "help", text, flavor };
  }

  if (
    text.includes("talk") ||
    text.includes("calm") ||
    text.includes("convince") ||
    text.includes("persuade") ||
    text.includes("reason") ||
    text.includes("order") ||
    text.includes("shout") ||
    text.includes("explain")
  ) {
    return { intent: "talk", text, flavor };
  }

  if (text.includes("threaten") || text.includes("intimidate")) {
    return { intent: "threaten", text, flavor };
  }

  if (
    text.includes("run") ||
    text.includes("flee") ||
    text.includes("escape") ||
    text.includes("back away") ||
    text.includes("retreat")
  ) {
    return { intent: "flee", text, flavor };
  }

  if (
    text.includes("hide") ||
    text.includes("watch") ||
    text.includes("observe") ||
    text.includes("wait") ||
    text.includes("stand back")
  ) {
    return { intent: "observe", text, flavor };
  }

  return { intent: "unknown", text, flavor };
}

module.exports = { classifyReaction };