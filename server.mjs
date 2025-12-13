import express from "express";
import multer from "multer";
import fs from "fs";
import {
  parseWithGemma,
  parseWithOllamaLocal,
  parseWithOllamaCloud,
  parseWithGemini,
} from "./llm.mjs";
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static("public"));

// shared helper: pass image buffer to the chosen parser function
async function handleParseRequest(req, res, parserFn) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded in field `invoice`' });

  const imageBuffer = req.file.buffer;
  try {
    // merge options from form fields (req.body) if present
    const opts = { ...(req.body || {}) };

    // LLM parsing (OCR is done internally by the parser)
    const invoiceJson = await parserFn(imageBuffer, opts);

    res.json(invoiceJson);
  } catch (err) {
    console.error('Parse error:', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
}

// Default endpoint (keeps backward compatibility) — uses parseWithGemma
app.post('/parse', upload.single('invoice'), async (req, res) => {
  return handleParseRequest(req, res, async (text, opts) => parseWithGemma(text, opts));
});

// Endpoint: Ollama local (HTTP-compatible local Ollama)
app.post('/parse/ollama-local', upload.single('invoice'), async (req, res) => {
  return handleParseRequest(req, res, async (text, opts) => parseWithOllamaLocal(text, opts));
});

// Endpoint: Ollama Cloud (requires opts.baseUrl or OLLAMA_CLOUD_URL and optional apiKey)
app.post('/parse/ollama-cloud', upload.single('invoice'), async (req, res) => {
  return handleParseRequest(req, res, async (text, opts) => parseWithOllamaCloud(text, opts));
});

// Endpoint: Google Gemini via @google/genai or REST fallback
app.post('/parse/gemini', upload.single('invoice'), async (req, res) => {
  return handleParseRequest(req, res, async (text, opts) => parseWithGemini(text, opts));
});

// Endpoint: legacy Gemma (kept for comparison/testing)
app.post('/parse/gemma', upload.single('invoice'), async (req, res) => {
  return handleParseRequest(req, res, async (text, opts) => parseWithGemma(text, opts));
});

app.listen(3000, () =>
  console.log("🚀 Server running at http://localhost:3000")
);
