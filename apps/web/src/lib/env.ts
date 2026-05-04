export interface WebEnv {
  baseUrl: string
  staticHost: string
  runEnv: string
  revalidateSeconds: number
  databaseUrl: string
  s3Endpoint: string
  s3Region: string
  s3AccessKey: string
  s3SecretKey: string
  s3Bucket: string
  s3ForcePathStyle: boolean
}

export function getWebEnv(): WebEnv {
  return {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    staticHost: process.env.NEXT_STATIC_HOST || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000/static',
    runEnv: process.env.WORKER_ENV || 'production',
    revalidateSeconds: Number.parseInt(process.env.NEXT_REVALIDATE_SECONDS || '600', 10),
    databaseUrl: required('DATABASE_URL'),
    s3Endpoint: required('S3_ENDPOINT'),
    s3Region: process.env.S3_REGION || 'us-east-1',
    s3AccessKey: required('S3_ACCESS_KEY'),
    s3SecretKey: required('S3_SECRET_KEY'),
    s3Bucket: required('S3_BUCKET'),
    s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') !== 'false',
  }
}

function required(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}
