# Conversation Log

This file tracks the ongoing conversation and task context for the you-stile project.

## Project Overview

Two PM2-managed services are running:
- **stilist** (id=0): Node.js backend on port 3001
- **soulmate** (id=1): Python Telegram bot (@Soulmate2025_bot)

## Current Status

### stilist
- Running normally
- YooKassa payment integration working (payments created and confirmed)
- Image generation API responding with status 200
- Astro endpoint receiving requests (birthDateRaw sometimes empty)

### soulmate
- Running with intermittent Telegram API issues (Bad Gateway, flood control)
- `pydub` module missing — ambient audio features unavailable
- Photo generation working (flux.2-pro model, status 200)

## Notes

- `pydub` needs to be installed: `pip install pydub`
- Flood control on GetUpdates is transient; aiogram handles retries automatically
- Bad Gateway errors from Telegram are also transient