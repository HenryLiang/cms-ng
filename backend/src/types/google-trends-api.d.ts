declare module 'rss-parser' {
  export default class Parser {
    constructor(options?: any);
    parseURL(url: string): Promise<any>;
    parseString(xml: string): Promise<any>;
  }
}
