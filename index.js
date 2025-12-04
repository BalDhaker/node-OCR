const express = require('express');
const multer = require('multer');
const { createWorker } = require('tesseract.js');

const app = express();
const port = 3000;

let worker;
let workerReady = false;

// Function to initialize the Tesseract worker
const initializeTesseract = async () => {
  try {
    console.log('Creating Tesseract worker...');
    worker = await createWorker();
    console.log('Loading language model (eng)...');
    await worker.load('eng');
    console.log('Initializing language model...');
    await worker.reinitialize('eng');
    console.log('Tesseract worker initialized successfully.');
    workerReady = true;
  } catch (error) {
    console.error('Failed to initialize Tesseract worker:', error);
    process.exit(1); // Exit if the worker fails to initialize
  }
};

// Start the initialization
initializeTesseract();


// Serve static files from the 'public' directory
app.use(express.static('public'));

// Set up multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!workerReady) {
    return res.status(503).send('Server is not ready yet, please try again in a moment.');
  }
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    console.log('Recognizing text from image...');
    const { data: { text } } = await worker.recognize(req.file.buffer);
    console.log('Recognition successful.');
    res.json({ text });
  } catch (error) {
    console.error('Error during OCR processing:', error);
    res.status(500).send('Error processing image.');
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

