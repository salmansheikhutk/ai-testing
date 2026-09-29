"""Play Super Mario Bros yourself with the keyboard.

Controls:  Arrow keys = move / crouch / enter pipes
           Space = jump           Left Shift = run (hold)
           F = fireball (needs Fire Flower)
           Enter = start / pause  Esc = quit
"""
import itertools
import sys
import warnings

warnings.filterwarnings("ignore")

import gym_super_mario_bros
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


level = sys.argv[1] if len(sys.argv) > 1 else "1-1"

# .unwrapped skips gym 0.26's wrappers, which expect the new 5-value step API
# that nes-py's built-in keyboard player doesn't use.
env = gym_super_mario_bros.make(f"SuperMarioBros-{level}-v0").unwrapped
env.get_keys_to_action = keys_to_action
play_human(env)
