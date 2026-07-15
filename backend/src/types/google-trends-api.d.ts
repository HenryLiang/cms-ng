declare module 'rss-parser' {
  export default class Parser {
    constructor(options?: unknown);
    parseURL<T = unknown>(url: string): Promise<T>;
    parseString<T = unknown>(xml: string): Promise<T>;
  }
}
