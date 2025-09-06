const express = require('express');
const router = express.Router();
// Note: Corrected path assuming gcs.js is in a parent services/ directory
const { listFiles, getFileContent } = require('../services/gcs');

const BUCKET_NAME = process.env.GCS_BUCKET || "nexusblue_resumes";

router.get('/test', (req, res) => {
    res.send('Candidates');
});

router.get('/all', async (req, res) => {
    const prefix = 'parsed/';

    try {
        const fileNames = await listFiles({ bucketName: BUCKET_NAME, prefix });

        // Filter out directory placeholders and fetch content for each file
        const filesWithContent = await Promise.all(
            fileNames
                .filter(file => !file.name.endsWith('/'))
                .map(async (file) => {
                    const fileName = file.name;
                    const content = await getFileContent({ bucketName: BUCKET_NAME, fileName });

                    // Extract name from filename like "parsed/john_doe-a1b2c3d4.txt"
                    const baseNameWithHash = fileName.substring(prefix.length, fileName.length - '.txt'.length);
                    const name = baseNameWithHash.slice(0, -9); // Remove the - and 8-char hash

                    return { name, fileName, content };
                })
        );

        res.json(filesWithContent);
    } catch (err) {
        console.error("Error fetching files from GCS:", err);
        res.status(500).send('Error fetching files from GCS');
    }
});

module.exports = router;
