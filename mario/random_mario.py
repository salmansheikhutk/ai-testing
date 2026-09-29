"""Watch an AI that presses random buttons play Super Mario Bros 1-1."""
import warnings

warnings.filterwarnings("ignore")

import gym_super_mario_bros
from gym_super_mario_bros.actions import SIMPLE_MOVEMENT
from nes_py.wrappers import JoypadSpace

env = gym_super_mario_bros.make(
    "SuperMarioBros-1-1-v0", apply_api_compatibility=True, render_mode="human"
)
env = JoypadSpace(env, SIMPLE_MOVEMENT)

obs, info = env.reset()
best_x = 0
episode = 1
for step in range(5000):
    action = env.action_space.sample()  # random button press
    obs, reward, terminated, truncated, info = env.step(action)
    best_x = max(best_x, info["x_pos"])
    if terminated or truncated:
        print(f"Run {episode} over. Farthest x_pos so far: {best_x} (flag is ~3160)")
        episode += 1
        obs, info = env.reset()
env.close()
