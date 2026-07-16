// Tipos mínimos para pdfmake 0.3.x en Node (los @types oficiales son de 0.2.x).
declare module "pdfmake" {
  interface OutputDocument {
    getBuffer(): Promise<Buffer>;
    getStream(): Promise<NodeJS.ReadableStream>;
    write(filename: string): Promise<void>;
  }
  interface Pdfmake {
    addFonts(fonts: Record<string, unknown>): void;
    createPdf(docDefinition: Record<string, unknown>, options?: Record<string, unknown>): OutputDocument;
  }
  const pdfmake: Pdfmake;
  export = pdfmake;
}

declare module "pdfmake/standard-fonts/Helvetica.js" {
  const fonts: Record<string, unknown>;
  export = fonts;
}
