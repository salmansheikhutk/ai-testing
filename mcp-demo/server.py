"""Minimal MCP server: two tools, one resource, one prompt. Runs over stdio."""

from mcp.server.mcpserver import MCPServer

mcp = MCPServer("demo")


@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two integers."""
    return a + b


@mcp.tool()
def echo(text: str, shout: bool = False) -> str:
    """Return the text, optionally upper-cased."""
    return text.upper() if shout else text


@mcp.resource("config://version")
def version() -> str:
    """Server version string."""
    return "demo-server 0.1.0"


@mcp.prompt()
def summarize(topic: str) -> str:
    """A prompt template the client can fetch."""
    return f"Summarize the key facts about {topic} in three bullet points."


if __name__ == "__main__":
    mcp.run()  # stdio transport by default
