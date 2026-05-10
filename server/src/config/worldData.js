function createBaseLocationState() {
  return {
    activeEvent: null,
    recentHistory: [],
    npcs: [],
    recovery: {
      status: "normal", // normal | damaged | repairing
      recoveryType: null,
      repairEndsAtTurn: null,
      repairEndsAtDay: null,
      repairEndsAtHour: null,
      contributions: 0
    },
    stateFlags: {}
  };
}

const world = {
  village: {
    name: "Greyhaven",
    description: "You are in Greyhaven Village, the main settlement. Paths lead to the Bar, Street, Outer Farms, and Blackwood Forest.",
    paths: ["bar", "street", "outerfarms", "blackwood"]
  },
  bar: {
    description: "You are inside the Bar. It smells like old ale and warm food.",
    paths: ["village"]
  },
  street: {
    description: "You stand on the Street. The forest lies ahead.",
    paths: ["village", "forest"]
  },
    forest: {
    description: "You are in the Forest.",
    paths: ["street"]
  },

  outerfarms: {
    name: "Outer Farms",
    description: "You stand among the Outer Farms that feed Greyhaven. If this place falls, the village may starve.",
    paths: ["village", "ashpass"]
  },

  blackwood: {
    name: "Blackwood Forest",
    description: "You enter Blackwood Forest. The trees are thick, dark, and strangely quiet.",
    paths: ["village", "hollowruins"]
  },

  ashpass: {
    name: "Ash Pass",
    description: "You reach Ash Pass, a cold mountain route covered in grey dust and old bones.",
    paths: ["outerfarms"]
  },

  hollowruins: {
    name: "Hollow Ruins",
    description: "You stand before the Hollow Ruins. Something ancient waits beneath the broken stone.",
    paths: ["blackwood"]
  }
};

function createNewWorldState() {
  return {
    time: {
      day: 1,
      hour: 8,
      turn: 0
    },

    goblinAlive: true,
    goblinHp: 40,
    goblinCorpses: 0,
    forestPotionFound: false,

    eventLog: [
      "The world begins. The village waits in silence."
    ],

    locationStates: {
      village: {
        ...createBaseLocationState(),
        npcs: ["Old Villager", "Worried Farmer", "Passing Guard"],
        hp: 100,
        maxHp: 100,
        status: "stable",
        rebuildProject: null,
        renameVote: null,
        stateFlags: {
          crowdUneasy: false,
          hunterSavedRumor: false,
          hunterAbandonedRumor: false,
          tavernTroubleRumor: false,
          rebuildingActive: false,
          rebuildingEndsAtTurn: null
        }
      },

      bar: {
        ...createBaseLocationState(),
        npcs: ["Bartender Rowan", "Drunk Patron", "Traveling Merchant", "Hooded Stranger"],
        stateFlags: {
          barDamaged: false,
          bartenderHostileTo: [],
          barOnFire: false,
          thiefActive: false,
          guardsWatchingBar: false,

          barRepairing: false,
          barClosedUntilTurn: null,
          barClosedUntilDay: null,
          barClosedUntilHour: null,
          repairContributionPoints: 0
        }
      },

      street: {
        ...createBaseLocationState(),
        npcs: ["Town Guard", "Cart Driver", "Beggar"],
        stateFlags: {
          cartCrashed: false,
          guardsAlert: false,
          blockedUntilTurn: null
        }
      },

      forest: {
        ...createBaseLocationState(),
        npcs: ["Goblin"],
        stateFlags: {
          woundedHunterPresent: false,
          goblinReinforcementsIncoming: false,
          forestDanger: 0,
          reinforcementAmbushPending: false,
          forestStayCounter: 0,
          forestSpawnCooldown: 0,
          lastForestEventType: null,

          goblinCorpsesDecayAtTurn: null
        }
      },

      outerfarms: {
        ...createBaseLocationState(),
        npcs: ["Farmhand", "Old Farmer", "Hungry Dog"],
        hp: 100,
        maxHp: 100,
        status: "stable",
        rebuildProject: null,
        renameVote: null,
        stateFlags: {
          cropsDamaged: false,
          foodShortage: false
        }
      },

      blackwood: {
        ...createBaseLocationState(),
        npcs: ["Blackwood Wolf"],
        stateFlags: {
          forestDanger: 1,
          strangeWhispers: false
        }
      },

      ashpass: {
        ...createBaseLocationState(),
        npcs: [],
        stateFlags: {
          passBlocked: false,
          ashStormActive: false
        }
      },

      hollowruins: {
        ...createBaseLocationState(),
        npcs: [],
        stateFlags: {
          sealedDoorFound: false,
          ancientPresenceAwake: false
        }
      }
    },

    globalState: {
      villagersOnEdge: false,
      recentViolence: 0,
      guardsAlertLevel: 0,
      hunterSavedBy: null,
      hunterAbandonedBy: null
    }
  };
}

module.exports = {
  world,
  createBaseLocationState,
  createNewWorldState
};