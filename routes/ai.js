const express = require('express');
const router = express.Router();
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { StructuredOutputParser } = require('@langchain/core/output_parsers')
const { Storage } = require('@google-cloud/storage');
const { z } = require('zod');
const multer = require("multer");
const crypto = require("crypto");
require("dotenv").config();

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: process.env.GOOGLE_API_KEY,
  temperature: 0,
  maxRetries: 2,
});

const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    current_job_title: z.string().optional(),
    current_company: z.string().optional(),
    summary: z.string().optional(),
    portfolio_url: z.string().optional(),
    experience: z.array(
      z.object({
        title: z.string(),
        company: z.string(),
        location: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        description: z.string().optional()
      })
    ).optional(),
    education: z.array(
      z.object({
        institute_name: z.string(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        degree: z.string(),
        field_of_study: z.string().optional(),
        location: z.string().optional(),
        is_ongoing: z.string().optional()
      })
    ).default([]),
    skills: z.array(z.string()).default([]),
    projects: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        techStack: z.array(z.string()).optional(),
        link: z.string().url().optional().or(z.literal(""))
      })
    ).optional(),
  })
);

const formatInstructions = parser.getFormatInstructions();


router.post('/v1/parseresume', async function (req, res) {
  const rawPDF = req.body.rawpdf;

  const prompt = `
    Extract the following information from the resume text.
    ${formatInstructions}

    Raw PDF Resume extract:
    ${rawPDF}`;

  const response = await llm.invoke(prompt);
  const result = await parser.parse(response.content);
  res.send(result);
});

// TODO: move it to a different file with a different url prefix
//pdf upload

// setting up multer storage
const storageMulter = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed!"), false);
    }
    cb(null, true);
  },
});

// basic configs
const bucketName = "resume_collection";
const storage = new Storage();
const bucket = storage.bucket(bucketName);

// service
router.post("/v1/uploadpdf", storageMulter.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "No file uploaded" });

    // Use original filename or generate a unique one
    const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const destFileName = `${hash}.pdf`;

    // Create a file object in the bucket
    const file = bucket.file(destFileName);

    // Check if it already exists
    const [exists] = await file.exists();
    if (exists) {
      console.log(`File with hash ${hash} already exists in ${bucketName}`);
      return res.status(200).json({
        uploaded: false,
        message: "File already exists, skipping upload",
        fileName: destFileName,
        bucket: bucketName,
        hash,
      });
    }

    // Upload the buffer directly
    await file.save(req.file.buffer, {
      contentType: req.file.mimetype,
      resumable: false,
      metadata: {
        cacheControl: "no-cache",
      },
    });

    console.log(`Uploaded ${destFileName} to ${bucketName}`);
    res.json({
      message: "File uploaded successfully",
      uploaded: true,
      fileName: destFileName,
      bucket: bucketName,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});


module.exports = router;