export class ClientError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ClientError";
    this.statusCode = statusCode;
  }
}
