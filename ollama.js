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
      model: 'gemma3:12b',
      prompt: `Analyze entire image and extract all readable text with maximum accuracy in JSON format. provided image is of an invoice document. Return clear JSON output, skip any QR codes or barcodes present in the image. return only text values as seen in the image without any interpretation or assumptions. If any field is missing, return empty string for that field. Do NOT hallucinate any values. Preserve all numbers exactly as seen.`,
      images: [imageBase64],
      stream: false
    });
    res.json({ extractedText: response.data.response });
  } catch (error) {
    console.error('Error calling Ollama API:', JSON.stringify(error.response?.data || error.message));
    res.status(500).json({ error: 'Failed to extract text from image' });
  }
});
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});