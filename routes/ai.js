const express = require('express');
const router = express.Router();
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { StructuredOutputParser } = require('@langchain/core/output_parsers')
const { Storage } = require('@google-cloud/storage');
const { z } = require('zod');
const multer = require("multer");
const crypto = require("crypto");
const pdfParse = require("pdf-parse")
require("dotenv").config();

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

router.post('/v1/parseresume', async function (req, res) {
  const rawPDF = req.body.rawpdf;
  const result = await parseResume(rawPDF)
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
// const bucketName = "nexusblue_resumes";
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
    const destTxtName = `parsed/${hash}.txt`;

    // Create a file object in the bucket
    const file = bucket.file(destFileName);
    const txtFile = bucket.file(destTxtName);

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

    // Extract text from PDF buffer
    const pdfData = await pdfParse(req.file.buffer);
    const pdfText = pdfData.text;

    // Parse resume
    const resumeDetails = await parseResume(pdfText)

    // TODO save the txt file as well

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