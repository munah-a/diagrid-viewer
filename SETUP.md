# Revit + Claude MCP Integration Setup

## Architecture

```
Claude Desktop  →  MCP Server (TypeScript/Node.js)  →  WebSocket  →  Revit Plugin (C#)  →  Revit API
```

## Components Installed

### 1. Revit Plugin (both 2025 & 2026)
- Location: `%AppData%\Autodesk\Revit\Addins\<year>\`
- Files: `mcp-servers-for-revit.addin`, `revit-mcp.addin`, `revit_mcp_plugin/`
- Source: https://github.com/mcp-servers-for-revit/mcp-servers-for-revit v1.0.0

### 2. MCP Server (Node.js)
- Package: `mcp-server-for-revit` (npm)
- Configured in: `%AppData%\Claude\claude_desktop_config.json`

### 3. Claude Desktop Config
```json
{
  "mcpServers": {
    "revit": {
      "command": "npx",
      "args": ["-y", "mcp-server-for-revit"]
    }
  }
}
```

## How to Use

1. Open Revit (2025 or 2026) — the plugin loads automatically
2. Open Claude Desktop — the MCP server starts automatically
3. Ask Claude to interact with your Revit model

## Available Tools (25)

### Read
- Get current view info
- Get elements by category/ID
- Get family types
- Get selected elements
- Get material quantities
- Get model statistics

### Create
- Walls, doors, windows (point/line-based)
- Floors, roofs (surface-based)
- Beams, structural framing
- Grids, levels, rooms, dimensions

### Modify
- Delete elements
- Set/get parameters
- Color overrides
- Visibility control

### Advanced
- Execute custom C# code in Revit
- Export room data
- Store/query project metadata

## Troubleshooting

- If Claude can't connect to Revit, ensure Revit is open and the plugin loaded (check Add-Ins tab)
- If npm/npx fails, ensure Node.js 18+ and VS Build Tools are installed
- Restart Claude Desktop after config changes
