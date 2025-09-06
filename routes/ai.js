const express = require('express');
const router = express.Router();
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { StructuredOutputParser } = require('@langchain/core/output_parsers');
const { z } = require('zod');
const multer = require("multer");
const crypto = require("crypto");
const pdfParse = require("pdf-parse");
const YAML = require('yaml');

// import your GCS helpers
const { fileExists, uploadBuffer, saveText } = require('../services/gcs');

// Prefer env bucket (fallback to your current default)
const BUCKET_NAME = process.env.GCS_BUCKET || "nexusblue_resumes";

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: process.env.GOOGLE_API_KEY,
  temperature: 0,
  maxRetries: 2,
});

const nullishString = z.string().nullish();
const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    name: z.string(),
    email: z.string().email(),
    phone: nullishString,
    current_job_title: nullishString,
    current_company: nullishString,
    summary: nullishString,
    portfolio_url: nullishString,
    experience: z.array(
      z.object({
        title: nullishString,
        company: nullishString,
        location: nullishString,
        startDate: nullishString,
        endDate: nullishString,
        description: nullishString
      })
    ).nullish(),
    education: z.array(
      z.object({
        institute_name: nullishString,
        degree: nullishString,
        start_date: nullishString,
        end_date: nullishString,
        field_of_study: nullishString,
        location: nullishString,
        is_ongoing: z.union([z.string(), z.boolean()]).nullish()
      })
    ).nullish(),
    skills: z.array(z.string()).nullable(),
    projects: z.array(
      z.object({
        name: nullishString,
        description: nullishString,
        techStack: z.array(z.string()).nullable(),
        link: z.union([z.string().url(), z.literal("")]).nullish()
      })
    ).nullish(),
  })
);

function sanitizeForFileName(name, fallback) {
  if (!name || typeof name !== 'string') return fallback;
  let s = name.normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (s.length === 0) s = fallback;
  if (s.length > 80) s = s.slice(0, 80);
  return s;
}

const formatInstructions = parser.getFormatInstructions();

async function parseResume(rawPDF) {
  const prompt = `
      Extract the following information from the resume text.
      ${formatInstructions}

      Raw PDF Resume extract:
      ${rawPDF}`;
  const response = await llm.invoke(prompt);
  const result = await parser.parse(response.content);
  return result;
}

// ---- Multer config ----
const storageMulter = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed!"), false);
    }
    cb(null, true);
  },
});

// ---- Route ----
router.post("/v1/uploadpdf", storageMulter.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const destFileName = `${hash}.pdf`;

    // ✅ Use helper to check existence
    const exists = await fileExists({ bucketName: BUCKET_NAME, destFileName });
    if (exists) {
      console.log(`File with hash ${hash} already exists in ${BUCKET_NAME}`);
      return res.status(200).json({
        uploaded: false,
        message: "File already exists, skipping upload",
        fileName: destFileName,
        bucket: BUCKET_NAME,
        hash,
      });
    }

    // Extract text and parse with LLM
    const pdfData = await pdfParse(req.file.buffer);
    const pdfText = pdfData.text;

    const resumeDetails = await parseResume(pdfText);
    const resumeDetailsText = JSON.stringify(resumeDetails, null, 2);

    const candidate = sanitizeForFileName(resumeDetails?.name, 'unknown');
    const destTxtName = `parsed/${candidate}-${hash.slice(0, 8)}.txt`;

    // ✅ Save the parsed YAML/TXT
    await saveText({
      bucketName: BUCKET_NAME,
      destFileName: destTxtName,
      text: resumeDetailsText,
      contentType: "text/yaml; charset=utf-8",
      metadata: { cacheControl: "no-cache" },
    });

    // ✅ Upload the original PDF
    await uploadBuffer({
      bucketName: BUCKET_NAME,
      destFileName,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      metadata: { cacheControl: "no-cache" },
    });

    console.log(`Uploaded ${destFileName} to ${BUCKET_NAME}`);
    res.json({
      message: "File uploaded successfully",
      uploaded: true,
      fileName: destFileName,
      bucket: BUCKET_NAME,
      txtFileName: destTxtName,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed. Please check your pdf format." });
  }
});

module.exports = router;
