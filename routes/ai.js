var express = require("express");
var router = express.Router();
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { StructuredOutputParser } = require("@langchain/core/output_parsers");
const { z } = require("zod");
require("dotenv").config();
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: process.env.GOOGLE_API_KEY,
  temperature: 0,
  maxRetries: 2,
});

const upload = multer({ dest: "uploads/" });

const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    current_job_title: z.string().optional(),
    current_company: z.string().optional(),
    summary: z.string().optional(),
    portfolio_url: z.string().optional(),
    experience: z
      .array(
        z.object({
          title: z.string(),
          company: z.string(),
          location: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          description: z.string().optional(),
        }),
      )
      .optional(),
    education: z
      .array(
        z.object({
          institute_name: z.string(),
          start_date: z.string().optional(),
          end_date: z.string().optional(),
          degree: z.string(),
          field_of_study: z.string().optional(),
          location: z.string().optional(),
          is_ongoing: z.string().optional(),
        }),
      )
      .default([]),
    skills: z.array(z.string()).default([]),
    projects: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
          techStack: z.array(z.string()).optional(),
          link: z.string().url().optional().or(z.literal("")),
        }),
      )
      .optional(),
  }),
);

const formatInstructions = parser.getFormatInstructions();

router.post("/v1/parseresume", async function (req, res) {
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

async function getAccessToken() {
  console.log("Attempting to get a new access token...");
  try {
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID,
        scope: "https://graph.microsoft.com/.default",
        client_secret: process.env.AZURE_CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    console.log("Access token received successfully.");
    return {
      token: tokenResponse.data.access_token,
      expiresAt: Date.now() + tokenResponse.data.expires_in * 1000,
    };
  } catch (error) {
    console.error(
      "Error getting access token:",
      error.response ? error.response.data : error.message,
    );
    throw new Error("Could not get access token.");
  }
}

let currentToken = { token: null, expiresAt: 0 };

async function getOrRefreshAccessToken() {
  if (currentToken.token && currentToken.expiresAt > Date.now() + 60000) {
    return currentToken.token;
  }
  currentToken = await getAccessToken();
  return currentToken.token;
}

router.post("/v1/uploadpdf", upload.single("pdf"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const filePath = req.file.path;
  const fileName = req.file.originalname;

  try {
    const accessToken = await getOrRefreshAccessToken();
    const fileContent = fs.readFileSync(filePath);

    // Endpoint for uploading a small file to a specific user's drive
    const uploadEndpoint = `https://graph.microsoft.com/v1.0/users/${process.env.AZURE_TARGET_USER_ID}/drive/root:/resumes/${fileName}:/content`;

    await axios.put(uploadEndpoint, fileContent, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": req.file.mimetype,
      },
    });

    // Clean up the temporary file after upload
    fs.unlinkSync(filePath);

    res
      .status(200)
      .send(
        `File '${fileName}' uploaded successfully to the designated OneDrive!`,
      );
  } catch (error) {
    console.error(
      "Error uploading file:",
      error.response ? error.response.data : error.message,
    );
    res.status(500).send("File upload failed.");
  }
});
module.exports = router;
