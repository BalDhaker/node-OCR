const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = 3000;
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});
app.use(express.static('llm'));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'llm', 'index.html'));
});
app.post('/extract-text', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }
  try { 
    const imageBase64 = req.file.buffer.toString('base64');
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'deepseek-ocr', 
      prompt: `You are an OCR and document-understanding expert. Extract every piece of readable text from the provided image with maximum accuracy.

The image may be an **invoice**, **label**, **electronic device**, or **appliance**.  
Your output format must automatically adapt as follows:

-------------------------------------------------------
### 1. If the image is an INVOICE:
Return a clean, well-structured JSON object with fields:

{
  "invoice_number": "",
  "invoice_date": "",
  "due_date": "",
  "seller": {
    "name": "",
    "address": "",
    "contact": ""
  },
  "buyer": {
    "name": "",
    "address": "",
    "contact": ""
  },
  "items": [
    {
      "description": "",
      "quantity": "",
      "unit_price": "",
      "amount": ""
    }
  ],
  "subtotal": "",
  "tax": "",
  "total": "",
  "currency": "",
  "additional_notes": ""
}

- If any field is missing in the image, return "" (empty string)  
- Do NOT hallucinate any values  
- Preserve all numbers exactly as seen  

-------------------------------------------------------
### 2. For LABELS or ELECTRONIC DEVICES/APPLIANCES:
Return a simple clean text output with:

- All readable text
- Model number
- Serial number
- Power ratings
- Certifications
- Instructions
- Manufacturer
- Any warnings or fine print

Format:
{
"type": "label" | "device",
"text": "<all extracted text>",
"key_fields": {
"model": "",
"serial": "",
"power_rating": "",
"manufacturer": ""
}
}
-------------------------------------------------------
### IMPORTANT RULES
- Extract **all visible text**, even if small or repeated.
- Maintain line breaks where possible.
- Do NOT make assumptions about missing information.
- Do NOT include interpretation—only extraction.

Now extract the text following the above rules.`,
      images: [imageBase64],
      stream: false
    });
    res.json({ extractedText: response.data.response });
  } catch (error) {
    console.error('Error calling Ollama API:', error.message);
    res.status(500).json({ error: 'Failed to extract text from image' });
  }
});
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});