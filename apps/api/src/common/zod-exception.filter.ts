import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { ZodError } from "zod";

@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const first = exception.issues[0];
    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: 400,
      message: first?.message || "Datos inválidos",
      violations: exception.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
}
