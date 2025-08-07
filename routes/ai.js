var express = require('express');
var router = express.Router();
const Ollama = require("@langchain/ollama");
const { StructuredOutputParser } = require('@langchain/core/output_parsers')
const { z } = require('zod');

const llm = new Ollama.Ollama({
    model: "gemma3:4b",
    temperature: 0,
    maxRetries: 2,
});

const parser = StructuredOutputParser.fromZodSchema(
    z.object({
        name: z.string().nullable(),
        email: z.string().email().nullable(),
        experience: z.array(z.string().nullable()).nullable(),
        education: z.array(z.string().nullable()).nullable()
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

    const result = await parser.parse(await llm.invoke(prompt));
    res.send(result);
});

module.exports = router;