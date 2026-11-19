// Type declarations for document-parsing libraries that ship without TypeScript types.

declare module 'word-extractor' {
  interface ExtractedDocument {
    getBody(): string;
    getHeaders?(): string;
    getFooters?(): string;
    getFootnotes?(): string;
  }
  export default class WordExtractor {
    extract(source: string | Buffer): Promise<ExtractedDocument>;
  }
}

declare module 'pdf-parse/lib/pdf-parse.js' {
  export default function pdfParse(data: Buffer): Promise<{ text: string; numpages: number }>;
}
