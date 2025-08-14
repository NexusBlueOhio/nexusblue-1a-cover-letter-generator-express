var express = require('express');
var router = express.Router();
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { StructuredOutputParser } = require('@langchain/core/output_parsers')
const { z } = require('zod');
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

//pdf upload
const fs = require('fs');
const { google } = require('googleapis');

const apikeys = require('./nexusblue-resume-app-d86f35e79ad7.json')

const SCOPE = ["https://www.googleapis.com/auth/drive"]

async function authorize() {
    const jwtClient = new google.auth.JWT(
        apikeys.client_email,
        null,
        apikeys.private_key,
        SCOPE
    )
    await jwtClient.authorize();

    return jwtClient;
}

async function uploadFile(authClient) {
    return new Promise((resolve, rejected) => {
        const drive = google.drive({ version: 'v3', auth: authClient });
        var fileMetaData = {
            name: "",
            parents: ["1fqSSDHJ_LooROdZ9FBoxneJvAiK0W_fo"]
        }

        drive.files.create({
            resource: fileMetaData,
            media: {
                body: fs.createReadStream("/home/v/Desktop/01 Projects/Resume/docx/vinit-jain-resume.pdf"),
                mimeType: 'application/pdf'
            },
            fields: 'id'
        }, (err, file) => {
            if (err) {
                return rejected(err)
            };
            resolve(file);
        });
    })
}



module.exports = router;