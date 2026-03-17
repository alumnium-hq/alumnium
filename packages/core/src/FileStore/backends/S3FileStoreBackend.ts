import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import path from "node:path";
import type { FileStore } from "../FileStore.js";

export namespace S3FileStoreBackend {
  export interface Init extends FileStore.BackendInit<"s3"> {
    region: string;
    bucket: string;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    sessionToken?: string | undefined;
    endpoint?: string | undefined;
    forcePathStyle?: boolean | undefined;
    prefix?: string | undefined;
  }
}

export class S3FileStoreBackend implements FileStore.Backend {
  #init: S3FileStoreBackend.Init;
  #client: S3Client;

  constructor(init: S3FileStoreBackend.Init) {
    this.#init = init;

    const config: S3ClientConfig = {
      region: init.region,
    };

    if (init.endpoint) {
      config.endpoint = init.endpoint;
    }

    if (init.forcePathStyle !== undefined) {
      config.forcePathStyle = init.forcePathStyle;
    }

    if (init.accessKeyId && init.secretAccessKey) {
      const credentials: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
      } = {
        accessKeyId: init.accessKeyId,
        secretAccessKey: init.secretAccessKey,
      };

      if (init.sessionToken) {
        credentials.sessionToken = init.sessionToken;
      }

      config.credentials = {
        ...credentials,
      };
    }

    this.#client = new S3Client(config);
  }

  async ensureFilePath(storeDir: string, relPath: string): Promise<string> {
    return path.join(storeDir, relPath);
  }

  async ensureDir(storeDir: string, relPath: string): Promise<string> {
    return path.join(storeDir, relPath);
  }

  async writeFile(
    storeDir: string,
    relPath: string,
    data: Buffer | string,
  ): Promise<string> {
    const filePath = path.join(storeDir, relPath);
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#init.bucket,
        Key: this.#key(filePath),
        Body: data,
      }),
    );
    return filePath;
  }

  async readText(storeDir: string, relPath: string): Promise<string | null> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#init.bucket,
          Key: this.#key(path.join(storeDir, relPath)),
        }),
      );
      if (!response.Body) return null;
      return response.Body.transformToString();
    } catch (error) {
      if (isS3NotFoundError(error)) return null;
      throw error;
    }
  }

  async clear(storeDir: string): Promise<void> {
    const prefix = this.#dirPrefix(storeDir);
    let continuationToken: string | undefined;

    while (true) {
      const listResponse = await this.#client.send(
        new ListObjectsV2Command({
          Bucket: this.#init.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects =
        listResponse.Contents?.flatMap((entry) =>
          entry.Key ? [{ Key: entry.Key }] : [],
        ) ?? [];
      if (objects.length) {
        await this.#client.send(
          new DeleteObjectsCommand({
            Bucket: this.#init.bucket,
            Delete: {
              Objects: objects,
              Quiet: true,
            },
          }),
        );
      }

      if (!listResponse.IsTruncated) return;
      continuationToken = listResponse.NextContinuationToken;
    }
  }

  async listDirs(storeDir: string, relPath: string): Promise<string[]> {
    const prefix = this.#dirPrefix(path.join(storeDir, relPath));
    const response = await this.#client.send(
      new ListObjectsV2Command({
        Bucket: this.#init.bucket,
        Prefix: prefix,
        Delimiter: "/",
      }),
    );

    const dirs = response.CommonPrefixes?.map((entry) => {
      const commonPrefix = entry.Prefix ?? "";
      const relative = commonPrefix.slice(prefix.length);
      return relative.replace(/\/$/, "");
    }).filter(Boolean);

    return dirs ?? [];
  }

  #key(filePath: string): string {
    return buildS3Key(this.#init.prefix, filePath);
  }

  #dirPrefix(dirPath: string): string {
    return `${buildS3Key(this.#init.prefix, dirPath)}/`;
  }
}

function buildS3Key(prefix: string | undefined, value: string): string {
  const normalizedPrefix = normalizePath(prefix ?? "");
  const normalizedValue = normalizePath(value);
  if (!normalizedPrefix) return normalizedValue;
  return `${normalizedPrefix}/${normalizedValue}`;
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function isS3NotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (!("name" in error)) return false;
  return error.name === "NoSuchKey";
}
