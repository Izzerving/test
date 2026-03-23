declare module "mailparser" {
  export interface AddressObject {
    value?: Array<{ address?: string }>;
  }

  export interface AttachmentLike {
    filename?: string | null;
    size?: number;
  }

  export interface ParsedMailLike {
    attachments?: AttachmentLike[];
    to?: AddressObject;
    from?: AddressObject;
    subject?: string;
    text?: string;
    html?: string | false;
    messageId?: string;
  }

  export function simpleParser(input: string | Buffer): Promise<ParsedMailLike>;
}
