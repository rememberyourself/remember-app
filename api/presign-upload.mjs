import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || 'remember-uploads';
const PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g. https://pub-xxx.r2.dev

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { extension, contentType } = req.body;

    if (!extension || !contentType) {
      return res.status(400).json({ error: 'extension and contentType required' });
    }

    const filename = `${crypto.randomUUID()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: filename,
      ContentType: contentType,
    });

    // Presigned URL valid for 10 minutes
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 600 });

    const publicUrl = `${PUBLIC_URL}/${filename}`;

    return res.status(200).json({
      presignedUrl,
      publicUrl,
      filename,
    });
  } catch (error) {
    console.error('Presign error:', error);
    return res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
}
