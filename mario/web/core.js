// Super Mario Bros. level select, cheats and 8-4 maze arrows for the jsnes
// emulator. Ported from play_mario.py; every address is in the NES's 2KB RAM.
(function (root) {
  "use strict";

  const RAM = {
    WORLD: 0x075f, STAGE: 0x075c, AREA: 0x0760,
    CLOCK: 0x07f8,            // three digits: hundreds, tens, ones
    OPER_MODE: 0x0770,        // 0 title screen, 1 playing, 2 ending, 3 game over
    STAR_TIMER: 0x079f,
    LIVES: 0x075a,
    GAME_STATE: 0x000e, NORMAL: 0x08,
    X_PAGE: 0x006d, X_POS: 0x0086,
    Y_SCREEN: 0x00b5, Y_POS: 0x00ce, Y_SPEED: 0x009f, Y_SUBSPEED: 0x0433,
    AIR_STATE: 0x001d,        // 0 = on the ground
    CAM_PAGE: 0x071a, CAM_X: 0x071c,
    AREA_TYPE: 0x074e,        // 0 water, 1 ground, 2 underground, 3 castle
  };
  const FLOOR_Y = 0xb0;       // Mario's y when standing on normal ground
  const BLOCK_BUFFERS = [0x0500, 0x05d0]; // two 16x13 grids of 16px blocks
  const WARP_PIPE_TOP_LEFT = 0x10;

  // 8-4: the pipes that lead forward, found by testing every pipe. Missing one
  // loops Mario back 1024 pixels with the same scenery, so room 1's pipe
  // (1296) also shows up at 272 right after a loop.
  const MAZE_PIPES = [272, 1296, 2432, 3648];
  const UNDERWATER_EXIT = { x: 1084, y: 128 }; // tip of a right-pointing arrow
  const AXE = { x: 4824, y: 124 };             // tip of a down-pointing arrow

  // jsnes button ids
  const BTN = { A: 0, B: 1, SELECT: 2, START: 3, UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7 };

  const mem = (nes) => nes.cpu.mem;

  function setButtons(nes, held) {
    for (const id of Object.values(BTN)) {
      if (held.includes(id)) nes.buttonDown(1, id);
      else nes.buttonUp(1, id);
    }
  }

  function clock(m) {
    return m[RAM.CLOCK] * 100 + m[RAM.CLOCK + 1] * 10 + m[RAM.CLOCK + 2];
  }

  function marioX(m) {
    return m[RAM.X_PAGE] * 256 + m[RAM.X_POS];
  }

  // Skip the title screen and drop straight into world-stage: press Start with
  // the level numbers overwritten, then keep them until Mario can move.
  function startLevel(nes, world, stage) {
    const m = mem(nes);
    // Worlds 1, 2, 4 and 7 have an extra intro area before stage 2.
    const area = [1, 2, 4, 7].includes(world) && stage >= 2 ? stage + 1 : stage;
    const write = () => {
      m[RAM.WORLD] = world - 1;
      m[RAM.STAGE] = stage - 1;
      m[RAM.AREA] = area - 1;
    };
    const press = (held) => { setButtons(nes, held); nes.frame(); };
    // Let the game boot and clear RAM (jsnes powers on with every byte 0xFF).
    for (let i = 0; i < 40; i++) press([]);
    // Start looks up the level's data from these numbers on the frame it's
    // pressed, so write them just before.
    for (let i = 0; i < 300 && m[RAM.OPER_MODE] !== 1; i++) {
      write();
      press([BTN.START]);
      press([]);
    }
    // The title screen's demo counts as playing, so wait for that to stop
    // before waiting for the real level to start.
    for (let i = 0; i < 30 && m[RAM.GAME_STATE] === RAM.NORMAL; i++) {
      write();
      press([]);
    }
    for (let i = 0; i < 600 && m[RAM.GAME_STATE] !== RAM.NORMAL; i++) {
      write();
      press([]);
    }
    setButtons(nes, []);
  }

  // Call before every frame. cheats: {invincible, floor, time, lives}
  function applyCheats(nes, cheats) {
    const m = mem(nes);
    const playing = m[RAM.GAME_STATE] === RAM.NORMAL;
    // Star power: enemies can't hurt Mario. Writing the timer directly
    // doesn't start the star music.
    if (cheats.invincible) m[RAM.STAR_TIMER] = 0xff;
    // Only while playing, so the end-of-level countdown can finish.
    if (cheats.time && playing && clock(m) > 0) m[RAM.CLOCK] = 9;
    if (cheats.lives && m[RAM.LIVES] < 2) m[RAM.LIVES] = 2;
    // Invisible floor at ground level over pits and lava: below ground and
    // falling (speed isn't negative) puts him back on it, able to jump.
    if (cheats.floor && playing && m[RAM.Y_SCREEN] === 1 &&
        m[RAM.Y_POS] > FLOOR_Y && m[RAM.Y_SPEED] < 0x80) {
      m[RAM.Y_POS] = FLOOR_Y;
      m[RAM.Y_SPEED] = 0;
      m[RAM.Y_SUBSPEED] = 0;
      m[RAM.AIR_STATE] = 0;
    }
  }

  // Screen y of an enterable pipe top in the column at world x, or null.
  function pipeTopY(m, x) {
    const buffer = BLOCK_BUFFERS[(x >> 8) & 1];
    for (let row = 0; row < 13; row++) {
      if (m[buffer + row * 16 + ((x >> 4) & 15)] === WARP_PIPE_TOP_LEFT) return 32 + row * 16;
    }
    return null;
  }

  // Arrows to draw this frame, in screen pixels: [{x, y, dir}] where (x, y)
  // is the arrow's tip and dir is "down" or "right". Empty outside 8-4.
  function mazeArrows(nes) {
    const m = mem(nes);
    if (m[RAM.WORLD] !== 7 || m[RAM.STAGE] !== 3) return [];
    const cam = m[RAM.CAM_PAGE] * 256 + m[RAM.CAM_X];
    const arrows = [];
    if (m[RAM.AREA_TYPE] === 0) {
      arrows.push({ x: UNDERWATER_EXIT.x - cam, y: UNDERWATER_EXIT.y, dir: "right" });
    } else if (m[RAM.AREA_TYPE] === 3) {
      for (const x of MAZE_PIPES) {
        if (x <= cam - 32 || x >= cam + 256) continue; // only pipes on screen
        const top = pipeTopY(m, x);
        if (top !== null) arrows.push({ x: x + 16 - cam, y: top - 2, dir: "down" });
      }
      if (AXE.x > cam - 16 && AXE.x < cam + 272) arrows.push({ x: AXE.x - cam, y: AXE.y, dir: "down" });
    }
    return arrows;
  }

  const api = { RAM, BTN, setButtons, startLevel, applyCheats, mazeArrows, marioX, clock };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MarioCore = api;
})(typeof window !== "undefined" ? window : globalThis);
