import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Endpoint browsers use for presigned links, when it differs from the internal one (e.g. http://minio:9000 vs https://files.example.com). */
  publicEndpoint?: string;
}

/** Read the S3_* variables (already validated by @newsflow/config). */
export function objectStorageConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStorageConfig {
  const required = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  return {
    endpoint: required('S3_ENDPOINT'),
    region: env.S3_REGION || 'us-east-1',
    bucket: required('S3_BUCKET'),
    accessKeyId: required('S3_ACCESS_KEY'),
    secretAccessKey: required('S3_SECRET_KEY'),
    forcePathStyle: (env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    publicEndpoint: env.S3_PUBLIC_URL || undefined,
  };
}

/** Thin wrapper over S3 / MinIO for files that are too big for the database (uploads, rendered videos). */
export class ObjectStorage {
  private readonly client: S3Client;
  private readonly publicClient: S3Client;
  readonly bucket: string;

  constructor(config: ObjectStorageConfig = objectStorageConfigFromEnv()) {
    const base = {
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    };
    this.client = new S3Client({ ...base, endpoint: config.endpoint });
    this.publicClient = config.publicEndpoint
      ? new S3Client({ ...base, endpoint: config.publicEndpoint })
      : this.client;
    this.bucket = config.bucket;
  }

  /** Create the bucket if it does not exist (development / first start). */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async putBuffer(key: string, body: Buffer, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async putFile(key: string, file: string, contentType?: string): Promise<void> {
    const { size } = await fs.stat(file);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(file),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
  }

  /** Download an object to a local file. */
  async getToFile(key: string, file: string): Promise<void> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Object ${key} has no body`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await pipeline(res.Body as Readable, createWriteStream(file));
  }

  /** Time-limited download link; `downloadName` makes the browser save it under that name. */
  async presignGet(key: string, expiresInSeconds = 3600, downloadName?: string): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: downloadName
          ? `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
          : undefined,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Delete every object under a prefix (e.g. everything of one video job). */
  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }),
        );
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }
}
