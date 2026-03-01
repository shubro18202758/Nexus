"""
MCP Server — Expose Nanobot skills as MCP-compatible tools.

This creates a stdio-based MCP server that any MCP client can connect to.
Each Nanobot skill's methods become individual MCP tools.

Usage:
    python -m mcp.server
    
Or add to MCP config:
    {
        "mcpServers": {
            "nexus-nanobot": {
                "command": "python",
                "args": ["-m", "mcp.server"],
                "cwd": "neural_engine/"
            }
        }
    }
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from nanobot.types import SkillManifest


def _manifest_to_mcp_tools(manifest: SkillManifest) -> list[dict]:
    """Convert a SkillManifest into MCP tool definitions."""
    tools = []
    for method in manifest.methods:
        # Build JSON Schema for parameters
        properties = {}
        required = []

        for param_name, param_spec in method.parameters.items():
            prop: dict = {
                "type": param_spec.type,
                "description": param_spec.description,
            }
            if param_spec.default is not None:
                prop["default"] = param_spec.default

            properties[param_name] = prop

            if param_spec.required:
                required.append(param_name)

        tool = {
            "name": f"{manifest.name}__{method.name}",
            "description": f"[{manifest.name}] {method.description}",
            "inputSchema": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        }
        tools.append(tool)

    return tools


async def run_mcp_server():
    """Run a stdio-based MCP server exposing all Nanobot skills."""
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env.local"))
    load_dotenv()

    from nanobot.core import Nanobot

    bot = Nanobot.get_instance()
    await bot.startup()

    # Build tool registry
    all_tools = []
    tool_map: dict[str, tuple[str, str]] = {}  # tool_name -> (skill_name, method_name)

    for skill_name, skill in bot._skills.items():
        manifest = skill.manifest()
        tools = _manifest_to_mcp_tools(manifest)
        for t in tools:
            tool_map[t["name"]] = (skill_name, t["name"].split("__")[1])
        all_tools.extend(tools)

    # MCP protocol over stdio
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await asyncio.get_event_loop().connect_read_pipe(lambda: protocol, sys.stdin)

    w_transport, w_protocol = await asyncio.get_event_loop().connect_write_pipe(
        asyncio.streams.FlowControlMixin, sys.stdout
    )
    writer = asyncio.StreamWriter(w_transport, w_protocol, reader, asyncio.get_event_loop())

    async def send_response(response: dict):
        data = json.dumps(response)
        header = f"Content-Length: {len(data)}\r\n\r\n"
        writer.write(header.encode() + data.encode())
        await writer.drain()

    # Read header + body MCP messages
    while True:
        try:
            # Read Content-Length header
            header_line = await reader.readline()
            if not header_line:
                break

            header = header_line.decode().strip()
            if header.startswith("Content-Length:"):
                length = int(header.split(":")[1].strip())
                await reader.readline()  # Empty line
                body = await reader.readexactly(length)
                message = json.loads(body.decode())
            else:
                continue

            method = message.get("method", "")
            msg_id = message.get("id")

            if method == "initialize":
                await send_response({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {"listChanged": False}},
                        "serverInfo": {
                            "name": "nexus-nanobot",
                            "version": "1.0.0",
                        },
                    },
                })

            elif method == "tools/list":
                await send_response({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {"tools": all_tools},
                })

            elif method == "tools/call":
                tool_name = message.get("params", {}).get("name", "")
                arguments = message.get("params", {}).get("arguments", {})

                if tool_name in tool_map:
                    skill_name, method_name = tool_map[tool_name]
                    skill = bot._skills[skill_name]
                    result = await skill.execute(method_name, arguments)

                    await send_response({
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": json.dumps(
                                        result.data if result.success else {"error": result.error},
                                        default=str,
                                    ),
                                }
                            ],
                            "isError": not result.success,
                        },
                    })
                else:
                    await send_response({
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "error": {
                            "code": -32601,
                            "message": f"Tool not found: {tool_name}",
                        },
                    })

            elif method == "notifications/initialized":
                pass  # Client acknowledged init

            else:
                if msg_id:
                    await send_response({
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "error": {
                            "code": -32601,
                            "message": f"Method not found: {method}",
                        },
                    })

        except asyncio.IncompleteReadError:
            break
        except Exception as e:
            sys.stderr.write(f"MCP Error: {e}\n")
            continue

    await bot.shutdown()


if __name__ == "__main__":
    asyncio.run(run_mcp_server())
