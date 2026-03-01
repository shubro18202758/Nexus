declare module 'qrcode-terminal' {
    export function generate(text: string, options?: { small: boolean }): void;
    export function setError(cb: (error: any) => void): void;
}
