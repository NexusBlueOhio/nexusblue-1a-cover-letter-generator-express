// services/gcs.js
const { Storage } = require('@google-cloud/storage');

function getServiceAccountFromEnv() {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
    }
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    // Handle escaped newlines in env
    if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    return sa;
}

const sa = getServiceAccountFromEnv();

const storage = new Storage({
    projectId: sa.project_id,
    credentials: {
        client_email: sa.client_email,
        private_key: sa.private_key,
    },
});

/**
 * Resolve a bucket object. Uses env GCS_BUCKET if bucketName not passed.
 */
function getBucket(bucketName = process.env.GCS_BUCKET) {
    if (!bucketName) {
        throw new Error("Bucket name not provided and GCS_BUCKET env not set");
    }
    return storage.bucket(bucketName);
}

/**
 * Check if a file exists.
 */
async function fileExists({ bucketName, destFileName }) {
    const file = getBucket(bucketName).file(destFileName);
    const [exists] = await file.exists();
    return exists;
}

/**
 * Upload a raw buffer to GCS.
 */
async function uploadBuffer({
    bucketName,
    destFileName,
    buffer,
    contentType,
    cacheControl = "no-cache",
    resumable = false,
    metadata = {},
}) {
    const file = getBucket(bucketName).file(destFileName);
    await file.save(buffer, {
        contentType,
        resumable,
        metadata: { cacheControl, ...metadata },
    });
    return file;
}

/**
 * Save text content as a file (e.g., YAML, JSON, TXT).
 */
async function saveText({
    bucketName,
    destFileName,
    text,
    contentType = "text/plain; charset=utf-8",
    cacheControl = "no-cache",
    resumable = false,
    metadata = {},
}) {
    const file = getBucket(bucketName).file(destFileName);
    await file.save(Buffer.from(text, "utf-8"), {
        contentType,
        resumable,
        metadata: { cacheControl, ...metadata },
    });
    return file;
}

/**
 * Optional helpers
 */
function fileRef({ bucketName, destFileName }) {
    return getBucket(bucketName).file(destFileName);
}

module.exports = {
    storage,
    getBucket,
    fileExists,
    uploadBuffer,
    saveText,
    fileRef,
};
