export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public data?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code: string, message?: string) => new HttpError(400, code, message);
export const unauthorized = () => new HttpError(401, 'UNAUTHORIZED', 'Please log in.');
export const forbidden = (message = 'You do not have access to this resource.') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (code: string, message?: string, data?: Record<string, unknown>) =>
  new HttpError(409, code, message, data);
