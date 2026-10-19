import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

interface ValidatorError {
  path?: string;
  message?: string;
}

interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}

const TITLES: Record<number, string> = {
  400: "Bad Request",
  404: "Not Found",
  405: "Method Not Allowed",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  500: "Internal Server Error",
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const problem = this.toProblem(exception, req);

    res
      .status(problem.status)
      .setHeader("Content-Type", "application/problem+json")
      .send(JSON.stringify(problem));
  }

  private toProblem(exception: unknown, req: Request): Problem {
    const instance = req.originalUrl;

    const err = exception as {
      status?: number;
      message?: string;
      errors?: ValidatorError[];
    };
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (err?.status ?? 500);

    if (status >= 500) {
      const cause = err?.errors?.length
        ? err.errors.map((e) => `${e.path}: ${e.message}`).join("; ")
        : err?.message;
      this.logger.error(`${req.method} ${instance} -> ${cause}`);
      return {
        type: "about:blank",
        title: TITLES[500],
        status: 500,
        detail: "An unexpected error occurred",
        instance,
      };
    }

    const title = TITLES[status] ?? "Error";
    const detail = err?.errors?.length
      ? err.errors.map((e) => `${e.path}: ${e.message}`).join("; ")
      : (this.messageOf(exception) ?? title);

    return {
      type:
        status === 400 && err?.errors?.length
          ? "https://api.marketplace.example/problems/validation-error"
          : "about:blank",
      title,
      status,
      detail,
      instance,
    };
  }

  private messageOf(exception: unknown): string | undefined {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === "string"
          ? body
          : (body as { message?: string | string[] }).message;
      return Array.isArray(message) ? message.join("; ") : message;
    }
    return (exception as { message?: string })?.message;
  }
}
