declare module 'data-masking' {
  export function masking(
    str: string,
    beginLen: number,
    endLen: number,
    replaceChar: string
  ): string;
}
