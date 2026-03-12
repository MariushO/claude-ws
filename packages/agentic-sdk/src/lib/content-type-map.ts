/**
 * Canonical MIME type mapping for file format extensions.
 * Used by attempt routes to set Content-Type headers for formatted output files.
 */

const contentTypes: Record<string, string> = {
  // Data formats
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',

  // Web formats
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  scss: 'text/css',
  sass: 'text/css',
  less: 'text/css',
  js: 'application/javascript',
  jsx: 'application/javascript',
  mjs: 'application/javascript',
  cjs: 'application/javascript',
  ts: 'application/typescript',
  tsx: 'application/typescript',
  md: 'text/markdown',
  mdx: 'text/markdown',

  // Office documents
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',

  // Archives
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',

  // Executables / shared libraries
  exe: 'application/vnd.microsoft.portable-executable',
  dll: 'application/vnd.microsoft.portable-executable',
  so: 'application/octet-stream',
  dylib: 'application/octet-stream',
  app: 'application/octet-stream',

  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',

  // Fonts
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',

  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',

  // PDF
  pdf: 'application/pdf',
};

/**
 * Get the MIME content type for a given file format/extension.
 * Defaults to 'application/octet-stream' if unknown.
 */
export function getContentTypeForFormat(format: string): string {
  return contentTypes[format.toLowerCase()] || 'application/octet-stream';
}

/**
 * Get the MIME content type for a dotted file extension (e.g., '.json', '.ts').
 * Strips the leading dot and delegates to the canonical map.
 */
export function getContentTypeForExtension(ext: string): string {
  const format = ext.startsWith('.') ? ext.slice(1) : ext;
  return getContentTypeForFormat(format);
}
