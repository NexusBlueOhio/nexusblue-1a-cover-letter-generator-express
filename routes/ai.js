var express = require('express');
var router = express.Router();

router.post('/v1/parseresume', function (req, res, next) {
    const rawPDF = req.body.rawpdf;

    res.send(rawPDF)
});

module.exports = router;