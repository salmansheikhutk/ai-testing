"""Play Super Mario Bros yourself with the keyboard.

Controls:  Arrow keys = move / crouch / enter pipes
           Space = jump           Left Shift = run (hold)
           F = fireball (needs Fire Flower)
           Enter = start / pause  Esc = quit

Usage:     python play_mario.py [level] [--invincible]
           e.g. python play_mario.py 4-2 --invincible
           In 8-4, yellow arrows point to the pipes that lead forward.
"""
import itertools
import sys
import warnings

warnings.filterwarnings("ignore")

import gym_super_mario_bros
import numpy as np
from nes_py.app.play_human import play_human
from pyglet.window import key

# NES controller bits
RIGHT, LEFT, DOWN, UP, START, SELECT, B, A = (1 << i for i in range(7, -1, -1))

KEYS = {
    key.RIGHT: RIGHT,
    key.LEFT: LEFT,
    key.DOWN: DOWN,
    key.UP: UP,
    ord("\r"): START,
    ord(" "): A,
}
RUN_KEY = key.LSHIFT
FIRE_KEY = key.F


def keys_to_action():
    """Map every combination of held keys to the NES controller byte."""
    mapping = {}
    all_keys = list(KEYS) + [RUN_KEY, FIRE_KEY]
    for n in range(len(all_keys) + 1):
        for held in itertools.combinations(all_keys, n):
            byte = 0
            for k in held:
                byte |= KEYS.get(k, 0)
            # Run and fire both use B, and a fireball needs a *fresh* B press.
            # XOR makes F release B while running, so tapping F always throws.
            if (RUN_KEY in held) != (FIRE_KEY in held):
                byte |= B
            mapping[tuple(sorted(held))] = byte
    return mapping


args = sys.argv[1:]
invincible = "--invincible" in args
levels = [a for a in args if not a.startswith("--")]
level = levels[0] if levels else "1-1"

# .unwrapped skips gym 0.26's wrappers, which expect the new 5-value step API
# that nes-py's built-in keyboard player doesn't use.
env = gym_super_mario_bros.make(f"SuperMarioBros-{level}-v0").unwrapped
env.get_keys_to_action = keys_to_action

if invincible:
    # Rewrite RAM before every frame: keep Star power on (enemies can't hurt
    # Mario), keep the clock's hundreds digit at 9 so time never runs out, and
    # put an invisible floor at ground level so pits and lava can't kill him.
    STAR_TIMER, CLOCK_HUNDREDS = 0x079F, 0x07F8
    GAME_STATE, NORMAL = 0x000E, 0x08
    Y_SCREEN, Y_POS, Y_SPEED, Y_SUBSPEED, AIR_STATE = 0xB5, 0xCE, 0x9F, 0x0433, 0x1D
    FLOOR_Y = 0xB0  # Mario's y when standing on normal ground
    step = env.step

    def invincible_step(action):
        ram = env.ram
        ram[STAR_TIMER] = 0xFF
        ram[CLOCK_HUNDREDS] = 9
        # Below ground level and falling (speed isn't negative): land him on
        # the floor. Only while playing normally, so pipe entry still works.
        if (ram[GAME_STATE] == NORMAL and ram[Y_SCREEN] == 1
                and ram[Y_POS] > FLOOR_Y and ram[Y_SPEED] < 0x80):
            ram[Y_POS] = FLOOR_Y
            ram[Y_SPEED] = ram[Y_SUBSPEED] = 0
            ram[AIR_STATE] = 0  # on the ground, so he can jump again
        return step(action)

    env.step = invincible_step

if level == "8-4":
    # 8-4 is a maze: each room has one pipe that leads on, and missing it
    # loops you back. Draw a bobbing arrow at the way forward. Positions were
    # found by testing every pipe. A loop moves Mario back 1024 pixels but keeps
    # the scenery, so room 1's pipe (1296) also shows up at 272 right after one.
    CORRECT_PIPES = {272, 1296, 2432, 3648}
    UNDERWATER_EXIT = (1084, 128)  # tip of a right arrow, at the sideways pipe
    AXE = (4824, 124)              # tip of a down arrow, above Bowser's axe
    AREA_TYPE, WATER, CASTLE = 0x074E, 0, 3
    CAM_PAGE, CAM_X = 0x071A, 0x071C
    BLOCK_BUFFERS = (0x0500, 0x05D0)  # two 16x13 grids of 16px blocks, one per page
    WARP_PIPE_TOP_LEFT = 0x10         # block id of an enterable pipe's top-left

    ARROW_ART = [
        "..XXXXX..",
        "..XOOOX..",
        "..XOOOX..",
        "..XOOOX..",
        "XXXOOOXXX",
        "XOOOOOOOX",
        ".XOOOOOX.",
        "..XOOOX..",
        "...XOX...",
        "....X....",
    ]
    COLORS = {"X": (0, 0, 0), "O": (255, 230, 0)}
    DOWN_ARROW = np.kron(
        np.array([[COLORS.get(c, (-1, -1, -1)) for c in row] for row in ARROW_ART]),
        np.ones((2, 2, 1), int),
    )  # 20 tall x 18 wide; -1 marks transparent pixels
    RIGHT_ARROW = np.rot90(DOWN_ARROW)

    def draw(screen, sprite, left, top):
        """Paint sprite onto the screen at (left, top), clipped to the edges."""
        h, w, _ = sprite.shape
        for sy in range(max(0, -top), min(h, 240 - top)):
            for sx in range(max(0, -left), min(w, 256 - left)):
                if sprite[sy, sx, 0] >= 0:
                    screen[top + sy, left + sx] = sprite[sy, sx]

    def pipe_top_y(ram, x):
        """Screen y of an enterable pipe top in the column at world x, or None."""
        buffer = BLOCK_BUFFERS[(x >> 8) & 1]
        for row in range(13):
            if ram[buffer + row * 16 + ((x >> 4) & 15)] == WARP_PIPE_TOP_LEFT:
                return 32 + row * 16
        return None

    frame = 0
    step_without_arrows = env.step

    def arrow_step(action):
        global frame
        result = step_without_arrows(action)
        frame += 1
        ram, screen = env.ram, env.screen
        cam = int(ram[CAM_PAGE]) * 256 + int(ram[CAM_X])
        bob = 2 if frame // 10 % 2 else 0
        if ram[AREA_TYPE] == WATER:
            x, y = UNDERWATER_EXIT
            draw(screen, RIGHT_ARROW, x - cam - 20 - bob, y - 9)
        elif ram[AREA_TYPE] == CASTLE:
            for x in CORRECT_PIPES:
                # Only where that pipe is actually on screen right now.
                if cam - 32 < x < cam + 256 and (top := pipe_top_y(ram, x)) is not None:
                    draw(screen, DOWN_ARROW, x + 16 - cam - 9, top - 22 - bob)
            x, y = AXE
            draw(screen, DOWN_ARROW, x - cam - 9, y - 20 - bob)
        return result

    env.step = arrow_step

    # The gym env ends the episode the moment Mario grabs the axe, which skips
    # the ending. From then on, run the emulator directly and never report
    # done, so the ending plays out. The cheats and arrows stay off from here.
    ending = False
    step_until_axe = env.step

    def ending_step(action):
        global ending
        if ending:
            env._frame_advance(action)
            return env.screen, 0.0, False, {}
        state, reward, done, info = step_until_axe(action)
        if done and info["flag_get"]:
            ending, done = True, False
        return state, reward, done, info

    env.step = ending_step

play_human(env)
