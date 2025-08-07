var express = require('express');
var router = express.Router();
const { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
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
                degree: z.string(),
                field: z.string().optional(),
                university: z.string(),
                location: z.string().optional(),
                startDate: z.string().optional(),
                endDate: z.string().optional()
            })
        ),
        skills: z.array(z.string()),
        projects: z.array(
            z.object({
                name: z.string(),
                description: z.string(),
                techStack: z.array(z.string()).optional(),
                link: z.string().url().optional()
            })
        ).optional(),
    })
);

const formatInstructions = parser.getFormatInstructions();


router.post('/v1/parseresume', async function (req, res, next) {
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

module.exports = router;