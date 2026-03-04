/**
 * Testes unitários para lib/errors: ChatbotError e getMessageByErrorCode.
 */
import { describe, expect, it } from "vitest";
import {
  ChatbotError,
  getMessageByErrorCode,
  visibilityBySurface,
} from "@/lib/errors";

describe("getMessageByErrorCode", () => {
  it("retorna mensagem para database", () => {
    expect(getMessageByErrorCode("bad_request:database")).toContain(
      "base de dados"
    );
  });

  it("retorna mensagem para bad_request:api", () => {
    expect(getMessageByErrorCode("bad_request:api")).toContain(
      "couldn't be processed"
    );
  });

  it("retorna mensagem para unauthorized:auth", () => {
    expect(getMessageByErrorCode("unauthorized:auth")).toContain("sign in");
  });

  it("retorna mensagem para rate_limit:chat", () => {
    expect(getMessageByErrorCode("rate_limit:chat")).toMatch(
      /exceeded|maximum|messages/i
    );
  });

  it("retorna mensagem para not_found:chat", () => {
    expect(getMessageByErrorCode("not_found:chat")).toContain("not found");
  });

  it("retorna mensagem genérica para código desconhecido", () => {
    expect(
      getMessageByErrorCode("bad_request:stream" as "bad_request:api")
    ).toBe("Something went wrong. Please try again later.");
  });
});

describe("ChatbotError", () => {
  it("instancia com errorCode e preenche type, surface, statusCode", () => {
    const err = new ChatbotError("unauthorized:auth");
    expect(err.type).toBe("unauthorized");
    expect(err.surface).toBe("auth");
    expect(err.statusCode).toBe(401);
    expect(err.message).toContain("sign in");
  });

  it("aceita cause opcional", () => {
    const err = new ChatbotError("bad_request:api", "Validation failed");
    expect(err.cause).toBe("Validation failed");
  });

  it("mapeia tipos para status HTTP corretos", () => {
    expect(new ChatbotError("bad_request:api").statusCode).toBe(400);
    expect(new ChatbotError("forbidden:chat").statusCode).toBe(403);
    expect(new ChatbotError("not_found:document").statusCode).toBe(404);
    expect(new ChatbotError("rate_limit:chat").statusCode).toBe(429);
    expect(new ChatbotError("offline:chat").statusCode).toBe(503);
  });
});

describe("toResponse", () => {
  it("devolve Response com code, message e statusCode para surface response", async () => {
    const err = new ChatbotError("unauthorized:auth");
    const res = err.toResponse();
    expect(res.status).toBe(401);
    const json = (await res.json()) as { code: string; message: string };
    expect(json.code).toBe("unauthorized:auth");
    expect(json.message.length).toBeGreaterThan(0);
  });

  it("para surface response (database) devolve code, message e cause ao cliente", async () => {
    const err = new ChatbotError("bad_request:database", "Mensagem de teste");
    const res = err.toResponse();
    const json = (await res.json()) as {
      code: string;
      message: string;
      cause?: string;
    };
    expect(json.code).toBe("bad_request:database");
    expect(json.message).toContain("base de dados");
    expect(json.cause).toBe("Mensagem de teste");
  });
});

describe("visibilityBySurface", () => {
  it("database tem visibility response para mostrar mensagem ao utilizador", () => {
    expect(visibilityBySurface.database).toBe("response");
  });

  it("chat e auth têm visibility response", () => {
    expect(visibilityBySurface.chat).toBe("response");
    expect(visibilityBySurface.auth).toBe("response");
  });
});
