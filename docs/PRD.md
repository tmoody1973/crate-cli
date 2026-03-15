# Crate Product Doc

This is the current product-facing description of Crate. Historical drafts live in [archive/](archive/).

## Product Statement

Crate is a terminal-first music research agent and MCP server. It helps people answer music questions that usually require multiple tabs, multiple databases, and careful cross-referencing.

The product is not just "chat with an LLM about music." The value comes from structured tool access, source synthesis, local persistence, and workflow support for people who care about credits, pressings, scenes, influence, and provenance.

## Primary Users

- DJs and radio programmers doing show prep, track research, and set building
- Record collectors identifying pressings, valuing records, and tracing labels
- Music journalists and bloggers building sourced background research
- Serious listeners exploring scenes, lineages, and artist connections
- Other AI clients using Crate's tools over MCP

## Core Jobs To Be Done

- Research an artist, release, label, or scene across multiple sources
- Verify tracks before recommending, saving, or playing them
- Trace artistic influence and cache those relationships locally
- Save useful context into collections, playlists, and scratchpad logs
- Publish or reuse the same tool stack through MCP

## Product Modes

### Interactive CLI

The CLI is the primary product surface. Users ask natural-language questions, see progress in a terminal UI, and can control playback without leaving the session.

### MCP Server

Crate can also run as a stdio MCP server so other AI clients can call the same tools. This makes Crate useful beyond its own UI.

### Marketing / Demo Website

The `www/` app is a separate Next.js site used for product marketing and demo pages. It is not the runtime used by the CLI.

## Current Feature Surface

- Cross-source research over music metadata, news, web search, and influence sources
- In-terminal playback through `yt-dlp` and `mpv`
- Local persistence for collection, playlists, influence cache, and scratchpad logs
- Optional memory and publishing integrations
- Query routing between chat, lookup, and research flows

## Constraints And Non-Goals

- Crate is a single-user local application, not a hosted multi-user SaaS product
- It is a research tool, not a DAW, streaming service, or library manager replacement
- Some integrations rely on optional keys and may not be available in every install
- Marketing claims, README copy, and website copy must be kept aligned with the actual codebase
