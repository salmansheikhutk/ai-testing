"""Spawn server.py as a subprocess and exercise it over stdio.

Run: .venv/bin/python test_client.py
"""

import asyncio
import sys

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


async def main() -> None:
    params = StdioServerParameters(command=sys.executable, args=["server.py"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            init = await session.initialize()
            print("server:", init.server_info.name, "| protocol:", init.protocol_version)

            tools = await session.list_tools()
            print("tools:", [t.name for t in tools.tools])

            result = await session.call_tool("add", {"a": 2, "b": 3})
            print("add(2, 3) ->", result.content[0].text)

            result = await session.call_tool("echo", {"text": "hi", "shout": True})
            print("echo('hi', shout=True) ->", result.content[0].text)

            res = await session.read_resource("config://version")
            print("resource config://version ->", res.contents[0].text)

            prompt = await session.get_prompt("summarize", {"topic": "MCP"})
            print("prompt summarize ->", prompt.messages[0].content.text)


if __name__ == "__main__":
    asyncio.run(main())
