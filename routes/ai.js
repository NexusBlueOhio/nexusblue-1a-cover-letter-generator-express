const Ollama = require("@langchain/ollama");
var express = require('express');
var router = express.Router();

const llm = new Ollama.Ollama({
    model: "gemma3:4b",
    temperature: 0,
    maxRetries: 2,
});

router.post('/v1/parseresume', async function (req, res, next) {
    const rawPDF = req.body.rawpdf;

    const completion = await llm.invoke(rawPDF);
    console.log(completion);
    res.send(completion);
});

module.exports = router;