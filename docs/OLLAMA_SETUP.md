# Ollama Local AI Setup for BoardScope

## Overview
This guide explains how to use Ollama with Qwen as a local AI provider for BoardScope testing.

## Prerequisites
- Ollama installed (`ollama --version` to verify)
- At least 4GB free RAM for qwen2.5:7b

## Setup Steps

### 1. Pull the Qwen Model
```bash
ollama pull qwen2.5:7b
```

### 2. Start Ollama Server
Ollama typically runs automatically on macOS. If not:
```bash
ollama serve
```
The server runs on `http://localhost:11434` by default.

### 3. Configuration
The `.api_key` file is configured for Ollama:
```
provider=openai_compat
key=ollama
base_url=http://localhost:11434/v1
model=qwen2.5:7b
```

### 4. Start BoardScope Server
```bash
cd "boardscope_5 2"
node server.js
```

### 5. Access BoardScope
Open `http://localhost:8080` in your browser.

## Testing the AI Function
1. Open the boardview in your browser
2. Use the AI chat/analysis feature
3. The request will be proxied to your local Ollama instance

## Switching Back to Cloud AI
To use a cloud provider instead, update the `.api_key` file:

### Google Gemini (Free)
```
provider=google
key=YOUR_GOOGLE_API_KEY
model=gemini-2.0-flash
```

### Anthropic Claude
```
provider=anthropic
key=sk-ant-...
```

### OpenRouter
```
provider=openrouter
key=sk-or-...
model=anthropic/claude-sonnet-4
```

## Troubleshooting

### Ollama not running
```
Error: connect ECONNREFUSED 127.0.0.1:11434
```
Solution: Run `ollama serve` in a separate terminal.

### Model not found
```
Error: model "qwen2.5:7b" not found
```
Solution: Run `ollama pull qwen2.5:7b`

### Slow responses
Local models are slower than cloud APIs. The 7B model is fastest.
For better quality (but slower), try `qwen2.5:14b` (requires ~8GB RAM).

## Available Qwen Models
| Model | Size | RAM Required | Speed |
|-------|------|--------------|-------|
| qwen2.5:7b | 4.7GB | ~4GB | Fast |
| qwen2.5:14b | 9.1GB | ~8GB | Medium |
| qwen2.5:32b | 20GB | ~16GB | Slow |

## Architecture
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Browser    │────▶│  server.js   │────▶│   Ollama    │
│  (port 8080)│◀────│  (AI proxy)  │◀────│  (port 11434)│
└─────────────┘     └──────────────┘     └─────────────┘
                                                │
                                          ┌─────▼─────┐
                                          │ qwen2.5:7b│
                                          └───────────┘
```
