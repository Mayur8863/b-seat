import { applyDecorators } from '@nestjs/common';
import { ApiQuery, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

interface ObjectJsonSchema {
  $ref?: string;
  definitions?: Record<string, ObjectJsonSchema>;
  properties?: Record<string, SchemaObject>;
  required?: string[];
}

/** A root schema with `.meta({ id })` converts to `{ $ref, definitions }`; follow the ref. */
function resolveRoot(json: ObjectJsonSchema): ObjectJsonSchema {
  const id = json.$ref?.replace('#/definitions/', '');
  return (id === undefined ? undefined : json.definitions?.[id]) ?? json;
}

/**
 * Documents every property of a Zod object schema as its own query parameter. Pair it with
 * `@Query({ schema })`, which still validates.
 *
 * Why: `@nestjs/swagger` only expands an inline object schema into query parameters. A schema
 * with `.meta({ id })` (required for named request schemas, AGENTS.md) converts to a `$ref`,
 * and the parameters are silently dropped from the contract.
 */
export function ApiQueryFromSchema(schema: z.core.$ZodType): MethodDecorator {
  const json = resolveRoot(
    z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as ObjectJsonSchema,
  );
  const required = new Set(json.required ?? []);
  const decorators = Object.entries(json.properties ?? {}).map(([name, { description, ...rest }]) =>
    ApiQuery({
      name,
      required: required.has(name),
      ...(description !== undefined && { description }),
      schema: rest,
    }),
  );
  return applyDecorators(...decorators);
}
