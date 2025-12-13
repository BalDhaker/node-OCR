import axios from "axios";
import Tesseract from "tesseract.js";
import { GoogleGenAI } from "@google/genai";

const PROMPT = `
You are an invoice data extraction engine.

Extract invoice data as VALID JSON ONLY.

Schema:
{
  "invoice_number": "",
  "invoice_date": "",
  "vendor_name": "",
  "vendor_gst": "",
  "customer_name": "",
  "customer_gst": "",
  "subtotal": "",
  "gst_amount": "",
  "total_amount": "",
  "line_items": [
    {
      "description": "",
      "quantity": "",
      "unit_price": "",
      "amount": ""
    }
  ]
}

Rules:
- Output ONLY JSON
- No markdown
- No explanation
- Empty string if missing
`;

// Helper: Run OCR on image buffer and return extracted text
async function runOCR(imageBuffer, opts = {}) {
  const language = opts.language || process.env.OCR_LANGUAGE || 'eng';
  const { data } = await Tesseract.recognize(imageBuffer, language, {
    logger: m => {
      if (opts.verbose) console.log(`[OCR] ${m.status}: ${m.progress || ''}`);
    },
  });
  return data?.text || '';
}

function extractJsonFromContent(content) {
  if (!content || typeof content !== 'string') throw new Error('No content to parse');
  const idx = content.indexOf('{');
  if (idx === -1) throw new Error('No JSON object found in model response');
  const jsonText = content.substring(idx);
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    // Try to be forgiving: remove trailing characters after last }
    const last = jsonText.lastIndexOf('}');
    if (last !== -1) {
      try {
        return JSON.parse(jsonText.substring(0, last + 1));
      } catch (err2) {
        throw new Error('Failed to parse JSON from model response');
      }
    }
    throw new Error('Failed to parse JSON from model response');
  }
}

/**
 * Parse invoice from image buffer using Gemma (local HTTP endpoint).
 * Performs OCR internally, then sends text to LLM for parsing.
 */
export async function parseWithGemma(imageBuffer, opts = {}) {
  const text = await runOCR(imageBuffer, opts);
  
  const response = await axios.post("http://localhost:11434/api/generate", {
    model: opts.model || "gemma3",
    prompt: `${PROMPT}\n\nInvoice Text:\n${text}\n\nJSON:`,
    stream: false,
  });

  // handle several possible response shapes
  const message = response?.data?.message || response?.data;
  const content = (message && (message.content || message)) || '';
  return extractJsonFromContent(content);
}

/**
 * Parse invoice from image buffer using Ollama Local HTTP API.
 * Performs OCR internally, then sends text to LLM for parsing.
 */
export async function parseWithOllamaLocal(imageBuffer, opts = {}) {
  const text = await runOCR(imageBuffer, opts);
  const model = opts.model || 'gemma3';
  const baseUrl = opts.baseUrl || process.env.OLLAMA_LOCAL_URL || 'http://localhost:11434';

  const body = {
    model,
    prompt: `${PROMPT}\n\nInvoice Text:\n${text}\n\nJSON:`,
    stream: false,
  };

  const response = await axios.post(`${baseUrl.replace(/\/$/, '')}/api/generate`, body, {
    timeout: opts.timeout || 120000,
  });

  const message = response?.data?.message || response?.data;
  const content = (message && (message.content || message)) || '';
  return extractJsonFromContent(content);
}

/**
 * Parse invoice from image buffer using Ollama Cloud HTTP API.
 * Performs OCR internally, then sends text to LLM for parsing.
 * Requires: opts.baseUrl or OLLAMA_CLOUD_URL, and optional opts.apiKey or OLLAMA_API_KEY
 */
export async function parseWithOllamaCloud(imageBuffer, opts = {}) {
  const text = await runOCR(imageBuffer, opts);
  const model = opts.model || 'gemma3';
  const baseUrl = opts.baseUrl || process.env.OLLAMA_CLOUD_URL;
  const apiKey = opts.apiKey || process.env.OLLAMA_API_KEY;

  if (!baseUrl) throw new Error('OLLAMA cloud baseUrl not provided (opts.baseUrl or OLLAMA_CLOUD_URL)');

  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body = {
    model,
    prompt: `${PROMPT}\n\nInvoice Text:\n${text}\n\nJSON:`,
    stream: false,
  };

  const response = await axios.post(`${baseUrl.replace(/\/$/, '')}/api/generate`, body, { headers, timeout: opts.timeout || 120000 });

  const message = response?.data?.message || response?.data;
  const content = (message && (message.content || message)) || '';
  return extractJsonFromContent(content);
}

/**
 * Parse invoice from image buffer using Google Gemini via @google/genai or REST fallback.
 * Performs OCR internally, then sends text to LLM for parsing.
 * Requires: opts.apiKey or GOOGLE_API_KEY env var
 */
export async function parseWithGemini(imageBuffer, opts = {}) {
  const apiKey = opts.apiKey || process.env.GOOGLE_API_KEY;
  const model = opts.model || 'gemini-2.5-flash';

  if (!apiKey) throw new Error('Google API key not provided (opts.apiKey or GOOGLE_API_KEY)');

  const promptText = `${PROMPT}\n\nInvoice Image attached. Extract invoice fields and return VALID JSON ONLY.`;

  // Try to use the @google/genai client if available and pass the image directly.
  try {
    if (GoogleGenAI) {
      let client = new GoogleGenAI({ apiKey });
      const b64 = imageBuffer.toString('base64');
      const imagePayload = { mimeType: opts.mimeType || 'image/png', data: b64 };
      const resp = await client.models.generateContent({
        model,
        contents: [
          {
            inlineData: imagePayload,
          },
          { text: promptText },
        ],
      });
      console.log('Gemini response:', JSON.stringify(resp));
        const data = resp?.data || resp || {};
        const content = data?.candidates?.[0]?.content.parts[0].text || data?.candidates?.[0]?.content || data?.output?.[0]?.content || data?.output?.text || data?.text || JSON.stringify(data);
        return content;
    }
  } catch (err) {
    console.error('Error using Google GenAI client:', err);
    // genai client not available or failed — fall back to OCR + REST
  }

  return extractJsonFromContent(content);
}

// Export helper for tests/debugging
export { extractJsonFromContent };

