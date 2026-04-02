declare module 'cookie' {
  export function parse(header: string): Record<string, string>;

  export interface CookieSerializeOptions {
    domain?: string;
    encode?(value: string): string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: boolean | 'lax' | 'strict' | 'none';
    secure?: boolean;
  }

  export function serialize(
    name: string,
    value: string,
    options?: CookieSerializeOptions,
  ): string;
}
